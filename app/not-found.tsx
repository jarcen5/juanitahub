export default function NotFoundPage() {
  return (
    <main className="main jh-system-state-wrap">
      <section className="card jh-system-state" aria-labelledby="jh-not-found-title">
        <span className="jh-system-state-icon" aria-hidden="true">?</span>
        <span className="jh-system-state-eyebrow">Juanita Hub · Link not found</span>
        <h1 id="jh-not-found-title">This page isn't available</h1>
        <p>The link may have changed or the section may have moved. You can return to the dashboard and navigate to the section from the sidebar.</p>
        <div className="jh-system-state-actions">
          <a className="primary" href="/">Return to dashboard</a>
        </div>
      </section>
    </main>
  )
}
