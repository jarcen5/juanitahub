export default function LoadingPage() {
  return (
    <main className="main jh-system-state-wrap">
      <section className="card jh-system-state jh-system-state-loading" role="status" aria-live="polite" aria-label="Opening section">
        <span className="jh-system-loading-mark" aria-hidden="true" />
        <span className="jh-system-state-eyebrow">Juanita Hub</span>
        <h1>Opening section…</h1>
        <p>Loading your workspace.</p>
        <div className="jh-system-loading-bars" aria-hidden="true">
          <span /><span /><span />
        </div>
      </section>
    </main>
  )
}
