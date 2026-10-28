'use client'

type ErrorPageProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <main className="main jh-system-state-wrap">
      <section className="card jh-system-state" role="alert" aria-labelledby="jh-error-title">
        <span className="jh-system-state-icon" aria-hidden="true">!</span>
        <span className="jh-system-state-eyebrow">Juanita Hub · Page issue</span>
        <h1 id="jh-error-title">This page couldn't load</h1>
        <p>Something interrupted this section. Your existing student and center records have not been changed by this error screen.</p>
        <div className="jh-system-state-actions">
          <button type="button" className="primary" onClick={() => reset()}>Try loading again</button>
          <a className="ghost" href="/">Return to dashboard</a>
        </div>
        <p className="jh-system-state-help">If it happens again, let an administrator know which section you were opening and what you were trying to do.</p>
      </section>
    </main>
  )
}
