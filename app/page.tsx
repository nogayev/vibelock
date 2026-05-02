'use client'

import { useMemo, useState } from 'react'

type Severity = 'high' | 'medium' | 'low'

type Finding = {
  severity: Severity
  title: string
  category: string
  whyItMatters: string
  fixSummary: string
}

type RunVibeLockResponse = {
  repository: {
    owner: string
    repo: string
    fullName: string
    defaultBranch: string
    url: string
  }
  appProfile: {
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
  securityScoreBefore: number
  securityScoreAfterEstimate: number
  selectedChecks: string[]
  findings: Finding[]
  fetchedFiles: string[]
  missingFiles: string[]
  createdFiles: string[]
  pr?: {
    title: string
    url: string
  }
}

const progressSteps = [
  'Fetching repository',
  'Detecting app type',
  'Selecting security checks',
  'Generating findings',
  'Creating security files',
  'Opening pull request',
]

const githubRepoUrlPattern = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/i

export default function HomePage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [currentStep, setCurrentStep] = useState(-1)
  const [isRunning, setIsRunning] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [result, setResult] = useState<RunVibeLockResponse | null>(null)

  const completedSteps = useMemo(() => currentStep + 1, [currentStep])

  const severityClasses: Record<Severity, string> = {
    high: 'border-rose-400/40 bg-rose-500/10 text-rose-200',
    medium: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
    low: 'border-sky-400/40 bg-sky-500/10 text-sky-200',
  }

  const handleRun = async () => {
    if (isRunning) return

    const repo = repoUrl.trim()
    const token = githubToken.trim()

    if (!repo) {
      setErrorMessage('Repository URL is required.')
      return
    }

    if (!token) {
      setErrorMessage('GitHub token is required.')
      return
    }

    if (!githubRepoUrlPattern.test(repo)) {
      setErrorMessage('Repository URL must look like https://github.com/owner/repo.')
      return
    }

    setErrorMessage('')
    setResult(null)
    setIsRunning(true)
    setCurrentStep(0)

    const intervalId = window.setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= progressSteps.length - 1) {
          return prev
        }

        return prev + 1
      })
    }, 500)

    try {
      const response = await fetch('/api/run-vibelock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: repo,
          githubToken: token,
          description: projectDescription,
        }),
      })

      const data = (await response.json()) as RunVibeLockResponse & { error?: string }

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to run VibeLock.')
      }

      setCurrentStep(progressSteps.length - 1)
      setResult(data)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected error while running VibeLock.')
    } finally {
      window.clearInterval(intervalId)
      setIsRunning(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 lg:py-14">
        <header className="space-y-4">
          <div className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
            VibeLock Security Analyzer
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Secure vibe-coded apps before attackers find the cracks.
          </h1>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/30 backdrop-blur">
            <h2 className="mb-5 text-lg font-medium text-white">Scan Configuration</h2>

            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">GitHub Repository URL</span>
                <input
                  type="url"
                  value={repoUrl}
                  onChange={(event) => setRepoUrl(event.target.value)}
                  placeholder="https://github.com/org/repo"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none ring-cyan-400/0 transition focus:border-cyan-400/60 focus:ring-2"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">GitHub Token</span>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(event) => setGithubToken(event.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none ring-cyan-400/0 transition focus:border-cyan-400/60 focus:ring-2"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Project Description (Optional)</span>
                <textarea
                  value={projectDescription}
                  onChange={(event) => setProjectDescription(event.target.value)}
                  placeholder="Describe architecture, sensitive flows, and expected risk surface..."
                  rows={4}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none ring-cyan-400/0 transition focus:border-cyan-400/60 focus:ring-2"
                />
              </label>
            </div>

            {errorMessage && (
              <div className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {errorMessage}
              </div>
            )}

            <button
              onClick={handleRun}
              disabled={isRunning}
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-700 disabled:text-slate-300"
            >
              {isRunning ? 'Running security pipeline...' : 'Run VibeLock'}
            </button>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/20">
              <h2 className="mb-4 text-lg font-medium text-white">Pipeline Progress</h2>
              <ol className="space-y-3">
                {progressSteps.map((step, index) => {
                  const isDone = index < completedSteps
                  const isActive = index === currentStep && isRunning

                  return (
                    <li
                      key={step}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                        isDone
                          ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                          : isActive
                            ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                            : 'border-slate-700 bg-slate-950/70 text-slate-400'
                      }`}
                    >
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                          isDone
                            ? 'bg-emerald-400 text-slate-950'
                            : isActive
                              ? 'bg-cyan-400 text-slate-950'
                              : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {isDone ? '✓' : index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  )
                })}
              </ol>
            </div>

            {result && (
              <div className="rounded-2xl border border-cyan-400/30 bg-slate-900/80 p-6 shadow-xl shadow-black/20">
                <h2 className="mb-4 text-lg font-medium text-white">Analysis Results</h2>

                <div className="mb-4 rounded-lg border border-slate-700 bg-slate-950 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Repository</p>
                  <p className="mt-1 text-sm font-semibold text-cyan-300">{result.repository.fullName}</p>
                  <p className="mt-1 text-xs text-slate-300">Default branch: {result.repository.defaultBranch}</p>
                  <a href={result.repository.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-cyan-300 hover:text-cyan-200">
                    Open repository
                  </a>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Detected Profile</p>
                    <p className="mt-1 text-sm font-semibold text-cyan-300">{result.appProfile.framework.toUpperCase()} App</p>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Before Score</p>
                    <p className="mt-1 text-sm font-semibold text-rose-300">{result.securityScoreBefore}/100</p>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">After Estimate</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-300">{result.securityScoreAfterEstimate}/100</p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Selected Checks</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">
                    {result.selectedChecks.map((check) => (
                      <li key={check}>{check}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 space-y-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Findings</p>
                  {result.findings.map((finding) => (
                    <article key={finding.title} className="rounded-lg border border-slate-700 bg-slate-950 p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-white">{finding.title}</h3>
                        <span className={`rounded-full border px-2 py-1 text-xs font-medium uppercase ${severityClasses[finding.severity]}`}>
                          {finding.severity}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">Category: {finding.category}</p>
                      <p className="mt-2 text-sm text-slate-200">{finding.whyItMatters}</p>
                      <p className="mt-2 text-sm text-cyan-200">Fix: {finding.fixSummary}</p>
                    </article>
                  ))}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Fetched Files</p>
                    <ul className="mt-2 space-y-1 font-mono text-xs text-emerald-200">
                      {result.fetchedFiles.map((filePath) => (
                        <li key={filePath}>{filePath}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Missing Files</p>
                    <ul className="mt-2 space-y-1 font-mono text-xs text-amber-200">
                      {result.missingFiles.map((filePath) => (
                        <li key={filePath}>{filePath}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Created Files</p>
                  <ul className="mt-2 space-y-1 font-mono text-xs text-slate-200">
                    {result.createdFiles.map((filePath) => (
                      <li key={filePath}>{filePath}</li>
                    ))}
                  </ul>
                </div>

                {result.pr?.url && (
                  <a
                    href={result.pr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/20"
                  >
                    View Pull Request: {result.pr.title}
                  </a>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
