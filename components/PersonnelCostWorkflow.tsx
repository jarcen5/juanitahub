'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type PersonnelStatus = 'planned' | 'awaiting_approval' | 'approved' | 'paid' | 'canceled'

type Props = {
  cost: {
    id: number
    status: PersonnelStatus
    planned_amount: number
    paid_amount: number | null
  }
  onChanged: () => void | Promise<void>
  onDeleted: () => void
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

export default function PersonnelCostWorkflow({ cost, onChanged }: Props) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function changeStatus(status: PersonnelStatus) {
    if (saving) return
    setSaving(true)
    setMessage('')

    let errorMessage = ''
    if (status === 'paid') {
      const result = await supabase
        .from('budget_personnel_costs')
        .update({ status: 'paid', paid_amount: cost.paid_amount ?? cost.planned_amount })
        .eq('id', cost.id)
      errorMessage = result.error?.message ?? ''
    } else {
      const result = await supabase
        .from('budget_personnel_costs')
        .update({ status })
        .eq('id', cost.id)
      errorMessage = result.error?.message ?? ''
    }

    if (errorMessage) {
      setMessage(errorMessage)
    } else {
      setMessage(status === 'paid' ? 'Marked paid and counted as budget spending.' : 'Pay status updated.')
      await onChanged()
    }

    setSaving(false)
  }

  return (
    <div className="personnel-workflow">
      <div className="purchasing-panel-heading compact">
        <div><span className="purchasing-kicker">Workflow</span><h3>Pay status</h3></div>
      </div>

      {message && <div className="notice">{message}</div>}

      <div className="personnel-summary-strip">
        <span><small>Planned</small><strong>{money(cost.planned_amount)}</strong></span>
        <span><small>Paid</small><strong>{cost.paid_amount == null ? '—' : money(cost.paid_amount)}</strong></span>
      </div>

      <div className="purchasing-status-actions">
        {cost.status === 'planned' && <>
          <button className="primary" disabled={saving} onClick={() => void changeStatus('awaiting_approval')}>Submit for approval</button>
          <button className="ghost danger-button" disabled={saving} onClick={() => void changeStatus('canceled')}>Cancel</button>
        </>}

        {cost.status === 'awaiting_approval' && <>
          <button className="ghost" disabled={saving} onClick={() => void changeStatus('planned')}>Return to planned</button>
          <button className="primary" disabled={saving} onClick={() => void changeStatus('approved')}>Approve pay plan</button>
          <button className="ghost danger-button" disabled={saving} onClick={() => void changeStatus('canceled')}>Decline / cancel</button>
        </>}

        {cost.status === 'approved' && <>
          <button className="primary" disabled={saving} onClick={() => void changeStatus('paid')}>Mark paid</button>
          <button className="ghost danger-button" disabled={saving} onClick={() => void changeStatus('canceled')}>Cancel</button>
        </>}

        {cost.status === 'paid' && <div className="purchasing-complete-note">✓ Paid and counted as budget spending.</div>}
        {cost.status === 'canceled' && <div className="purchasing-canceled-note">Canceled personnel costs do not count against the budget.</div>}
      </div>
    </div>
  )
}
