'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type PersonnelStatus = 'planned' | 'awaiting_approval' | 'approved' | 'paid' | 'canceled'
type CompensationType = 'hourly' | 'stipend' | 'flat'

type Props = {
  cost: {
    id: number
    status: PersonnelStatus
    compensation_type: CompensationType
    rate_amount: number | null
    planned_hours: number | null
    actual_hours: number | null
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
  const [actualHours, setActualHours] = useState(cost.actual_hours == null ? '' : String(cost.actual_hours))
  const [paidAmount, setPaidAmount] = useState(cost.paid_amount == null ? '' : String(cost.paid_amount))

  async function changeStatus(status: PersonnelStatus) {
    if (saving) return
    setSaving(true)
    setMessage('')

    const { error } = await supabase
      .from('budget_personnel_costs')
      .update({ status })
      .eq('id', cost.id)

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Pay status updated.')
      await onChanged()
    }

    setSaving(false)
  }

  async function saveActualDetails() {
    if (saving || cost.status !== 'approved') return

    const hours = actualHours === '' ? null : Number(actualHours)
    const amount = paidAmount === '' ? null : Number(paidAmount)

    if ((hours != null && (!Number.isFinite(hours) || hours < 0)) || (amount != null && (!Number.isFinite(amount) || amount < 0))) {
      setMessage('Actual hours and amount paid must be zero or greater.')
      return
    }

    setSaving(true)
    setMessage('')

    const { error } = await supabase
      .from('budget_personnel_costs')
      .update({ actual_hours: hours, paid_amount: amount })
      .eq('id', cost.id)

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Actual pay details saved.')
      await onChanged()
    }

    setSaving(false)
  }

  async function markPaid() {
    if (saving || cost.status !== 'approved') return

    const hours = actualHours === '' ? cost.actual_hours : Number(actualHours)
    let amount = paidAmount === '' ? cost.paid_amount : Number(paidAmount)

    if (amount == null) {
      if (cost.compensation_type === 'hourly' && cost.rate_amount != null && hours != null) {
        amount = cost.rate_amount * hours
      } else {
        amount = cost.planned_amount
      }
    }

    if (!Number.isFinite(amount) || amount < 0 || (hours != null && (!Number.isFinite(hours) || hours < 0))) {
      setMessage('Enter valid actual hours and payment amount before marking this Paid.')
      return
    }

    setSaving(true)
    setMessage('')

    const { error } = await supabase
      .from('budget_personnel_costs')
      .update({
        status: 'paid',
        actual_hours: hours,
        paid_amount: amount,
      })
      .eq('id', cost.id)

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Marked paid and counted as budget spending.')
      await onChanged()
    }

    setSaving(false)
  }

  const suggestedPaid = cost.compensation_type === 'hourly' && cost.rate_amount != null
    ? cost.rate_amount * Number(actualHours || cost.actual_hours || cost.planned_hours || 0)
    : cost.planned_amount

  return (
    <div className="personnel-workflow">
      <div className="purchasing-panel-heading compact">
        <div><span className="purchasing-kicker">Workflow</span><h3>Pay status</h3></div>
      </div>

      {message && <div className="notice">{message}</div>}

      <div className="personnel-summary-strip">
        <span><small>Planned</small><strong>{money(cost.planned_amount)}</strong></span>
        <span><small>Actual / paid</small><strong>{cost.paid_amount == null ? '—' : money(cost.paid_amount)}</strong></span>
      </div>

      {cost.status === 'approved' && <div className="personnel-actual-pay">
        {cost.compensation_type === 'hourly' && <label className="field"><span>Actual hours</span><input type="number" min="0" step="0.25" value={actualHours} onChange={(event) => setActualHours(event.target.value)} /></label>}
        <label className="field"><span>Amount paid</span><input type="number" min="0" step="0.01" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} placeholder={money(suggestedPaid)} /></label>
        <button className="ghost" disabled={saving} onClick={() => void saveActualDetails()}>Save actual details</button>
      </div>}

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
          <button className="primary" disabled={saving} onClick={() => void markPaid()}>Mark paid</button>
          <button className="ghost danger-button" disabled={saving} onClick={() => void changeStatus('canceled')}>Cancel</button>
        </>}

        {cost.status === 'paid' && <div className="purchasing-complete-note">✓ Paid and counted as budget spending.</div>}
        {cost.status === 'canceled' && <div className="purchasing-canceled-note">Canceled personnel costs do not count against the budget.</div>}
      </div>
    </div>
  )
}
