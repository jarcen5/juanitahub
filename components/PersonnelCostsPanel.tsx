'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Props = {
  budgets: Array<{ id: number; name: string; program_id: number | null; allocated_amount: number; active: boolean }>
  programs: Array<{ id: number; name: string; season_label: string | null; status: string }>
  onChanged: () => void
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
}

type TeamMember = {
  id: number
  display_name: string
  member_type: 'staff' | 'intern' | 'volunteer'
}

const statusLabels: Record<PersonnelStatus, string> = {
  planned: 'Planned',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved',
  paid: 'Paid',
  canceled: 'Canceled',
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

export default function PersonnelCostsPanel({ budgets, programs, onChanged }: Props) {
  const [costs, setCosts] = useState<PersonnelCost[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState<'open' | 'all'>('open')
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
  const [plannedAmount, setPlannedAmount] = useState('')
  const [workStart, setWorkStart] = useState('')
  const [workEnd, setWorkEnd] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    void loadPersonnel()
  }, [])

  async function loadPersonnel() {
    const [costResult, teamResult] = await Promise.all([
      supabase
        .from('budget_personnel_costs')
        .select('id,budget_id,program_id,team_member_id,worker_name,role_label,compensation_type,rate_amount,planned_hours,actual_hours,planned_amount,paid_amount,status,work_starts_on,work_ends_on,notes')
        .order('id', { ascending: false }),
      supabase
        .from('team_members')
        .select('id,display_name,member_type')
        .eq('active', true)
        .order('display_name'),
    ])

    const nextCosts = (costResult.data ?? []).map((row) => ({
      ...row,
      rate_amount: row.rate_amount == null ? null : Number(row.rate_amount),
      planned_hours: row.planned_hours == null ? null : Number(row.planned_hours),
      actual_hours: row.actual_hours == null ? null : Number(row.actual_hours),
      planned_amount: Number(row.planned_amount),
      paid_amount: row.paid_amount == null ? null : Number(row.paid_amount),
    })) as PersonnelCost[]

    setCosts(nextCosts)
    setTeamMembers((teamResult.data ?? []) as TeamMember[])
    setMessage(costResult.error?.message ?? teamResult.error?.message ?? '')
  }

  const selected = costs.find((cost) => cost.id === selectedId) ?? null
  const filteredCosts = costs.filter((cost) => filter === 'all' || !['paid', 'canceled'].includes(cost.status))
  const activeBudgets = budgets.filter((budget) => budget.active)
  const plannedPay = compensationType === 'hourly'
    ? Number(rateAmount || 0) * Number(plannedHours || 0)
    : Number(plannedAmount || 0)

  function budgetName(id: number) {
    return budgets.find((budget) => budget.id === id)?.name ?? 'Budget'
  }

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
    setPlannedAmount('')
    setWorkStart('')
    setWorkEnd('')
    setNotes('')
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
    setPlannedAmount(String(cost.planned_amount))
    setWorkStart(cost.work_starts_on ?? '')
    setWorkEnd(cost.work_ends_on ?? '')
    setNotes(cost.notes ?? '')
  }

  async function savePlannedCost() {
    if (saving || !budgetId || !workerName.trim()) return
    if (selected && selected.status !== 'planned') {
      setMessage('Return this personnel cost to Planned before changing the pay plan.')
      return
    }

    const rate = rateAmount === '' ? null : Number(rateAmount)
    const hours = plannedHours === '' ? null : Number(plannedHours)
    const amount = compensationType === 'hourly'
      ? Number(rateAmount || 0) * Number(plannedHours || 0)
      : Number(plannedAmount || 0)

    if (compensationType === 'hourly' && (rate == null || hours == null || rate < 0 || hours < 0)) {
      setMessage('Hourly pay needs both a valid hourly rate and planned hours.')
      return
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage('Planned pay must be zero or greater.')
      return
    }
    if (workStart && workEnd && workEnd < workStart) {
      setMessage('Work end date cannot be earlier than the start date.')
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) return

    const payload = {
      budget_id: Number(budgetId),
      program_id: programId ? Number(programId) : null,
      team_member_id: teamMemberId ? Number(teamMemberId) : null,
      worker_name: workerName.trim(),
      role_label: roleLabel.trim() || null,
      compensation_type: compensationType,
      rate_amount: compensationType === 'hourly' ? rate : null,
      planned_hours: compensationType === 'hourly' ? hours : null,
      planned_amount: amount,
      work_starts_on: workStart || null,
      work_ends_on: workEnd || null,
      notes: notes.trim() || null,
      updated_by: userId,
    }

    setSaving(true)
    setMessage('')

    if (selected) {
      const { error } = await supabase.from('budget_personnel_costs').update(payload).eq('id', selected.id)
      if (error) {
        setMessage(error.message)
      } else {
        setMessage('Personnel cost updated.')
        await loadPersonnel()
        onChanged()
      }
    } else {
      const { data, error } = await supabase
        .from('budget_personnel_costs')
        .insert({ ...payload, created_by: userId })
        .select('id')
        .single()

      if (error || !data) {
        setMessage(error?.message ?? 'Could not create personnel cost.')
      } else {
        setMessage('Personnel cost created as Planned.')
        await loadPersonnel()
        setSelectedId(data.id)
        onChanged()
      }
    }

    setSaving(false)
  }

  return (
    <section className="personnel-costs-layout">
      {message && <div className="notice personnel-message">{message}</div>}

      <aside className="card personnel-cost-list">
        <div className="purchasing-list-heading">
          <div><span className="purchasing-kicker">Labor budget</span><h2>Youth workers & interns</h2></div>
          <button className="ghost" onClick={resetForm}>New</button>
        </div>

        <select className="purchasing-status-filter" value={filter} onChange={(event) => setFilter(event.target.value as 'open' | 'all')}>
          <option value="open">Open personnel costs</option>
          <option value="all">All personnel costs</option>
        </select>

        <div className="personnel-cost-list-items">
          {filteredCosts.map((cost) => (
            <button key={cost.id} className={selectedId === cost.id ? 'active' : ''} onClick={() => openCost(cost)}>
              <span><strong>{cost.worker_name}</strong><small>{cost.role_label || cost.compensation_type} • {budgetName(cost.budget_id)}</small></span>
              <span><em className={`purchase-status ${cost.status}`}>{statusLabels[cost.status]}</em><b>{money(cost.status === 'paid' ? (cost.paid_amount ?? cost.planned_amount) : cost.planned_amount)}</b></span>
            </button>
          ))}
          {filteredCosts.length === 0 && <div className="purchasing-empty small"><strong>No personnel costs yet.</strong><span>Add a youth worker, intern, or other paid program role.</span></div>}
        </div>
      </aside>

      <section className="card personnel-cost-editor">
        <div className="purchasing-panel-heading">
          <div><span className="purchasing-kicker">{selected ? 'Personnel cost' : 'New personnel cost'}</span><h2>{selected?.worker_name ?? 'Add worker or intern pay'}</h2></div>
          {selected && <em className={`purchase-status ${selected.status}`}>{statusLabels[selected.status]}</em>}
        </div>

        <div className="personnel-safety-note">
          <strong>Budget tracking only</strong>
          <span>Do not enter SSNs, bank information, tax withholding, or direct-deposit details here.</span>
        </div>

        <div className="purchasing-form">
          <div className="purchasing-form-grid">
            <label className="field"><span>Budget *</span><select disabled={Boolean(selected && selected.status !== 'planned')} value={budgetId} onChange={(event) => {
              const value = event.target.value
              setBudgetId(value)
              const budget = budgets.find((entry) => String(entry.id) === value)
              if (budget?.program_id) setProgramId(String(budget.program_id))
            }}><option value="">Choose budget…</option>{activeBudgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.name}</option>)}</select></label>

            <label className="field"><span>Program</span><select disabled={Boolean(selected && selected.status !== 'planned')} value={programId} onChange={(event) => setProgramId(event.target.value)}><option value="">General center</option>{programs.filter((program) => !['archived','completed'].includes(program.status)).map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>

            <label className="field"><span>Team member</span><select disabled={Boolean(selected && selected.status !== 'planned')} value={teamMemberId} onChange={(event) => {
              const value = event.target.value
              setTeamMemberId(value)
              const member = teamMembers.find((entry) => String(entry.id) === value)
              if (member) setWorkerName(member.display_name)
            }}><option value="">Not linked / enter name manually</option>{teamMembers.map((member) => <option key={member.id} value={member.id}>{member.display_name} • {member.member_type}</option>)}</select></label>

            <label className="field"><span>Name *</span><input disabled={Boolean(selected && selected.status !== 'planned')} value={workerName} onChange={(event) => setWorkerName(event.target.value)} /></label>
            <label className="field"><span>Role</span><input disabled={Boolean(selected && selected.status !== 'planned')} value={roleLabel} onChange={(event) => setRoleLabel(event.target.value)} placeholder="Youth Worker, Summer Intern…" /></label>
            <label className="field"><span>Pay type</span><select disabled={Boolean(selected && selected.status !== 'planned')} value={compensationType} onChange={(event) => setCompensationType(event.target.value as CompensationType)}><option value="hourly">Hourly</option><option value="stipend">Stipend</option><option value="flat">Flat payment</option></select></label>

            {compensationType === 'hourly' ? (
              <>
                <label className="field"><span>Hourly rate</span><input disabled={Boolean(selected && selected.status !== 'planned')} type="number" min="0" step="0.01" value={rateAmount} onChange={(event) => setRateAmount(event.target.value)} /></label>
                <label className="field"><span>Planned hours</span><input disabled={Boolean(selected && selected.status !== 'planned')} type="number" min="0" step="0.25" value={plannedHours} onChange={(event) => setPlannedHours(event.target.value)} /></label>
                <div className="personnel-calculated"><span>Planned pay</span><strong>{money(plannedPay)}</strong></div>
              </>
            ) : (
              <label className="field"><span>{compensationType === 'stipend' ? 'Stipend amount' : 'Flat payment amount'}</span><input disabled={Boolean(selected && selected.status !== 'planned')} type="number" min="0" step="0.01" value={plannedAmount} onChange={(event) => setPlannedAmount(event.target.value)} /></label>
            )}

            <label className="field"><span>Work starts</span><input disabled={Boolean(selected && selected.status !== 'planned')} type="date" value={workStart} onChange={(event) => setWorkStart(event.target.value)} /></label>
            <label className="field"><span>Work ends</span><input disabled={Boolean(selected && selected.status !== 'planned')} type="date" value={workEnd} onChange={(event) => setWorkEnd(event.target.value)} /></label>
          </div>

          <label className="field"><span>Notes</span><textarea disabled={Boolean(selected && selected.status !== 'planned')} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>

          {(!selected || selected.status === 'planned') && <button className="primary" disabled={saving || !budgetId || !workerName.trim()} onClick={() => void savePlannedCost()}>{saving ? 'Saving…' : selected ? 'Save personnel cost' : 'Create planned personnel cost'}</button>}
          {selected && selected.status !== 'planned' && <div className="purchasing-empty small"><strong>Pay plan locked</strong><span>Once submitted for approval, planned pay details are protected from accidental changes.</span></div>}
        </div>
      </section>
    </section>
  )
}
