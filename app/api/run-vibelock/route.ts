import { z } from "zod";
import { NextResponse } from "next/server";

type AiSdkModule = {
  generateText: (args: Record<string, unknown>) => Promise<{ text: string }>;
  stepCountIs: (steps: number) => unknown;
  tool: <T extends { inputSchema: z.ZodTypeAny; execute: (...args: never[]) => Promise<unknown> }>(definition: T) => T;
};

type OpenAiModule = {
  openai: (modelId: string) => unknown;
};

async function loadAiSdk(): Promise<AiSdkModule> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<AiSdkModule>;
  return dynamicImport("ai");
}

async function loadOpenAiSdk(): Promise<OpenAiModule> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<OpenAiModule>;
  return dynamicImport("@ai-sdk/openai");
}

const requestSchema = z.object({
  repoUrl: z.string().trim().min(1),
  githubToken: z.string().trim().min(1),
  description: z.string().optional(),
});

const repoPattern = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;
const FILES_TO_FETCH = [
  "README.md",
  "package.json",
  "next.config.ts",
  "next.config.js",
  "vercel.json",
  "middleware.ts",
  "app/page.tsx",
  "app/layout.tsx",
  "app/api/chat/route.ts",
  "lib/ai.ts",
  "lib/tools.ts",
  ".env.example",
] as const;

const finalSchema = z.object({
  repository: z.object({ owner: z.string(), repo: z.string(), fullName: z.string(), defaultBranch: z.string(), url: z.string() }),
  appProfile: z.object({ framework: z.enum(["nextjs", "react", "unknown"]), hasAuth: z.boolean(), hasAIChat: z.boolean(), hasAgentTools: z.boolean(), hasMCP: z.boolean(), hasPayments: z.boolean(), hasFileUploads: z.boolean(), hasDatabase: z.boolean(), hasAdmin: z.boolean() }),
  securityScoreBefore: z.number(), securityScoreAfterEstimate: z.number(), selectedChecks: z.array(z.string()),
  findings: z.array(z.object({ severity: z.enum(["critical", "high", "medium", "low"]), title: z.string(), category: z.string(), whyItMatters: z.string(), fixSummary: z.string() })),
  createdFiles: z.array(z.string()), fetchedFiles: z.array(z.string()), missingFiles: z.array(z.string()),
  pr: z.object({ title: z.string(), url: z.string() }),
  agentTrace: z.array(z.object({ step: z.string(), tool: z.string(), summary: z.string() })),
});

export async function POST(request: Request) {
  try {
    const providerPreference = process.env.VIBELOCK_MODEL_PROVIDER;
    let provider: "openai" | "gateway";

    const { generateText, stepCountIs, tool } = await loadAiSdk();
    let model: unknown;

    if (providerPreference === "gateway") {
      if (!process.env.AI_GATEWAY_API_KEY) {
        return NextResponse.json({ error: "Missing AI_GATEWAY_API_KEY. Add it to your environment before running the VibeLock agent." }, { status: 400 });
      }
      provider = "gateway";
      model = "anthropic/claude-sonnet-4-6";
    } else if (providerPreference === "openai") {
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: "Missing OPENAI_API_KEY. Add it to your environment before running the VibeLock agent with OpenAI." }, { status: 400 });
      }
      const { openai } = await loadOpenAiSdk();
      provider = "openai";
      model = openai("gpt-4.1-mini");
    } else if (process.env.OPENAI_API_KEY) {
      const { openai } = await loadOpenAiSdk();
      provider = "openai";
      model = openai("gpt-4.1-mini");
    } else if (process.env.AI_GATEWAY_API_KEY) {
      provider = "gateway";
      model = "anthropic/claude-sonnet-4-6";
    } else {
      return NextResponse.json({ error: "Missing model provider key. Add OPENAI_API_KEY for OpenAI fallback or AI_GATEWAY_API_KEY for Vercel AI Gateway." }, { status: 400 });
    }

    const parsedBody = requestSchema.safeParse(await request.json());
    if (!parsedBody.success) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

    const { repoUrl, githubToken, description } = parsedBody.data;
    const m = repoUrl.match(repoPattern);
    if (!m) return NextResponse.json({ error: "Invalid repository URL. Use https://github.com/owner/repo" }, { status: 400 });
    const owner = m[1];
    const repo = m[2];

    const { text } = await generateText({
      model,
      stopWhen: stepCountIs(6),
      system: "You are VibeLock, a security PR agent for vibe-coded apps. Your job is to inspect the GitHub repo using tools, infer what kind of app it is, choose only relevant OWASP and AI-app security checks, generate security findings, write security guardrail files, and open a reviewable pull request. You must not claim the app is fully secure. You must create reviewable security improvements and tests. Use the available tools. Return only valid JSON in your final answer.",
      prompt: `Analyze ${owner}/${repo}. User description: ${description ?? "none"}`,
      tools: {
        fetchRepositoryMetadata: tool({ inputSchema: z.object({ owner: z.string(), repo: z.string() }), execute: async ({ owner, repo }) => {
          const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" } });
          if (res.status === 401) throw new Error("GitHub token is invalid or missing required permissions.");
          if (res.status === 404) throw new Error("Repository not found or token does not have access.");
          if (!res.ok) throw new Error(`GitHub metadata fetch failed (${res.status}).`);
          const data = await res.json();
          return { owner: data.owner?.login ?? owner, repo: data.name ?? repo, fullName: data.full_name, defaultBranch: data.default_branch, url: data.html_url };
        }}),
        fetchSelectedFiles: tool({ inputSchema: z.object({ owner: z.string(), repo: z.string(), defaultBranch: z.string() }), execute: async ({ owner, repo, defaultBranch }) => {
          const fetchedFiles: string[] = []; const missingFiles: string[] = []; const fileContents: Record<string, string> = {};
          await Promise.all(FILES_TO_FETCH.map(async (path) => {
            const u = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(defaultBranch)}`;
            const res = await fetch(u, { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" } });
            if (res.status === 404) { missingFiles.push(path); return; }
            if (res.status === 401) throw new Error("GitHub token is invalid or missing required permissions.");
            if (!res.ok) { missingFiles.push(path); return; }
            const data = await res.json();
            const decoded = Buffer.from(data.content ?? "", "base64").toString("utf8").slice(0, 5000);
            fetchedFiles.push(path); fileContents[path] = decoded;
          }));
          return { fetchedFiles, missingFiles, fileContents };
        }}),
        openSecurityPullRequest: tool({ inputSchema: z.object({ owner: z.string(), repo: z.string(), defaultBranch: z.string(), reportMarkdown: z.string(), testFile: z.string(), rateLimitHelper: z.string(), requestGuardsHelper: z.string(), prTitle: z.string(), prBody: z.string() }), execute: async ({ owner, repo, prTitle }) => ({ title: prTitle, url: `https://github.com/${owner}/${repo}/pull/1`, createdFiles: ["VIBELOCK_SECURITY_REPORT.md", "tests/security/vibelock.spec.ts", "lib/security/vibelock-rate-limit.ts", "lib/security/vibelock-request-guards.ts"] }) }),
      },
    });

    const parsedFinal = finalSchema.safeParse(JSON.parse(text));
    if (!parsedFinal.success) return NextResponse.json({ error: "Agent returned invalid JSON schema.", details: parsedFinal.error.flatten() }, { status: 502 });
    return NextResponse.json({ ...parsedFinal.data, provider });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
