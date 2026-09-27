'use client'

type Props = {
  budgets: Array<{ id: number; name: string; program_id: number | null; allocated_amount: number; active: boolean }>
  programs: Array<{ id: number; name: string; season_label: string | null; status: string }>
  onChanged: () => void
}

export default function PersonnelCostsPanel({ budgets }: Props) {
  return (
    <section className="card personnel-cost-editor">
      <div className="purchasing-panel-heading">
        <div>
          <span className="purchasing-kicker">Labor budget</span>
          <h2>Personnel Costs</h2>
        </div>
      </div>
      <div className="personnel-safety-note">
        <strong>Budget tracking only</strong>
        <span>Track youth worker and intern pay without storing payroll-sensitive information.</span>
      </div>
      <div className="purchasing-empty">
        <strong>{budgets.length ? 'Personnel tracking is being connected to your budgets.' : 'Create a budget first.'}</strong>
      </div>
    </section>
  )
}
