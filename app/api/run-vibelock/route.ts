import { NextResponse } from 'next/server'

type RunVibeLockRequest = {
  repoUrl?: string
  githubToken?: string
  description?: string
}

const githubRepoUrlPattern = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/i

export async function POST(request: Request) {
  let body: RunVibeLockRequest

  try {
    body = (await request.json()) as RunVibeLockRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const repoUrl = body.repoUrl?.trim()
  const githubToken = body.githubToken?.trim()

  if (!repoUrl) {
    return NextResponse.json({ error: 'Repository URL is required.' }, { status: 400 })
  }

  if (!githubToken) {
    return NextResponse.json({ error: 'GitHub token is required.' }, { status: 400 })
  }

  if (!githubRepoUrlPattern.test(repoUrl)) {
    return NextResponse.json(
      { error: 'Repository URL must look like https://github.com/owner/repo.' },
      { status: 400 }
    )
  }

  return NextResponse.json({
    appProfile: {
      framework: 'nextjs',
      hasAuth: true,
      hasAIChat: true,
      hasAgentTools: false,
      hasMCP: false,
      hasPayments: true,
      hasFileUploads: false,
      hasDatabase: true,
      hasAdmin: true,
    },
    securityScoreBefore: 42,
    securityScoreAfterEstimate: 86,
    selectedChecks: [
      'Broken Access Control',
      'Unauthenticated AI Route',
      'Rate Limiting',
      'Stripe Webhook Signature Verification',
      'Server-side Admin Authorization',
    ],
    findings: [
      {
        severity: 'high',
        title: 'AI route has no authentication guard',
        category: 'AI Safety',
        whyItMatters:
          'Unauthenticated users could trigger costly model calls or abuse agent actions.',
        fixSummary:
          'Add server-side authentication checks before invoking the model or tools.',
      },
      {
        severity: 'high',
        title: 'No rate limiting on model calls',
        category: 'Abuse Prevention',
        whyItMatters:
          'Attackers or accidental loops can create high usage costs.',
        fixSummary: 'Add IP or user-based rate limiting to AI routes.',
      },
      {
        severity: 'medium',
        title: 'Missing security tests for protected routes',
        category: 'Testing',
        whyItMatters:
          'AI-generated code often lacks regression tests for access control.',
        fixSummary:
          'Add tests that verify unauthenticated users cannot access protected APIs.',
      },
    ],
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
}
