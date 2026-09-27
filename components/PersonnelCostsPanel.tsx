'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Budget = {
  id: number
  name: string
  program_id: number | null
  allocated_amount: number
  active: boolean
}

type Program = {
  id: number
  name: string
  season_label: string | null
  status: string
}

type TeamMember = {
  id: number
  display_name: string
  member_type: 'staff' | 'intern' | 'volunteer'
  active: boolean
}

type PersonnelStatus = 'planned' | 'awaiting_approval' | 'approved' | 'paid' | 'canceled'
type CompensationType = 'hourly' | 'stipend' | 'flat'

type PersonnelCost = {
  id: number
  budget_id: number
  program_id: number | null
  team_member_id: number | null
  worker_name: string
  role_label: string | null
  compensation_type: CompensationType
  rate_amount: number | null
  planned_hours: number | null
  actual_hours: number | null
  planned_amount: number
  paid_amount: number | null
  status: PersonnelStatus
  work_starts_on: string | null
  work_ends_on: string | null
  notes: string | null
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  paid_by: string | null
  paid_at: string | null
  canceled_by: string | null
  canceled_at: string | null
  created_at: string
}

type Staff = { user_id: string; display_name: string }

type Audit = {
  id: number
  personnel_cost_id: number
  action: string
  old_status: string | null
  new_status: string | null
  changed_by: string | null
  changed_at: string
}

type Props = {
  budgets: Budget[]
  programs: Program[]
  onChanged: () => void
}

const statusLabels: Record<PersonnelStatus, string> = {
  planned: 'Planned',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved',
  paid: 'Paid',
  canceled: 'Canceled',
}

