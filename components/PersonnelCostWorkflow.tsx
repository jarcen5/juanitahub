'use client'

type Props = {
  cost: {
    id: number
    status: 'planned' | 'awaiting_approval' | 'approved' | 'paid' | 'canceled'
    planned_amount: number
    paid_amount: number | null
  }
  onChanged: () => void | Promise<void>
  onDeleted: () => void
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

export default function PersonnelCostWorkflow({ cost }: Props) {
  return (
    <div className="personnel-workflow">
      <div className="purchasing-panel-heading compact">
        <div><span className="purchasing-kicker">Workflow</span><h3>Pay status</h3></div>
      </div>
      <div className="personnel-summary-strip">
        <span><small>Planned</small><strong>{money(cost.planned_amount)}</strong></span>
        <span><small>Paid</small><strong>{cost.paid_amount == null ? '—' : money(cost.paid_amount)}</strong></span>
      </div>
      <div className={`purchase-status ${cost.status}`}>{cost.status.replace('_', ' ')}</div>
    </div>
  )
}
