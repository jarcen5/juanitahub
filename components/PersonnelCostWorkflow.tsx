'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type PersonnelStatus = 'planned' | 'awaiting_approval' | 'approved' | 'paid' | 'canceled'
type CompensationType = 'hourly' | 'stipend' | 'flat'

type PersonnelCost = {
  id: number
  compensation_type: CompensationType
  rate_amount: number | null
  planned_hours: number | null
  actual_hours: number | null
  planned_amount: number
  paid_amount: number | null
  status: PersonnelStatus
}

type Props = {
  cost: PersonnelCost
  onChanged: () => void | Promise<void>
  onDeleted: () => void
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

export default function PersonnelCostWorkflow({ cost, onChanged, onDeleted }: Props) {
  const [actualHours, setActualHours] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  useEffect(() => {
    setActualHours(cost.actual_hours == null ? '' : String(cost.actual_hours))
    setPaidAmount(cost.paid_amount == null ? '' : String(cost.paid_amount))
    setDeleteConfirm(false)
    setMessage('')
  }, [cost.id, cost.actual_hours, cost.paid_amount])

  async function updateStatus(status: PersonnelStatus) {
    if (saving) return
    setSaving(true)
    setMessage('')

    const { error } = await supabase
      .from('budget_personnel_costs')
      .update({ status })
      .eq('id', cost.id)

    if (error) setMessage(error.message)
    else {
      setMessage('Pay status updated.')
      await onChanged()
    }
    setSaving(false)
  }

  async function saveActualPay() {
    if (cost.status !== 'approved' || saving) return

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

    if (error) setMessage(error.message)
    else {
      setMessage('Actual pay details saved.')
      await onChanged()
    }
    setSaving(false)
  }

  async function markPaid() {
    if (cost.status !== 'approved' || saving) return

    const hours = actualHours === '' ? cost.actual_hours : Number(actualHours)
    let amount: number

    if (paidAmount !== '') {
      amount = Number(paidAmount)
    } else if (cost.compensation_type === 'hourly' && cost.rate_amount != null && hours != null) {
      amount = cost.rate_amount * hours
    } else {
      amount = cost.planned_amount
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

    if (error) setMessage(error.message)
    else {
      setMessage('Marked paid. This amount is now counted as budget spending.')
      await onChanged()
    }
    setSaving(false)
  }

  async function deleteCost() {
    if (cost.status === 'paid' || saving) return
    setSaving(true)
    setMessage('')

    const { data, error } = await supabase
      .from('budget_personnel_costs')
      .delete()
      .eq('id', cost.id)
      .neq('status', 'paid')
      .select('id')
      .maybeSingle()

    if (error) setMessage(error.message)
    else if (!data) setMessage('This personnel cost could not be deleted.')
    else {
      onDeleted()
      await onChanged()
    }
    setSaving(false)
  }

  const defaultPaid = cost.compensation_type === 'hourly' && cost.rate_amount != null
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
        <label className="field"><span>Amount paid</span><input type="number" min="0" step="0.01" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} placeholder={money(defaultPaid)} /></label>
        <button className="ghost" disabled={saving} onClick={() => void saveActualPay()}>Save actual details</button>
      </div>}

      <div className="purchasing-status-actions">
        {cost.status === 'planned' && <>
          <button className="primary" disabled={saving} onClick={() => void updateStatus('awaiting_approval')}>Submit for approval</button>
          <button className="ghost danger-button" disabled={saving} onClick={() => void updateStatus('canceled')}>Cancel</button>
        </>}

        {cost.status === 'awaiting_approval' && <>
          <button className="ghost" disabled={saving} onClick={() => void updateStatus('planned')}>Return to planned</button>
          <button className="primary" disabled={saving} onClick={() => void updateStatus('approved')}>Approve pay plan</button>
          <button className="ghost danger-button" disabled={saving} onClick={() => void updateStatus('canceled')}>Decline / cancel</button>
        </>}

        {cost.status === 'approved' && <>
          <button className="primary" disabled={saving} onClick={() => void markPaid()}>Mark paid</button>
          <button className="ghost danger-button" disabled={saving} onClick={() => void updateStatus('canceled')}>Cancel</button>
        </>}

        {cost.status === 'paid' && <div className="purchasing-complete-note">✓ Paid and counted as budget spending.</div>}
        {cost.status === 'canceled' && <div className="purchasing-canceled-note">Canceled personnel costs do not count against the budget.</div>}
      </div>

      {cost.status !== 'paid' && <div className="personnel-delete-area">
        {!deleteConfirm ? (
          <button className="ghost danger-button" disabled={saving} onClick={() => setDeleteConfirm(true)}>Delete personnel cost</button>
        ) : (
          <div className="personnel-delete-confirm">
            <span><strong>Delete permanently?</strong><small>Use this for a test or duplicate record. Paid records cannot be deleted.</small></span>
            <div>
              <button className="ghost" disabled={saving} onClick={() => setDeleteConfirm(false)}>Keep</button>
              <button className="ghost danger-button" disabled={saving} onClick={() => void deleteCost()}>{saving ? 'Deleting…' : 'Yes, delete'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