const compensationLabels: Record<CompensationType, string> = {
  hourly: 'Hourly',
  stipend: 'Stipend',
  flat: 'Flat payment',
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function dateTimeLabel(value: string | null) {
  if (!value) return 'Not yet'
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function PersonnelCostsPanel({ budgets, programs, onChanged }: Props) {
  const [costs, setCosts] = useState<PersonnelCost[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState<'open' | 'all' | PersonnelStatus>('open')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [budgetId, setBudgetId] = useState('')
  const [programId, setProgramId] = useState('')
  const [teamMemberId, setTeamMemberId] = useState('')
  const [workerName, setWorkerName] = useState('')
  const [roleLabel, setRoleLabel] = useState('')
  const [compensationType, setCompensationType] = useState<CompensationType>('hourly')
  const [rateAmount, setRateAmount] = useState('')
  const [plannedHours, setPlannedHours] = useState('')
  const [actualHours, setActualHours] = useState('')
  const [plannedAmount, setPlannedAmount] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [workStart, setWorkStart] = useState('')
  const [workEnd, setWorkEnd] = useState('')
  const [notes, setNotes] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  useEffect(() => { void loadData() }, [])

  async function loadData() {
    const [costResult, teamResult, staffResult, auditResult] = await Promise.all([
      supabase.from('budget_personnel_costs').select('id,budget_id,program_id,team_member_id,worker_name,role_label,compensation_type,rate_amount,planned_hours,actual_hours,planned_amount,paid_amount,status,work_starts_on,work_ends_on,notes,submitted_at,approved_by,approved_at,paid_by,paid_at,canceled_by,canceled_at,created_at').order('created_at', { ascending: false }),
      supabase.from('team_members').select('id,display_name,member_type,active').eq('active', true).order('display_name'),
      supabase.from('staff_profiles').select('user_id,display_name').eq('active', true),
      supabase.from('budget_personnel_audit').select('id,personnel_cost_id,action,old_status,new_status,changed_by,changed_at').order('changed_at', { ascending: false }).limit(500),
    ])

    setCosts((costResult.data ?? []).map((row: any) => ({
      ...row,
      rate_amount: row.rate_amount == null ? null : Number(row.rate_amount),
      planned_hours: row.planned_hours == null ? null : Number(row.planned_hours),
      actual_hours: row.actual_hours == null ? null : Number(row.actual_hours),
      planned_amount: Number(row.planned_amount),
      paid_amount: row.paid_amount == null ? null : Number(row.paid_amount),
    })) as PersonnelCost[])
    setTeamMembers((teamResult.data ?? []) as TeamMember[])
    setStaff((staffResult.data ?? []) as Staff[])
    setAudit((auditResult.data ?? []) as Audit[])
    setMessage(costResult.error?.message ?? teamResult.error?.message ?? staffResult.error?.message ?? auditResult.error?.message ?? '')
  }

  const selected = costs.find((cost) => cost.id === selectedId) ?? null
  const budgetMap = useMemo(() => new Map(budgets.map((budget) => [budget.id, budget])), [budgets])
  const programMap = useMemo(() => new Map(programs.map((program) => [program.id, program])), [programs])
  const staffMap = useMemo(() => new Map(staff.map((person) => [person.user_id, person.display_name])), [staff])
  const selectedAudit = audit.filter((entry) => entry.personnel_cost_id === selectedId)

  const filteredCosts = costs.filter((cost) => {
    if (filter === 'all') return true
    if (filter === 'open') return !['paid','canceled'].includes(cost.status)
    return cost.status === filter
  })

  const hourlyPlanned = Number(rateAmount || 0) * Number(plannedHours || 0)
  const computedPlannedAmount = compensationType === 'hourly' ? hourlyPlanned : Number(plannedAmount || 0)
  const hourlyPaidDefault = Number(rateAmount || 0) * Number(actualHours || plannedHours || 0)

  function resetForm() {
    setSelectedId(null)
    setBudgetId('')
    setProgramId('')
    setTeamMemberId('')
    setWorkerName('')
    setRoleLabel('')
    setCompensationType('hourly')
    setRateAmount('')
    setPlannedHours('')
    setActualHours('')
    setPlannedAmount('')
    setPaidAmount('')
    setWorkStart('')
    setWorkEnd('')
    setNotes('')
    setDeleteConfirm(false)
  }

  function openCost(cost: PersonnelCost) {
    setSelectedId(cost.id)
    setBudgetId(String(cost.budget_id))
    setProgramId(cost.program_id ? String(cost.program_id) : '')
    setTeamMemberId(cost.team_member_id ? String(cost.team_member_id) : '')
    setWorkerName(cost.worker_name)
    setRoleLabel(cost.role_label ?? '')
    setCompensationType(cost.compensation_type)
    setRateAmount(cost.rate_amount == null ? '' : String(cost.rate_amount))
    setPlannedHours(cost.planned_hours == null ? '' : String(cost.planned_hours))
    setActualHours(cost.actual_hours == null ? '' : String(cost.actual_hours))
    setPlannedAmount(String(cost.planned_amount))
    setPaidAmount(cost.paid_amount == null ? '' : String(cost.paid_amount))
    setWorkStart(cost.work_starts_on ?? '')
    setWorkEnd(cost.work_ends_on ?? '')
    setNotes(cost.notes ?? '')
    setDeleteConfirm(false)
  }

  async function saveCost() {
    if (saving || !budgetId || !workerName.trim()) return
    if (selected && selected.status !== 'planned' && selected.status !== 'approved') {
      setMessage('Return this record to Planned before changing its pay plan.')
      return
    }

    const rate = rateAmount.trim() === '' ? null : Number(rateAmount)
    const plannedHrs = plannedHours.trim() === '' ? null : Number(plannedHours)
    const actualHrs = actualHours.trim() === '' ? null : Number(actualHours)
    const planAmount = compensationType === 'hourly'
      ? Number(rateAmount || 0) * Number(plannedHours || 0)
      : Number(plannedAmount || 0)
    const payAmount = paidAmount.trim() === '' ? null : Number(paidAmount)

    if (compensationType === 'hourly' && ((rate ?? 0) < 0 || (plannedHrs ?? 0) < 0 || rate == null || plannedHrs == null)) {
      setMessage('Hourly personnel costs need both an hourly rate and planned hours.')
      return
    }
    if (!Number.isFinite(planAmount) || planAmount < 0 || (payAmount != null && (!Number.isFinite(payAmount) || payAmount < 0))) {
      setMessage('Personnel cost amounts must be zero or greater.')
      return
    }
    if (workStart && workEnd && workEnd < workStart) {
      setMessage('Work end date cannot be earlier than the start date.')
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) return

    setSaving(true)
    setMessage('')

    const payload = {
      budget_id: Number(budgetId),
      program_id: programId ? Number(programId) : null,
      team_member_id: teamMemberId ? Number(teamMemberId) : null,
      worker_name: workerName.trim(),
      role_label: roleLabel.trim() || null,
      compensation_type: compensationType,
      rate_amount: compensationType === 'hourly' ? rate : compensationType === 'stipend' || compensationType === 'flat' ? (rate ?? null) : null,
      planned_hours: compensationType === 'hourly' ? plannedHrs : null,
      actual_hours: actualHrs,
      planned_amount: planAmount,
      paid_amount: payAmount,
      work_starts_on: workStart || null,
      work_ends_on: workEnd || null,
      notes: notes.trim() || null,
      updated_by: userId,
    }

    if (selected) {
      const { error } = await supabase.from('budget_personnel_costs').update(payload).eq('id', selected.id)
      if (error) setMessage(error.message)
      else {
        setMessage(selected.status === 'approved' ? 'Actual pay details updated.' : 'Personnel cost updated.')
        await loadData()
        onChanged()
      }
    } else {
      const { data, error } = await supabase.from('budget_personnel_costs').insert({ ...payload, created_by: userId }).select('id').single()
      if (error || !data) setMessage(error?.message ?? 'Could not create personnel cost.')
      else {
        setMessage('Personnel cost created as Planned.')
        await loadData()
        setSelectedId(data.id)
        onChanged()
      }
    }
    setSaving(false)
  }

  async function changeStatus(nextStatus: PersonnelStatus) {
    if (!selected || saving) return
    if (nextStatus === 'paid') {
      const pay = paidAmount.trim() === ''
        ? (selected.compensation_type === 'hourly' && actualHours.trim() !== '' ? hourlyPaidDefault : selected.planned_amount)
        : Number(paidAmount)
      if (!Number.isFinite(pay) || pay < 0) {
        setMessage('Enter a valid amount paid before marking this record Paid.')
        return
      }
      setSaving(true)
      const { error } = await supabase.from('budget_personnel_costs').update({
        status: nextStatus,
        actual_hours: actualHours.trim() === '' ? selected.actual_hours : Number(actualHours),
        paid_amount: pay,
      }).eq('id', selected.id)
      if (error) setMessage(error.message)
      else {
        setMessage('Personnel cost marked paid and moved into budget spending.')
        await loadData()
        onChanged()
      }
      setSaving(false)
      return
    }

    setSaving(true)
    const { error } = await supabase.from('budget_personnel_costs').update({ status: nextStatus }).eq('id', selected.id)
    if (error) setMessage(error.message)
    else {
      setMessage(`Personnel cost marked ${statusLabels[nextStatus].toLowerCase()}.`)
      await loadData()
      onChanged()
    }
    setSaving(false)
  }

  async function deleteCost() {
    if (!selected || selected.status === 'paid' || saving) return
    setSaving(true)
    const { data, error } = await supabase.from('budget_personnel_costs').delete().eq('id', selected.id).neq('status', 'paid').select('id').maybeSingle()
    if (error) setMessage(error.message)
    else if (!data) setMessage('This personnel cost could not be deleted.')
    else {
      setMessage('Personnel cost permanently deleted.')
      resetForm()
      await loadData()
      onChanged()
    }
    setSaving(false)
  }

  const editablePlan = !selected || selected.status === 'planned'
  const canEnterActual = selected?.status === 'approved'
  const totalPlanned = filteredCosts.reduce((sum, cost) => sum + cost.planned_amount, 0)

  return (
    <section className="personnel-costs-layout">
      {message && <div className="notice personnel-message">{message}</div>}

      <aside className="card personnel-cost-list">
        <div className="purchasing-list-heading">
          <div><span className="purchasing-kicker">Labor budget</span><h2>Youth workers & interns</h2></div>
          <button className="ghost" onClick={resetForm}>New</button>
        </div>
        <select className="purchasing-status-filter" value={filter} onChange={(event) => setFilter(event.target.value as any)}>
          <option value="open">Open personnel costs</option>
          <option value="all">All personnel costs</option>
          {Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div className="personnel-cost-list-items">
          {filteredCosts.map((cost) => <button className={selectedId === cost.id ? 'active' : ''} key={cost.id} onClick={() => openCost(cost)}>
            <span><strong>{cost.worker_name}</strong><small>{cost.role_label || compensationLabels[cost.compensation_type]} • {budgetMap.get(cost.budget_id)?.name ?? 'Budget'}</small></span>
            <span><em className={`purchase-status ${cost.status}`}>{statusLabels[cost.status]}</em><b>{money(cost.status === 'paid' ? (cost.paid_amount ?? cost.planned_amount) : cost.planned_amount)}</b></span>
          </button>)}
          {filteredCosts.length === 0 && <div className="purchasing-empty small"><strong>No personnel costs yet.</strong><span>Add a youth worker, intern, or other paid program role.</span></div>}
        </div>
        {filteredCosts.length > 0 && <div className="personnel-list-total"><span>Planned in this view</span><strong>{money(totalPlanned)}</strong></div>}
      </aside>

      <section className="card personnel-cost-editor">
        <div className="purchasing-panel-heading">
          <div><span className="purchasing-kicker">{selected ? 'Personnel cost' : 'New personnel cost'}</span><h2>{selected?.worker_name ?? 'Add worker or intern pay'}</h2></div>
          {selected && <em className={`purchase-status ${selected.status}`}>{statusLabels[selected.status]}</em>}
        </div>

        <div className="personnel-safety-note"><strong>Budget tracking only</strong><span>Do not enter SSNs, bank details, tax withholding, or direct-deposit information here.</span></div>

        <div className="purchasing-form">
          <div className="purchasing-form-grid">
            <label className="field"><span>Budget *</span><select disabled={!editablePlan} value={budgetId} onChange={(event) => {
              const value = event.target.value
              setBudgetId(value)
              const budget = budgetMap.get(Number(value))
              if (budget?.program_id) setProgramId(String(budget.program_id))
            }}><option value="">Choose budget…</option>{budgets.filter((budget) => budget.active).map((budget) => <option key={budget.id} value={budget.id}>{budget.name}</option>)}</select></label>

            <label className="field"><span>Program</span><select disabled={!editablePlan} value={programId} onChange={(event) => setProgramId(event.target.value)}><option value="">General center</option>{programs.filter((program) => !['archived','completed'].includes(program.status)).map((program) => <option key={program.id} value={program.id}>{program.name}{program.season_label ? ` • ${program.season_label}` : ''}</option>)}</select></label>

            <label className="field"><span>Team member</span><select disabled={!editablePlan} value={teamMemberId} onChange={(event) => {
              const value = event.target.value
              setTeamMemberId(value)
              const member = teamMembers.find((person) => String(person.id) === value)
              if (member) setWorkerName(member.display_name)
            }}><option value="">Not linked / enter name manually</option>{teamMembers.map((member) => <option key={member.id} value={member.id}>{member.display_name} • {member.member_type}</option>)}</select></label>

            <label className="field"><span>Worker / intern name *</span><input disabled={!editablePlan} value={workerName} onChange={(event) => setWorkerName(event.target.value)} /></label>
            <label className="field"><span>Role</span><input disabled={!editablePlan} value={roleLabel} onChange={(event) => setRoleLabel(event.target.value)} placeholder="Youth Worker, Summer Intern…" /></label>
            <label className="field"><span>Pay type</span><select disabled={!editablePlan} value={compensationType} onChange={(event) => setCompensationType(event.target.value as CompensationType)}><option value="hourly">Hourly</option><option value="stipend">Stipend</option><option value="flat">Flat payment</option></select></label>

            {compensationType === 'hourly' ? <>
              <label className="field"><span>Hourly rate</span><input disabled={!editablePlan} type="number" min="0" step="0.01" value={rateAmount} onChange={(event) => setRateAmount(event.target.value)} /></label>
              <label className="field"><span>Planned hours</span><input disabled={!editablePlan} type="number" min="0" step="0.25" value={plannedHours} onChange={(event) => setPlannedHours(event.target.value)} /></label>
              <div className="personnel-calculated"><span>Planned pay</span><strong>{money(computedPlannedAmount)}</strong></div>
            </> : <>
              <label className="field"><span>{compensationType === 'stipend' ? 'Stipend amount' : 'Flat payment amount'}</span><input disabled={!editablePlan} type="number" min="0" step="0.01" value={plannedAmount} onChange={(event) => setPlannedAmount(event.target.value)} /></label>
            </>}

            <label className="field"><span>Work starts</span><input disabled={!editablePlan} type="date" value={workStart} onChange={(event) => setWorkStart(event.target.value)} /></label>
            <label className="field"><span>Work ends</span><input disabled={!editablePlan} type="date" value={workEnd} onChange={(event) => setWorkEnd(event.target.value)} /></label>

            {canEnterActual && <>
              {selected?.compensation_type === 'hourly' && <label className="field"><span>Actual hours</span><input type="number" min="0" step="0.25" value={actualHours} onChange={(event) => setActualHours(event.target.value)} /></label>}
              <label className="field"><span>Amount paid</span><input type="number" min="0" step="0.01" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} placeholder={money(selected?.compensation_type === 'hourly' ? hourlyPaidDefault : selected?.planned_amount ?? 0)} /></label>
            </>}
          </div>

          <label className="field"><span>Notes</span><textarea disabled={selected?.status === 'paid' || selected?.status === 'canceled'} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional internal budget note" /></label>

          {editablePlan && <button className="primary" disabled={saving || !budgetId || !workerName.trim()} onClick={() => void saveCost()}>{saving ? 'Saving…' : selected ? 'Save personnel cost' : 'Create planned personnel cost'}</button>}
          {canEnterActual && <button className="ghost" disabled={saving} onClick={() => void saveCost()}>Save actual pay details</button>}
        </div>

        {selected && <div className="personnel-workflow">
          <div className="purchasing-panel-heading compact"><div><span className="purchasing-kicker">Workflow</span><h3>Pay status</h3></div></div>
          <div className="personnel-summary-strip">
            <span><small>Planned</small><strong>{money(selected.planned_amount)}</strong></span>
            <span><small>Actual / paid</small><strong>{selected.paid_amount == null ? '—' : money(selected.paid_amount)}</strong></span>
          </div>

          <div className="purchasing-status-actions">
            {selected.status === 'planned' && <><button className="primary" disabled={saving} onClick={() => void changeStatus('awaiting_approval')}>Submit for approval</button><button className="ghost danger-button" disabled={saving} onClick={() => void changeStatus('canceled')}>Cancel</button></>}
            {selected.status === 'awaiting_approval' && <><button className="ghost" disabled={saving} onClick={() => void changeStatus('planned')}>Return to planned</button><button className="primary" disabled={saving} onClick={() => void changeStatus('approved')}>Approve pay plan</button><button className="ghost danger-button" disabled={saving} onClick={() => void changeStatus('canceled')}>Decline / cancel</button></>}
            {selected.status === 'approved' && <><button className="primary" disabled={saving} onClick={() => void changeStatus('paid')}>Mark paid</button><button className="ghost danger-button" disabled={saving} onClick={() => void changeStatus('canceled')}>Cancel</button></>}
            {selected.status === 'paid' && <div className="purchasing-complete-note">✓ Paid and counted as budget spending.</div>}
            {selected.status === 'canceled' && <div className="purchasing-canceled-note">Canceled personnel costs do not count against the budget.</div>}
          </div>

          {selected.status !== 'paid' && <div className="personnel-delete-area">
            {!deleteConfirm ? <button className="ghost danger-button" disabled={saving} onClick={() => setDeleteConfirm(true)}>Delete personnel cost</button> : <div className="personnel-delete-confirm"><span><strong>Delete permanently?</strong><small>This is intended for test or duplicate records. Paid records cannot be deleted.</small></span><div><button className="ghost" disabled={saving} onClick={() => setDeleteConfirm(false)}>Keep</button><button className="ghost danger-button" disabled={saving} onClick={() => void deleteCost()}>{saving ? 'Deleting…' : 'Yes, delete'}</button></div></div>}
          </div>

          <div className="purchasing-timeline personnel-timeline">
            <span className="done"><b>Planned</b><small>{dateTimeLabel(selected.created_at)}</small></span>
            <span className={selected.submitted_at ? 'done' : ''}><b>Submitted</b><small>{dateTimeLabel(selected.submitted_at)}</small></span>
            <span className={selected.approved_at ? 'done' : ''}><b>Approved</b><small>{dateTimeLabel(selected.approved_at)}{selected.approved_by ? ` • ${staffMap.get(selected.approved_by) ?? 'Admin'}` : ''}</small></span>
            <span className={selected.paid_at ? 'done' : ''}><b>Paid</b><small>{dateTimeLabel(selected.paid_at)}{selected.paid_by ? ` • ${staffMap.get(selected.paid_by) ?? 'Admin'}` : ''}</small></span>
          </div>

          {selectedAudit.length > 0 && <details className="purchasing-audit"><summary>Status history</summary>{selectedAudit.map((entry) => <p key={entry.id}><strong>{entry.new_status ? statusLabels[entry.new_status as PersonnelStatus] ?? entry.new_status : entry.action}</strong><span>{dateTimeLabel(entry.changed_at)} • {entry.changed_by ? staffMap.get(entry.changed_by) ?? 'Admin' : 'System'}</span></p>)}</details>}
        </div>}
      </section>
    </section>
  )
}
