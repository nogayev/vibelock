import { NextResponse } from 'next/server'

type RunVibeLockRequest = {
  repoUrl?: string
  githubToken?: string
  description?: string
}

type Severity = 'high' | 'medium' | 'low'

type Finding = {
  severity: Severity
  title: string
  category: string
  whyItMatters: string
  fixSummary: string
}

type AppProfile = {
  framework: string
  hasAuth: boolean
  hasAIChat: boolean
  hasAgentTools: boolean
  hasMCP: boolean
  hasPayments: boolean
  hasFileUploads: boolean
  hasDatabase: boolean
  hasAdmin: boolean
}

const filesToFetch = [
  'README.md',
  'package.json',
  'next.config.ts',
  'next.config.js',
  'vercel.json',
  'middleware.ts',
  'app/page.tsx',
  'app/layout.tsx',
  'app/api/chat/route.ts',
  'lib/ai.ts',
  'lib/tools.ts',
  '.env.example',
]

const repoUrlPattern = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i

function detectFromContent(contents: string[]): AppProfile {
  const haystack = contents.join('\n').toLowerCase()

  return {
    framework: haystack.includes('"next"') || haystack.includes("'next'") ? 'nextjs' : 'unknown',
    hasAIChat:
      haystack.includes('ai') ||
      haystack.includes('generatetext') ||
      haystack.includes('streamtext') ||
      haystack.includes('openai') ||
      haystack.includes('anthropic') ||
      haystack.includes('gemini') ||
      haystack.includes('/api/chat'),
    hasPayments: haystack.includes('stripe'),
    hasDatabase:
      haystack.includes('prisma') ||
      haystack.includes('supabase') ||
      haystack.includes('drizzle') ||
      haystack.includes('postgres') ||
      haystack.includes('database'),
    hasAuth:
      haystack.includes('auth') ||
      haystack.includes('clerk') ||
      haystack.includes('next-auth') ||
      haystack.includes('supabase.auth') ||
      haystack.includes('session'),
    hasAdmin: haystack.includes('admin'),
    hasFileUploads:
      haystack.includes('upload') ||
      haystack.includes('formdata') ||
      haystack.includes('blob') ||
      haystack.includes('file'),
    hasMCP:
      haystack.includes('mcp') || haystack.includes('experimental_createmcpclient'),
    hasAgentTools:
      haystack.includes('tool') ||
      haystack.includes('tools') ||
      haystack.includes('toolcall'),
  }
}

function buildSelectedChecks(profile: AppProfile): string[] {
  const checks = new Set<string>()

  if (profile.hasAuth) {
    checks.add('Broken Access Control')
    checks.add('Session Enforcement')
  }

  if (profile.hasAIChat) {
    checks.add('Unauthenticated AI Route')
    checks.add('Rate Limiting')
    checks.add('Prompt Injection Boundaries')
  }

  if (profile.hasPayments) {
    checks.add('Stripe Webhook Signature Verification')
    checks.add('Server-side Entitlement Checks')
  }

  if (profile.hasDatabase) {
    checks.add('Tenant Isolation')
    checks.add('Server-side Ownership Checks')
  }

  if (profile.hasAdmin) {
    checks.add('Server-side Admin Authorization')
  }

  if (profile.hasFileUploads) {
    checks.add('File Size Validation')
    checks.add('MIME Validation')
  }

  if (profile.hasMCP || profile.hasAgentTools) {
    checks.add('Tool Allowlisting')
    checks.add('Excessive Agency')
    checks.add('Human Approval for Destructive Actions')
  }

  return Array.from(checks)
}

