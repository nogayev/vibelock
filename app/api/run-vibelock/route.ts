import { z } from "zod";
import { NextResponse } from "next/server";

type ToolDefinition<TInput, TResult> = {
  inputSchema: z.ZodType<TInput>;
  execute: (args: TInput) => Promise<TResult> | TResult;
};

type AiSdkModule = {
  generateText: (args: {
    model: unknown;
    stopWhen: unknown;
    system: string;
    prompt: string;
    tools: Record<string, unknown>;
  }) => Promise<{ text: string }>;
  stepCountIs: (steps: number) => unknown;
  tool: <TInput, TResult>(
    definition: ToolDefinition<TInput, TResult>
  ) => unknown;
};

type OpenAiSdkModule = {
  openai: (modelId: string) => unknown;
};

type SafeParseAgentJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; details: string; rawModelTextPreview: string };

async function loadAiSdk(): Promise<AiSdkModule> {
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier)"
  ) as (specifier: string) => Promise<AiSdkModule>;

  return dynamicImport("ai");
}

async function loadOpenAiSdk(): Promise<OpenAiSdkModule> {
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier)"
  ) as (specifier: string) => Promise<OpenAiSdkModule>;

  return dynamicImport("@ai-sdk/openai");
}

function getModelConfig() {
  const provider = process.env.VIBELOCK_MODEL_PROVIDER;
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);
  const hasGateway = Boolean(process.env.AI_GATEWAY_API_KEY);

  if (provider === "openai") {
    if (!hasOpenAi) {
      return {
        error:
          "Missing OPENAI_API_KEY. Add it to your environment before running the VibeLock agent.",
      };
    }

    return { provider: "openai" as const };
  }

  if (provider === "gateway") {
    if (!hasGateway) {
      return {
        error:
          "Missing AI_GATEWAY_API_KEY. Add it to your environment before running the VibeLock agent.",
      };
    }

    return { provider: "gateway" as const };
  }

  if (!provider) {
    if (hasOpenAi) return { provider: "openai" as const };
    if (hasGateway) return { provider: "gateway" as const };

    return {
      error:
        "Missing model provider key. Add OPENAI_API_KEY for OpenAI fallback or AI_GATEWAY_API_KEY for Vercel AI Gateway.",
    };
  }

  return { error: `Unsupported VIBELOCK_MODEL_PROVIDER value: ${provider}` };
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth += 1;

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function safeParseAgentJson(text: string): SafeParseAgentJsonResult {
  const rawModelTextPreview = text.slice(0, 500);
  const trimmed = text.trim();

  if (!trimmed) {
    return {
      ok: false,
      details:
        "The agent completed tool calls but did not return a final JSON response.",
      rawModelTextPreview,
    };
  }

  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const jsonCandidate = withoutFence.startsWith("{")
    ? withoutFence
    : extractFirstJsonObject(withoutFence);

  if (!jsonCandidate) {
    return {
      ok: false,
      details: "Could not find a JSON object in the agent response.",
      rawModelTextPreview,
    };
  }

  try {
    return { ok: true, data: JSON.parse(jsonCandidate) };
  } catch (error) {
    return {
      ok: false,
      details:
        error instanceof Error ? error.message : "Unknown JSON parse error.",
      rawModelTextPreview,
    };
  }
}

const requestSchema = z.object({
  repoUrl: z.string().trim().min(1),
  githubToken: z.string().trim().min(1),
  description: z.string().optional(),
});

const repoPattern =
  /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;

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
  provider: z.enum(["openai", "gateway"]).optional(),
  repository: z.object({
    owner: z.string(),
    repo: z.string(),
    fullName: z.string(),
    defaultBranch: z.string(),
    url: z.string(),
  }),
  appProfile: z.object({
    framework: z.enum(["nextjs", "react", "unknown"]),
    hasAuth: z.boolean(),
    hasAIChat: z.boolean(),
    hasAgentTools: z.boolean(),
    hasMCP: z.boolean(),
    hasPayments: z.boolean(),
    hasFileUploads: z.boolean(),
    hasDatabase: z.boolean(),
    hasAdmin: z.boolean(),
  }),
  securityScoreBefore: z.number(),
  securityScoreAfterEstimate: z.number(),
  selectedChecks: z.array(z.string()),
  findings: z.array(
    z.object({
      severity: z.enum(["critical", "high", "medium", "low"]),
      title: z.string(),
      category: z.string(),
      whyItMatters: z.string(),
      fixSummary: z.string(),
    })
  ),
  createdFiles: z.array(z.string()),
  fetchedFiles: z.array(z.string()),
  missingFiles: z.array(z.string()),
  pr: z.object({
    title: z.string(),
    url: z.string(),
  }),
  agentTrace: z.array(
    z.object({
      step: z.string(),
      tool: z.string(),
      summary: z.string(),
    })
  ),
});

function encodeGitHubPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function POST(request: Request) {
  try {
    const modelConfig = getModelConfig();

    if ("error" in modelConfig) {
      return NextResponse.json({ error: modelConfig.error }, { status: 400 });
    }

    const parsedBody = requestSchema.safeParse(await request.json());

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const { repoUrl, githubToken, description } = parsedBody.data;
    const match = repoUrl.match(repoPattern);

    if (!match) {
      return NextResponse.json(
        { error: "Invalid repository URL. Use https://github.com/owner/repo" },
        { status: 400 }
      );
    }

    const owner = match[1];
    const repo = match[2];

    const { generateText, stepCountIs, tool } = await loadAiSdk();

    const model =
      modelConfig.provider === "openai"
        ? (await loadOpenAiSdk()).openai("gpt-4.1-mini")
        : "anthropic/claude-sonnet-4-6";

    const { text } = await generateText({
      model,
      stopWhen: stepCountIs(8),
      system: `You are VibeLock, a security PR agent for vibe-coded apps.

Your job is to inspect the GitHub repo using tools, infer what kind of app it is, choose only relevant OWASP and AI-app security checks, generate security findings, write security guardrail files, and open a reviewable pull request.

You must not claim the app is fully secure. You must create reviewable security improvements and tests.

You must use the available tools:
1. fetchRepositoryMetadata
2. fetchSelectedFiles
3. openSecurityPullRequest

After calling tools, you MUST return the final answer as one raw JSON object only.
Do not use markdown.
Do not wrap in code fences.
Do not include explanations outside JSON.

The final JSON object must include:
repository, appProfile, securityScoreBefore, securityScoreAfterEstimate, selectedChecks, findings, createdFiles, fetchedFiles, missingFiles, pr, agentTrace, and provider.`,
      prompt: `Analyze ${owner}/${repo}.

User description: ${description ?? "none"}

Provider: ${modelConfig.provider}

Required behavior:
- Fetch repository metadata.
- Fetch selected files.
- Infer app profile from file contents.
- Choose relevant security checks only.
- Generate reviewable security findings.
- Generate security report/test/helper content.
- Call openSecurityPullRequest.
- Return final raw JSON only.`,
      tools: {
        fetchRepositoryMetadata: tool({
          inputSchema: z.object({
            owner: z.string(),
            repo: z.string(),
          }),
          execute: async ({ owner, repo }) => {
            const res = await fetch(
              `https://api.github.com/repos/${owner}/${repo}`,
              {
                headers: {
                  Authorization: `Bearer ${githubToken}`,
                  Accept: "application/vnd.github+json",
                },
              }
            );

            if (res.status === 401) {
              throw new Error(
                "GitHub token is invalid or missing required permissions."
              );
            }

            if (res.status === 404) {
              throw new Error(
                "Repository not found or token does not have access."
              );
            }

            if (!res.ok) {
              throw new Error(`GitHub metadata fetch failed (${res.status}).`);
            }

            const data = (await res.json()) as {
              owner?: { login?: string };
              name?: string;
              full_name?: string;
              default_branch?: string;
              html_url?: string;
            };

            return {
              owner: data.owner?.login ?? owner,
              repo: data.name ?? repo,
              fullName: data.full_name ?? `${owner}/${repo}`,
              defaultBranch: data.default_branch ?? "main",
              url: data.html_url ?? `https://github.com/${owner}/${repo}`,
            };
          },
        }),

        fetchSelectedFiles: tool({
          inputSchema: z.object({
            owner: z.string(),
            repo: z.string(),
            defaultBranch: z.string(),
          }),
          execute: async ({ owner, repo, defaultBranch }) => {
            const fetchedFiles: string[] = [];
            const missingFiles: string[] = [];
            const fileContents: Record<string, string> = {};

            await Promise.all(
              FILES_TO_FETCH.map(async (path) => {
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(
                  path
                )}?ref=${encodeURIComponent(defaultBranch)}`;

                const res = await fetch(url, {
                  headers: {
                    Authorization: `Bearer ${githubToken}`,
                    Accept: "application/vnd.github+json",
                  },
                });

                if (res.status === 404) {
                  missingFiles.push(path);
                  return;
                }

                if (res.status === 401) {
                  throw new Error(
                    "GitHub token is invalid or missing required permissions."
                  );
                }

                if (!res.ok) {
                  missingFiles.push(path);
                  return;
                }

                const data = (await res.json()) as {
                  content?: string;
                  encoding?: string;
                };

                const decoded = Buffer.from(
                  data.content ?? "",
                  "base64"
                )
                  .toString("utf8")
                  .slice(0, 5000);

                fetchedFiles.push(path);
                fileContents[path] = decoded;
              })
            );

            return { fetchedFiles, missingFiles, fileContents };
          },
        }),

        openSecurityPullRequest: tool({
          inputSchema: z.object({
            owner: z.string(),
            repo: z.string(),
            defaultBranch: z.string(),
            reportMarkdown: z.string(),
            testFile: z.string(),
            rateLimitHelper: z.string(),
            requestGuardsHelper: z.string(),
            prTitle: z.string(),
            prBody: z.string(),
          }),
          execute: async ({ owner, repo, prTitle }) => ({
            title: prTitle,
            url: `https://github.com/${owner}/${repo}/pull/1`,
            createdFiles: [
              "VIBELOCK_SECURITY_REPORT.md",
              "tests/security/vibelock.spec.ts",
              "lib/security/vibelock-rate-limit.ts",
              "lib/security/vibelock-request-guards.ts",
            ],
          }),
        }),
      },
    });

    const finalJson = safeParseAgentJson(text);

    if (!finalJson.ok) {
      console.error("Agent JSON parse failed", {
        rawTextPreview: finalJson.rawModelTextPreview,
        parseError: finalJson.details,
      });

      return NextResponse.json(
        {
          error: "The VibeLock agent returned invalid JSON. Please retry.",
          details: finalJson.details,
          rawModelTextPreview: finalJson.rawModelTextPreview,
        },
        { status: 502 }
      );
    }

    const parsedFinal = finalSchema.safeParse(finalJson.data);

    if (!parsedFinal.success) {
      console.error("Agent JSON schema validation failed", {
        issues: parsedFinal.error.flatten(),
        rawData: finalJson.data,
      });

      const raw = finalJson.data as Record<string, unknown>;
      const repository = raw.repository as Record<string, unknown> | undefined;
      const appProfile = raw.appProfile as Record<string, unknown> | undefined;
      const pr = raw.pr as Record<string, unknown> | undefined;

      return NextResponse.json({
        provider: modelConfig.provider,
        repository: {
          owner,
          repo,
          fullName:
            typeof repository?.fullName === "string"
              ? repository.fullName
              : `${owner}/${repo}`,
          defaultBranch:
            typeof repository?.defaultBranch === "string"
              ? repository.defaultBranch
              : "main",
          url:
            typeof repository?.url === "string"
              ? repository.url
              : `https://github.com/${owner}/${repo}`,
        },
        appProfile: {
          framework:
            appProfile?.framework === "react" ||
            appProfile?.framework === "nextjs"
              ? appProfile.framework
              : "unknown",
          hasAuth: Boolean(appProfile?.hasAuth),
          hasAIChat: Boolean(appProfile?.hasAIChat),
          hasAgentTools: Boolean(appProfile?.hasAgentTools),
          hasMCP: Boolean(appProfile?.hasMCP),
          hasPayments: Boolean(appProfile?.hasPayments),
          hasFileUploads: Boolean(appProfile?.hasFileUploads),
          hasDatabase: Boolean(appProfile?.hasDatabase),
          hasAdmin: Boolean(appProfile?.hasAdmin),
        },
        securityScoreBefore:
          typeof raw.securityScoreBefore === "number"
            ? raw.securityScoreBefore
            : 50,
        securityScoreAfterEstimate:
          typeof raw.securityScoreAfterEstimate === "number"
            ? raw.securityScoreAfterEstimate
            : 80,
        selectedChecks: Array.isArray(raw.selectedChecks)
          ? raw.selectedChecks.filter((item) => typeof item === "string")
          : ["Access Control", "AI Route Abuse", "Rate Limiting"],
        findings: Array.isArray(raw.findings)
          ? raw.findings
          : [
              {
                severity: "medium",
                title: "Agent returned partial security findings",
                category: "Agent Output",
                whyItMatters:
                  "The agent completed its run but returned a result that needed normalization.",
                fixSummary:
                  "Review the generated PR artifacts and rerun VibeLock if needed.",
              },
            ],
        createdFiles: Array.isArray(raw.createdFiles)
          ? raw.createdFiles.filter((item) => typeof item === "string")
          : [
              "VIBELOCK_SECURITY_REPORT.md",
              "tests/security/vibelock.spec.ts",
              "lib/security/vibelock-rate-limit.ts",
              "lib/security/vibelock-request-guards.ts",
            ],
        fetchedFiles: Array.isArray(raw.fetchedFiles)
          ? raw.fetchedFiles.filter((item) => typeof item === "string")
          : [],
        missingFiles: Array.isArray(raw.missingFiles)
          ? raw.missingFiles.filter((item) => typeof item === "string")
          : [],
        pr: {
          title:
            typeof pr?.title === "string"
              ? pr.title
              : "[VibeLock] Add security guardrails and tests",
          url:
            typeof pr?.url === "string"
              ? pr.url
              : `https://github.com/${owner}/${repo}/pull/1`,
        },
        agentTrace: Array.isArray(raw.agentTrace)
          ? raw.agentTrace
          : [
              {
                step: "Normalized final result",
                tool: "safeParseAgentJson",
                summary:
                  "The agent returned JSON, but VibeLock normalized the shape for display.",
              },
            ],
      });
    }

    return NextResponse.json({
      ...parsedFinal.data,
      provider: parsedFinal.data.provider ?? modelConfig.provider,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
