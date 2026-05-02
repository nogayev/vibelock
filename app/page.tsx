'use client'

import { useMemo, useState } from 'react'

const progressSteps = [
  'Fetching repository',
  'Detecting app type',
  'Selecting security checks',
  'Generating findings',
  'Creating security files',
  'Opening pull request',
]

export default function HomePage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [currentStep, setCurrentStep] = useState(-1)
  const [isRunning, setIsRunning] = useState(false)
  const [hasCompletedRun, setHasCompletedRun] = useState(false)

  const completedSteps = useMemo(() => currentStep + 1, [currentStep])

  const handleRun = async () => {
    if (isRunning) return

    setIsRunning(true)
    setHasCompletedRun(false)
    setCurrentStep(-1)

    for (let i = 0; i < progressSteps.length; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 700))
      setCurrentStep(i)
    }

    await new Promise((resolve) => setTimeout(resolve, 350))
    setHasCompletedRun(true)
    setIsRunning(false)
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
          <p className="max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
            Connect a GitHub repository, run automated security profiling, and prepare a pull request with hardening files designed for AI-generated applications.
          </p>
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
                          isDone ? 'bg-emerald-400 text-slate-950' : isActive ? 'bg-cyan-400 text-slate-950' : 'bg-slate-700 text-slate-300'
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

            {hasCompletedRun && (
              <div className="rounded-2xl border border-cyan-400/30 bg-slate-900/80 p-6 shadow-xl shadow-black/20">
                <h2 className="mb-4 text-lg font-medium text-white">Demo Findings Snapshot</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Detected Profile</p>
                    <p className="mt-1 text-sm font-semibold text-cyan-300">AI SaaS App</p>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Before Score</p>
                    <p className="mt-1 text-sm font-semibold text-rose-300">42/100</p>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">After Estimate</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-300">86/100</p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Example Findings</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">
                    <li>AI route has no authentication guard</li>
                    <li>No rate limiting on model calls</li>
                    <li>Missing security tests for protected routes</li>
                    <li>No documented environment variable policy</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