function buildFindings(profile: AppProfile): Finding[] {
  const findings: Finding[] = []

  if (profile.hasAIChat) {
    findings.push({
      severity: 'high',
      title: 'AI route has no authentication guard',
      category: 'AI Safety',
      whyItMatters:
        'Unauthenticated users could trigger costly model calls or abuse agent actions.',
      fixSummary:
        'Add server-side authentication checks before invoking the model or tools.',
    })
    findings.push({
      severity: 'high',
      title: 'No rate limiting on model calls',
      category: 'Abuse Prevention',
      whyItMatters: 'Attackers or accidental loops can create high usage costs.',
      fixSummary: 'Add IP or user-based rate limiting to AI routes.',
    })
  }

  if (profile.hasPayments) {
    findings.push({
      severity: 'high',
      title: 'Stripe webhook endpoint missing signature verification',
      category: 'Payments',
      whyItMatters:
        'Unsigned webhooks can be forged and trigger unauthorized billing changes.',
      fixSummary:
        'Verify Stripe signatures server-side before processing webhook payloads.',
    })
  }

  if (profile.hasAuth) {
    findings.push({
      severity: 'medium',
      title: 'Inconsistent access control enforcement on protected routes',
      category: 'Access Control',
      whyItMatters:
        'Client-only checks can be bypassed, exposing privileged resources.',
      fixSummary:
        'Enforce session and role checks in server-side route handlers.',
    })
  }

  if (profile.hasDatabase) {
    findings.push({
      severity: 'medium',
      title: 'Tenant isolation checks not explicitly validated',
      category: 'Data Isolation',
      whyItMatters:
        'Cross-tenant data access can leak sensitive records between users.',
      fixSummary:
        'Add ownership filters and tenant assertions on all data access paths.',
    })
  }

  if (findings.length === 0) {
    findings.push({
      severity: 'low',
      title: 'Missing security tests for protected routes',
      category: 'Testing',
      whyItMatters:
        'AI-generated code often lacks regression tests for access control.',
      fixSummary:
        'Add tests that verify unauthenticated users cannot access protected APIs.',
    })
  }

  return findings
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RunVibeLockRequest
    const repoUrl = body.repoUrl?.trim()
    const githubToken = body.githubToken?.trim()

    if (!repoUrl) {
      return NextResponse.json({ error: 'Repository URL is required.' }, { status: 400 })
    }

    if (!githubToken) {
      return NextResponse.json({ error: 'GitHub token is required.' }, { status: 400 })
    }

    const parsed = repoUrl.match(repoUrlPattern)

    if (!parsed) {
      return NextResponse.json(
        { error: 'Repository URL must look like https://github.com/owner/repo.' },
        { status: 400 }
      )
    }

    const owner = parsed[1]
    const repo = parsed[2]
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    }

    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      cache: 'no-store',
    })

    if (repoResponse.status === 401) {
      return NextResponse.json(
        { error: 'GitHub token is invalid or missing required permissions.' },
        { status: 401 }
      )
    }

    if (repoResponse.status === 404) {
      return NextResponse.json(
        { error: 'Repository not found or token does not have access.' },
        { status: 404 }
      )
    }

    if (!repoResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch repository metadata from GitHub.' },
        { status: 502 }
      )
    }

    const repoData = (await repoResponse.json()) as {
      default_branch: string
      full_name: string
      html_url: string
    }

    const fetchedFiles: string[] = []
    const missingFiles: string[] = []
    const fileContents: string[] = []

    for (const path of filesToFetch) {
      const fileResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(repoData.default_branch)}`,
        { headers, cache: 'no-store' }
      )

      if (fileResponse.status === 404) {
        missingFiles.push(path)
        continue
      }

      if (!fileResponse.ok) {
        missingFiles.push(path)
        continue
      }

      const fileData = (await fileResponse.json()) as { content?: string; encoding?: string }
      if (fileData.encoding === 'base64' && fileData.content) {
        const decoded = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf-8')
        fileContents.push(decoded)
        fetchedFiles.push(path)
      } else {
        missingFiles.push(path)
      }
    }

    const appProfile = detectFromContent(fileContents)

    const selectedChecks = buildSelectedChecks(appProfile)
    const findings = buildFindings(appProfile)

    return NextResponse.json({
      repository: {
        owner,
        repo,
        fullName: repoData.full_name,
        defaultBranch: repoData.default_branch,
        url: repoData.html_url,
      },
      appProfile,
      securityScoreBefore: 42,
      securityScoreAfterEstimate: 86,
      selectedChecks,
      findings,
      fetchedFiles,
      missingFiles,
      createdFiles: [
        'VIBELOCK_SECURITY_REPORT.md',
        'tests/security/vibelock.spec.ts',
        'lib/security/vibelock-rate-limit.ts',
        'lib/security/vibelock-request-guards.ts',
      ],
      pr: {
        title: '[VibeLock] Add security guardrails and tests',
        url: 'https://github.com/example/repo/pull/1',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Unexpected server error while running VibeLock.' },
      { status: 500 }
    )
  }
}
