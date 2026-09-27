'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type Program = { id: number; name: string; season_label: string | null; status: string }
type Budget = {
  id: number
  name: string
  period_label: string | null
  starts_on: string | null
  ends_on: string | null
  program_id: number | null
  allocated_amount: number
  notes: string | null
  active: boolean
}
type BudgetSummary = {
  budget_id: number
  allocated_amount: number
  committed_amount: number
  spent_amount: number
  available_amount: number
}
type PurchaseStatus = 'planned' | 'awaiting_approval' | 'approved' | 'ordered' | 'received' | 'canceled'
type PurchaseRequest = {
  id: number
  budget_id: number
  program_id: number | null
  vendor: string | null
  status: PurchaseStatus
  order_reference: string | null
  notes: string | null
  requested_by: string
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  ordered_by: string | null
  ordered_at: string | null
  received_by: string | null
  received_at: string | null
  canceled_by: string | null
  canceled_at: string | null
  created_at: string
}
type RequestTotal = { purchase_request_id: number; estimated_total: number; current_total: number }
type RequestItem = {
  id: number
  purchase_request_id: number
  description: string
  quantity: number
  unit: string
  estimated_unit_cost: number
  actual_unit_cost: number | null
  inventory_category_id: number | null
  inventory_item_id: number | null
  inventory_location_id: number | null
  add_to_inventory: boolean
  received_to_inventory_at: string | null
  notes: string | null
}
type InventoryItem = { id: number; name: string; unit: string; active: boolean }
type InventoryLocation = { id: number; name: string; parent_location_id: number | null; active: boolean }
type InventoryCategory = { id: number; name: string; active: boolean }
type Staff = { user_id: string; display_name: string }
type Audit = { id: number; purchase_request_id: number; action: string; old_status: string | null; new_status: string | null; changed_by: string | null; changed_at: string }

const statusLabels: Record<PurchaseStatus, string> = {
  planned: 'Planned',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved',
  ordered: 'Ordered',
  received: 'Received',
  canceled: 'Canceled',
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function dateLabel(value: string | null) {
  if (!value) return 'Not set'
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function dateTimeLabel(value: string | null) {
  if (!value) return 'Not yet'
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function PurchasingPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [summaries, setSummaries] = useState<BudgetSummary[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [requests, setRequests] = useState<PurchaseRequest[]>([])
  const [totals, setTotals] = useState<RequestTotal[]>([])
  const [requestItems, setRequestItems] = useState<RequestItem[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [inventoryLocations, setInventoryLocations] = useState<InventoryLocation[]>([])
  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategory[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<'budgets' | 'purchases'>('budgets')

  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null)
  const [budgetName, setBudgetName] = useState('')
  const [budgetPeriod, setBudgetPeriod] = useState('')
  const [budgetStart, setBudgetStart] = useState('')
  const [budgetEnd, setBudgetEnd] = useState('')
  const [budgetProgram, setBudgetProgram] = useState('')
  const [budgetAllocated, setBudgetAllocated] = useState('')
  const [budgetNotes, setBudgetNotes] = useState('')

  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null)
  const [requestBudget, setRequestBudget] = useState('')
  const [requestProgram, setRequestProgram] = useState('')
  const [requestVendor, setRequestVendor] = useState('')
  const [requestNotes, setRequestNotes] = useState('')
  const [orderReference, setOrderReference] = useState('')
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | PurchaseStatus>('open')

  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [lineDescription, setLineDescription] = useState('')
  const [lineQuantity, setLineQuantity] = useState('1')
  const [lineUnit, setLineUnit] = useState('each')
  const [lineEstimated, setLineEstimated] = useState('')
  const [lineActual, setLineActual] = useState('')
  const [lineCategory, setLineCategory] = useState('')
  const [lineAddInventory, setLineAddInventory] = useState(false)
  const [lineInventoryItem, setLineInventoryItem] = useState('')
  const [lineInventoryLocation, setLineInventoryLocation] = useState('')
  const [lineNotes, setLineNotes] = useState('')

  useEffect(() => {
    let mounted = true
    void supabase.auth.getSession().then(({ data }) => { if (mounted) setSession(data.session) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { if (mounted) setSession(next) })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (session) void loadData()
    else setLoading(false)
  }, [session])

  async function loadData() {
    if (!session) return
    setLoading(true)
    const profileResult = await supabase.from('staff_profiles').select('display_name,role,active').eq('user_id', session.user.id).maybeSingle()
    const currentProfile = profileResult.data as Profile | null
    setProfile(currentProfile)

    if (!currentProfile?.active || currentProfile.role !== 'admin') {
      setLoading(false)
      return
    }

    const [budgetResult, summaryResult, programResult, requestResult, totalResult, itemResult, inventoryItemResult, locationResult, categoryResult, staffResult, auditResult] = await Promise.all([
      supabase.from('budget_accounts').select('id,name,period_label,starts_on,ends_on,program_id,allocated_amount,notes,active').order('active', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('budget_financial_summary').select('budget_id,allocated_amount,committed_amount,spent_amount,available_amount'),
      supabase.from('programs').select('id,name,season_label,status').order('name'),
      supabase.from('purchase_requests').select('id,budget_id,program_id,vendor,status,order_reference,notes,requested_by,submitted_at,approved_by,approved_at,ordered_by,ordered_at,received_by,received_at,canceled_by,canceled_at,created_at').order('created_at', { ascending: false }),
      supabase.from('purchase_request_totals').select('purchase_request_id,estimated_total,current_total'),
      supabase.from('purchase_request_items').select('id,purchase_request_id,description,quantity,unit,estimated_unit_cost,actual_unit_cost,inventory_category_id,inventory_item_id,inventory_location_id,add_to_inventory,received_to_inventory_at,notes').order('id'),
      supabase.from('inventory_items').select('id,name,unit,active').eq('active', true).order('name'),
      supabase.from('inventory_locations').select('id,name,parent_location_id,active').eq('active', true).order('name'),
      supabase.from('inventory_categories').select('id,name,active').eq('active', true).order('name'),
      supabase.from('staff_profiles').select('user_id,display_name').eq('active', true),
      supabase.from('purchase_request_audit').select('id,purchase_request_id,action,old_status,new_status,changed_by,changed_at').order('changed_at', { ascending: false }).limit(500),
    ])

    setBudgets((budgetResult.data ?? []).map((row: any) => ({ ...row, allocated_amount: Number(row.allocated_amount) })) as Budget[])
    setSummaries((summaryResult.data ?? []).map((row: any) => ({
      ...row,
      allocated_amount: Number(row.allocated_amount),
      committed_amount: Number(row.committed_amount),
      spent_amount: Number(row.spent_amount),
      available_amount: Number(row.available_amount),
    })) as BudgetSummary[])
    setPrograms((programResult.data ?? []) as Program[])
    setRequests((requestResult.data ?? []) as PurchaseRequest[])
    setTotals((totalResult.data ?? []).map((row: any) => ({ ...row, estimated_total: Number(row.estimated_total), current_total: Number(row.current_total) })) as RequestTotal[])
    setRequestItems((itemResult.data ?? []).map((row: any) => ({
      ...row,
      quantity: Number(row.quantity),
      estimated_unit_cost: Number(row.estimated_unit_cost),
      actual_unit_cost: row.actual_unit_cost == null ? null : Number(row.actual_unit_cost),
    })) as RequestItem[])
    setInventoryItems((inventoryItemResult.data ?? []) as InventoryItem[])
    setInventoryLocations((locationResult.data ?? []) as InventoryLocation[])
    setInventoryCategories((categoryResult.data ?? []) as InventoryCategory[])
    setStaff((staffResult.data ?? []) as Staff[])
    setAudit((auditResult.data ?? []) as Audit[])

    const error = profileResult.error?.message
      ?? budgetResult.error?.message
      ?? summaryResult.error?.message
      ?? programResult.error?.message
      ?? requestResult.error?.message
      ?? totalResult.error?.message
      ?? itemResult.error?.message
      ?? inventoryItemResult.error?.message
      ?? locationResult.error?.message
      ?? categoryResult.error?.message
      ?? staffResult.error?.message
      ?? auditResult.error?.message
      ?? ''
    setMessage(error)
    setLoading(false)
  }

  const programMap = useMemo(() => new Map(programs.map((program) => [program.id, program])), [programs])
  const budgetMap = useMemo(() => new Map(budgets.map((budget) => [budget.id, budget])), [budgets])
  const summaryMap = useMemo(() => new Map(summaries.map((summary) => [summary.budget_id, summary])), [summaries])
  const totalMap = useMemo(() => new Map(totals.map((total) => [total.purchase_request_id, total])), [totals])
  const staffMap = useMemo(() => new Map(staff.map((person) => [person.user_id, person.display_name])), [staff])
  const inventoryItemMap = useMemo(() => new Map(inventoryItems.map((item) => [item.id, item])), [inventoryItems])
  const inventoryLocationMap = useMemo(() => new Map(inventoryLocations.map((location) => [location.id, location])), [inventoryLocations])

  const locationLabel = (id: number) => {
    const location = inventoryLocationMap.get(id)
    if (!location) return 'Unknown location'
    if (!location.parent_location_id) return location.name
    const parent = inventoryLocationMap.get(location.parent_location_id)
    return parent ? `${parent.name} → ${location.name}` : location.name
  }

  const activeBudgets = budgets.filter((budget) => budget.active)
  const totalAllocated = summaries.filter((summary) => budgetMap.get(summary.budget_id)?.active).reduce((sum, summary) => sum + summary.allocated_amount, 0)
  const totalCommitted = summaries.filter((summary) => budgetMap.get(summary.budget_id)?.active).reduce((sum, summary) => sum + summary.committed_amount, 0)
  const totalSpent = summaries.filter((summary) => budgetMap.get(summary.budget_id)?.active).reduce((sum, summary) => sum + summary.spent_amount, 0)
  const totalAvailable = summaries.filter((summary) => budgetMap.get(summary.budget_id)?.active).reduce((sum, summary) => sum + summary.available_amount, 0)

  const selectedBudget = budgets.find((budget) => budget.id === selectedBudgetId) ?? null
  const selectedRequest = requests.find((request) => request.id === selectedRequestId) ?? null
  const selectedRequestItems = requestItems.filter((item) => item.purchase_request_id === selectedRequestId)
  const selectedRequestAudit = audit.filter((entry) => entry.purchase_request_id === selectedRequestId)
  const selectedTotal = selectedRequest ? totalMap.get(selectedRequest.id) : null

  const filteredRequests = requests.filter((request) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'open') return !['received','canceled'].includes(request.status)
    return request.status === statusFilter
  })

  function resetBudgetForm() {
    setSelectedBudgetId(null)
    setBudgetName('')
    setBudgetPeriod('')
    setBudgetStart('')
    setBudgetEnd('')
    setBudgetProgram('')
    setBudgetAllocated('')
    setBudgetNotes('')
  }

  function editBudget(budget: Budget) {
    setSelectedBudgetId(budget.id)
    setBudgetName(budget.name)
    setBudgetPeriod(budget.period_label ?? '')
    setBudgetStart(budget.starts_on ?? '')
    setBudgetEnd(budget.ends_on ?? '')
    setBudgetProgram(budget.program_id ? String(budget.program_id) : '')
    setBudgetAllocated(String(budget.allocated_amount))
    setBudgetNotes(budget.notes ?? '')
  }

  async function saveBudget() {
    if (!session || !profile || saving || !budgetName.trim()) return
    const amount = Number(budgetAllocated)
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage('Budget allocation must be zero or greater.')
      return
    }
    if (budgetStart && budgetEnd && budgetEnd < budgetStart) {
      setMessage('Budget end date cannot be earlier than its start date.')
      return
    }

    setSaving(true)
    setMessage('')
    const payload = {
      name: budgetName.trim(),
      period_label: budgetPeriod.trim() || null,
      starts_on: budgetStart || null,
      ends_on: budgetEnd || null,
      program_id: budgetProgram ? Number(budgetProgram) : null,
      allocated_amount: amount,
      notes: budgetNotes.trim() || null,
      updated_by: session.user.id,
    }

    if (selectedBudget) {
      const { error } = await supabase.from('budget_accounts').update(payload).eq('id', selectedBudget.id)
      if (error) setMessage(error.message)
      else {
        setMessage('Budget updated.')
        await loadData()
      }
    } else {
      const { error } = await supabase.from('budget_accounts').insert({ ...payload, created_by: session.user.id })
      if (error) setMessage(error.message)
      else {
        setMessage('Budget created.')
        resetBudgetForm()
        await loadData()
      }
    }
    setSaving(false)
  }

  async function archiveBudget() {
    if (!selectedBudget || !session || saving) return
    const openRequests = requests.filter((request) => request.budget_id === selectedBudget.id && !['received','canceled'].includes(request.status))
    if (openRequests.length) {
      setMessage('Finish or cancel this budget’s open purchase requests before archiving it.')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('budget_accounts').update({ active: false, updated_by: session.user.id }).eq('id', selectedBudget.id)
    if (error) setMessage(error.message)
    else {
      setMessage('Budget archived. Its purchase history is preserved.')
      resetBudgetForm()
      await loadData()
    }
    setSaving(false)
  }

  function resetRequestForm() {
    setSelectedRequestId(null)
    setRequestBudget('')
    setRequestProgram('')
    setRequestVendor('')
    setRequestNotes('')
    setOrderReference('')
    resetLineForm()
  }

  function openRequest(request: PurchaseRequest) {
    setSelectedRequestId(request.id)
    setRequestBudget(String(request.budget_id))
    setRequestProgram(request.program_id ? String(request.program_id) : '')
    setRequestVendor(request.vendor ?? '')
    setRequestNotes(request.notes ?? '')
    setOrderReference(request.order_reference ?? '')
    resetLineForm()
    setTab('purchases')
  }

  async function createRequest() {
    if (!session || saving || !requestBudget) return
    const budget = budgetMap.get(Number(requestBudget))
    if (!budget?.active) {
      setMessage('Choose an active budget.')
      return
    }
    setSaving(true)
    setMessage('')
    const { data, error } = await supabase.from('purchase_requests').insert({
      budget_id: Number(requestBudget),
      program_id: requestProgram ? Number(requestProgram) : (budget.program_id ?? null),
      vendor: requestVendor.trim() || null,
      notes: requestNotes.trim() || null,
      requested_by: session.user.id,
      updated_by: session.user.id,
    }).select('id').single()

    if (error || !data) setMessage(error?.message ?? 'Could not create the purchase request.')
    else {
      setMessage('Purchase request created as Planned. Add line items before submitting it for approval.')
      await loadData()
      setSelectedRequestId(data.id)
    }
    setSaving(false)
  }

  async function saveRequestDetails() {
    if (!selectedRequest || !session || saving) return
    if (['received','canceled'].includes(selectedRequest.status)) return
    setSaving(true)
    const { error } = await supabase.from('purchase_requests').update({
      vendor: requestVendor.trim() || null,
      program_id: requestProgram ? Number(requestProgram) : null,
      notes: requestNotes.trim() || null,
      order_reference: orderReference.trim() || null,
      updated_by: session.user.id,
    }).eq('id', selectedRequest.id)
    if (error) setMessage(error.message)
    else {
      setMessage('Purchase details saved.')
      await loadData()
    }
    setSaving(false)
  }

  function resetLineForm() {
    setEditingItemId(null)
    setLineDescription('')
    setLineQuantity('1')
    setLineUnit('each')
    setLineEstimated('')
    setLineActual('')
    setLineCategory('')
    setLineAddInventory(false)
    setLineInventoryItem('')
    setLineInventoryLocation('')
    setLineNotes('')
  }

  function editLine(item: RequestItem) {
    setEditingItemId(item.id)
    setLineDescription(item.description)
    setLineQuantity(String(item.quantity))
    setLineUnit(item.unit)
    setLineEstimated(String(item.estimated_unit_cost))
    setLineActual(item.actual_unit_cost == null ? '' : String(item.actual_unit_cost))
    setLineCategory(item.inventory_category_id ? String(item.inventory_category_id) : '')
    setLineAddInventory(item.add_to_inventory)
    setLineInventoryItem(item.inventory_item_id ? String(item.inventory_item_id) : '')
    setLineInventoryLocation(item.inventory_location_id ? String(item.inventory_location_id) : '')
    setLineNotes(item.notes ?? '')
  }

  async function saveLineItem() {
    if (!selectedRequest || saving || !lineDescription.trim()) return
    const quantity = Number(lineQuantity)
    const estimated = Number(lineEstimated || 0)
    const actual = lineActual.trim() === '' ? null : Number(lineActual)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessage('Line item quantity must be greater than zero.')
      return
    }
    if (!Number.isFinite(estimated) || estimated < 0 || (actual != null && (!Number.isFinite(actual) || actual < 0))) {
      setMessage('Costs must be zero or greater.')
      return
    }
    if (lineAddInventory && (!lineInventoryItem || !lineInventoryLocation)) {
      setMessage('Choose both an Inventory item and destination location when Add to Inventory is enabled.')
      return
    }

    setSaving(true)
    setMessage('')
    const payload = {
      description: lineDescription.trim(),
      quantity,
      unit: lineUnit.trim() || 'each',
      estimated_unit_cost: estimated,
      actual_unit_cost: actual,
      inventory_category_id: lineCategory ? Number(lineCategory) : null,
      inventory_item_id: lineAddInventory ? Number(lineInventoryItem) : null,
      inventory_location_id: lineAddInventory ? Number(lineInventoryLocation) : null,
      add_to_inventory: lineAddInventory,
      notes: lineNotes.trim() || null,
    }

    if (editingItemId) {
      const { error } = await supabase.from('purchase_request_items').update(payload).eq('id', editingItemId)
      if (error) setMessage(error.message)
      else {
        setMessage('Line item updated.')
        resetLineForm()
        await loadData()
      }
    } else {
      const { error } = await supabase.from('purchase_request_items').insert({ ...payload, purchase_request_id: selectedRequest.id })
      if (error) setMessage(error.message)
      else {
        setMessage('Line item added.')
        resetLineForm()
        await loadData()
      }
    }
    setSaving(false)
  }

  async function deleteLineItem(id: number) {
    if (!selectedRequest || saving || ['received','canceled'].includes(selectedRequest.status)) return
    setSaving(true)
    const { data, error } = await supabase.from('purchase_request_items').delete().eq('id', id).select('id').maybeSingle()
    if (error) setMessage(error.message)
    else if (!data) setMessage('The line item could not be removed.')
    else {
      if (editingItemId === id) resetLineForm()
      setMessage('Line item removed.')
      await loadData()
    }
    setSaving(false)
  }

  async function changeStatus(next: PurchaseStatus) {
    if (!selectedRequest || !session || saving) return
    if (next === 'awaiting_approval' && selectedRequestItems.length === 0) {
      setMessage('Add at least one line item before submitting this request for approval.')
      return
    }
    if (next === 'received') {
      setSaving(true)
      setMessage('')
      const { data, error } = await supabase.rpc('receive_purchase_request', { p_request_id: selectedRequest.id })
      if (error) setMessage(error.message)
      else {
        const inventoryCount = Number((data as any)?.inventory_items_received ?? 0)
        setMessage(`Purchase received.${inventoryCount ? ` ${inventoryCount} line item${inventoryCount === 1 ? '' : 's'} added to Inventory.` : ''}`)
        await loadData()
      }
      setSaving(false)
      return
    }

    setSaving(true)
    setMessage('')
    const { error } = await supabase.from('purchase_requests').update({ status: next, updated_by: session.user.id }).eq('id', selectedRequest.id)
    if (error) setMessage(error.message)
    else {
      setMessage(`Purchase request marked ${statusLabels[next].toLowerCase()}.`)
      await loadData()
    }
    setSaving(false)
  }

  const awaitingCount = requests.filter((request) => request.status === 'awaiting_approval').length
  const orderedCount = requests.filter((request) => request.status === 'ordered').length

  if (loading && !profile) return <main className="login-wrap"><div className="card login-card">Loading Budgets & Purchasing…</div></main>
  if (!session) return <main className="login-wrap"><div className="card login-card"><h1>Budgets & Purchasing</h1><p className="subtle">Sign in to Juanita Hub to continue.</p></div></main>
  if (!profile?.active || profile.role !== 'admin') return <main className="login-wrap"><div className="card login-card"><h1>Budgets & Purchasing</h1><p className="subtle">Admin access is required for financial information.</p></div></main>

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Budgets & Purchasing</small></div>
        <div className="toolbar"><span>{profile.display_name} <span className="badge">admin</span></span></div>
      </header>

      <main className="main purchasing-page">
        <section className="hero purchasing-hero">
          <div><span className="purchasing-kicker">Financial operations</span><h1>Budgets & Purchasing</h1><p className="subtle">Plan purchases, approve spending, track committed funds, receive orders, and send supplies directly into Inventory.</p></div>
          <button className="primary" onClick={() => { resetRequestForm(); setTab('purchases') }}>+ New purchase request</button>
        </section>

        {message && <div className="notice">{message}</div>}

        <section className="grid stats purchasing-stats">
          <div className="card stat"><span className="subtle">Allocated</span><strong>{money(totalAllocated)}</strong></div>
          <div className="card stat"><span className="subtle">Committed</span><strong>{money(totalCommitted)}</strong></div>
          <div className="card stat"><span className="subtle">Spent</span><strong>{money(totalSpent)}</strong></div>
          <div className={`card stat ${totalAvailable < 0 ? 'purchasing-negative' : ''}`}><span className="subtle">Available</span><strong>{money(totalAvailable)}</strong></div>
        </section>

        <div className="purchasing-tabs">
          <button className={tab === 'budgets' ? 'active' : ''} onClick={() => setTab('budgets')}>Budgets</button>
          <button className={tab === 'purchases' ? 'active' : ''} onClick={() => setTab('purchases')}>Purchase Requests <span>{awaitingCount + orderedCount}</span></button>
        </div>

        {tab === 'budgets' && <section className="purchasing-budget-layout">
          <div className="purchasing-budget-list">
            {activeBudgets.length === 0 && <section className="card purchasing-empty"><strong>No budgets yet.</strong><span>Create the first budget to begin tracking planned, committed, and spent funds.</span></section>}
            {activeBudgets.map((budget) => {
              const summary = summaryMap.get(budget.id) ?? { budget_id: budget.id, allocated_amount: budget.allocated_amount, committed_amount: 0, spent_amount: 0, available_amount: budget.allocated_amount }
              const percent = budget.allocated_amount > 0 ? Math.min(100, Math.max(0, ((summary.spent_amount + summary.committed_amount) / budget.allocated_amount) * 100)) : 0
              return <button className={`card purchasing-budget-card ${selectedBudgetId === budget.id ? 'selected' : ''}`} key={budget.id} onClick={() => editBudget(budget)}>
                <div className="purchasing-budget-heading"><div><h3>{budget.name}</h3><span>{budget.period_label || [dateLabel(budget.starts_on), dateLabel(budget.ends_on)].join(' – ')}</span></div><strong>{money(summary.available_amount)}<small>available</small></strong></div>
                <div className="purchasing-budget-bar"><span style={{ width: `${percent}%` }} /></div>
                <div className="purchasing-budget-metrics"><span><b>{money(summary.allocated_amount)}</b> allocated</span><span><b>{money(summary.committed_amount)}</b> committed</span><span><b>{money(summary.spent_amount)}</b> spent</span></div>
                {budget.program_id && <div className="purchasing-program-chip">{programMap.get(budget.program_id)?.name ?? 'Program budget'}</div>}
              </button>
            })}
          </div>

          <aside className="card purchasing-editor">
            <div className="purchasing-panel-heading"><div><span className="purchasing-kicker">{selectedBudget ? 'Budget details' : 'New budget'}</span><h2>{selectedBudget?.name ?? 'Create a budget'}</h2></div>{selectedBudget && <button className="ghost" onClick={resetBudgetForm}>New</button>}</div>
            <div className="purchasing-form">
              <label className="field"><span>Budget name *</span><input value={budgetName} onChange={(event) => setBudgetName(event.target.value)} placeholder="Summer Program 2027" /></label>
              <div className="purchasing-form-grid">
                <label className="field"><span>Period label</span><input value={budgetPeriod} onChange={(event) => setBudgetPeriod(event.target.value)} placeholder="FY 2027, Summer 2027…" /></label>
                <label className="field"><span>Allocated amount</span><input type="number" min="0" step="0.01" value={budgetAllocated} onChange={(event) => setBudgetAllocated(event.target.value)} /></label>
                <label className="field"><span>Starts</span><input type="date" value={budgetStart} onChange={(event) => setBudgetStart(event.target.value)} /></label>
                <label className="field"><span>Ends</span><input type="date" value={budgetEnd} onChange={(event) => setBudgetEnd(event.target.value)} /></label>
                <label className="field full"><span>Program</span><select value={budgetProgram} onChange={(event) => setBudgetProgram(event.target.value)}><option value="">General center budget</option>{programs.filter((program) => !['archived','completed'].includes(program.status)).map((program) => <option key={program.id} value={program.id}>{program.name}{program.season_label ? ` • ${program.season_label}` : ''}</option>)}</select></label>
              </div>
              <label className="field"><span>Notes</span><textarea rows={4} value={budgetNotes} onChange={(event) => setBudgetNotes(event.target.value)} /></label>
              <button className="primary" disabled={saving || !budgetName.trim()} onClick={() => void saveBudget()}>{saving ? 'Saving…' : selectedBudget ? 'Save budget' : 'Create budget'}</button>
              {selectedBudget && <button className="ghost danger-button" disabled={saving} onClick={() => void archiveBudget()}>Archive budget</button>}
            </div>
          </aside>
        </section>}

        {tab === 'purchases' && <section className="purchasing-request-layout">
          <aside className="card purchasing-request-list">
            <div className="purchasing-list-heading"><div><span className="purchasing-kicker">Requests</span><h2>Purchases</h2></div><button className="ghost" onClick={resetRequestForm}>New</button></div>
            <select className="purchasing-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as any)}><option value="open">Open requests</option><option value="all">All requests</option>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
            <div className="purchasing-request-list-items">
              {filteredRequests.map((request) => {
                const total = totalMap.get(request.id)
                return <button key={request.id} className={selectedRequestId === request.id ? 'active' : ''} onClick={() => openRequest(request)}>
                  <span><strong>Request #{request.id}</strong><small>{request.vendor || 'Vendor not set'} • {budgetMap.get(request.budget_id)?.name ?? 'Budget'}</small></span>
                  <span><em className={`purchase-status ${request.status}`}>{statusLabels[request.status]}</em><b>{money(total?.current_total ?? 0)}</b></span>
                </button>
              })}
              {filteredRequests.length === 0 && <div className="purchasing-empty small">No purchase requests match this view.</div>}
            </div>
          </aside>

          <div className="purchasing-request-workspace">
            {!selectedRequest ? <section className="card purchasing-new-request">
              <div className="purchasing-panel-heading"><div><span className="purchasing-kicker">Start a purchase</span><h2>New purchase request</h2></div></div>
              <div className="purchasing-form">
                <label className="field"><span>Budget *</span><select value={requestBudget} onChange={(event) => { const id = event.target.value; setRequestBudget(id); const budget = budgetMap.get(Number(id)); if (budget?.program_id) setRequestProgram(String(budget.program_id)) }}><option value="">Choose a budget…</option>{activeBudgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.name} • {money(summaryMap.get(budget.id)?.available_amount ?? budget.allocated_amount)} available</option>)}</select></label>
                <div className="purchasing-form-grid">
                  <label className="field"><span>Vendor / store</span><input value={requestVendor} onChange={(event) => setRequestVendor(event.target.value)} placeholder="Amazon, Staples, Target…" /></label>
                  <label className="field"><span>Program</span><select value={requestProgram} onChange={(event) => setRequestProgram(event.target.value)}><option value="">General center use</option>{programs.filter((program) => !['archived','completed'].includes(program.status)).map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
                </div>
                <label className="field"><span>Notes</span><textarea rows={4} value={requestNotes} onChange={(event) => setRequestNotes(event.target.value)} placeholder="What is this purchase for?" /></label>
                <button className="primary" disabled={saving || !requestBudget} onClick={() => void createRequest()}>{saving ? 'Creating…' : 'Create planned request'}</button>
              </div>
            </section> : <section className="card purchasing-request-detail">
              <div className="purchasing-request-header">
                <div><span className="purchasing-kicker">Purchase request #{selectedRequest.id}</span><h2>{selectedRequest.vendor || 'Vendor not set'}</h2><p>{budgetMap.get(selectedRequest.budget_id)?.name ?? 'Budget'}{selectedRequest.program_id ? ` • ${programMap.get(selectedRequest.program_id)?.name ?? 'Program'}` : ''}</p></div>
                <div><em className={`purchase-status ${selectedRequest.status}`}>{statusLabels[selectedRequest.status]}</em><strong>{money(selectedTotal?.current_total ?? 0)}</strong></div>
              </div>

              {!['received','canceled'].includes(selectedRequest.status) && <div className="purchasing-request-fields">
                <label className="field"><span>Vendor / store</span><input value={requestVendor} onChange={(event) => setRequestVendor(event.target.value)} /></label>
                <label className="field"><span>Program</span><select value={requestProgram} onChange={(event) => setRequestProgram(event.target.value)}><option value="">General center use</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
                <label className="field"><span>Order / confirmation #</span><input value={orderReference} onChange={(event) => setOrderReference(event.target.value)} /></label>
                <label className="field full"><span>Notes</span><textarea rows={2} value={requestNotes} onChange={(event) => setRequestNotes(event.target.value)} /></label>
                <button className="ghost" disabled={saving} onClick={() => void saveRequestDetails()}>Save details</button>
              </div>}

              <div className="purchasing-line-items">
                <div className="purchasing-panel-heading compact"><div><span className="purchasing-kicker">What is being purchased</span><h3>Line items</h3></div><strong>{money(selectedTotal?.estimated_total ?? 0)} estimated</strong></div>
                {selectedRequestItems.length === 0 && <div className="purchasing-empty small">No items added yet.</div>}
                {selectedRequestItems.map((item) => <article key={item.id}>
                  <div><strong>{item.description}</strong><span>{item.quantity} {item.unit} × {money(item.actual_unit_cost ?? item.estimated_unit_cost)}{item.actual_unit_cost != null ? ' actual' : ' estimated'}</span>{item.add_to_inventory && <small>📦 Receive to {inventoryItemMap.get(item.inventory_item_id ?? -1)?.name ?? 'Inventory'} • {item.inventory_location_id ? locationLabel(item.inventory_location_id) : ''}</small>}{item.notes && <small>{item.notes}</small>}</div>
                  <div><b>{money(item.quantity * (item.actual_unit_cost ?? item.estimated_unit_cost))}</b>{!['received','canceled'].includes(selectedRequest.status) && <span><button className="ghost" onClick={() => editLine(item)}>Edit</button><button className="ghost danger-button" onClick={() => void deleteLineItem(item.id)}>Remove</button></span>}</div>
                </article>)}
              </div>

              {!['received','canceled'].includes(selectedRequest.status) && <div className="purchasing-line-editor">
                <div className="purchasing-panel-heading compact"><div><span className="purchasing-kicker">{editingItemId ? 'Update item' : 'Add item'}</span><h3>{editingItemId ? 'Edit line item' : 'New line item'}</h3></div>{editingItemId && <button className="ghost" onClick={resetLineForm}>Cancel</button>}</div>
                <div className="purchasing-form-grid">
                  <label className="field full"><span>Description *</span><input value={lineDescription} onChange={(event) => setLineDescription(event.target.value)} placeholder="Construction paper, field trip tickets…" /></label>
                  <label className="field"><span>Quantity</span><input type="number" min="0.01" step="0.01" value={lineQuantity} onChange={(event) => setLineQuantity(event.target.value)} /></label>
                  <label className="field"><span>Unit</span><input value={lineUnit} onChange={(event) => setLineUnit(event.target.value)} /></label>
                  <label className="field"><span>Estimated unit cost</span><input type="number" min="0" step="0.01" value={lineEstimated} onChange={(event) => setLineEstimated(event.target.value)} /></label>
                  <label className="field"><span>Actual unit cost</span><input type="number" min="0" step="0.01" value={lineActual} onChange={(event) => setLineActual(event.target.value)} placeholder="Fill in when known" /></label>
                  <label className="field"><span>Inventory category</span><select value={lineCategory} onChange={(event) => setLineCategory(event.target.value)}><option value="">None</option>{inventoryCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                  <label className="field full purchasing-inventory-check"><input type="checkbox" checked={lineAddInventory} onChange={(event) => setLineAddInventory(event.target.checked)} /><span><strong>Add this quantity to Inventory when the order is received</strong><small>Link it to an existing Inventory item and storage location.</small></span></label>
                  {lineAddInventory && <><label className="field"><span>Inventory item</span><select value={lineInventoryItem} onChange={(event) => { setLineInventoryItem(event.target.value); const item = inventoryItemMap.get(Number(event.target.value)); if (item) setLineUnit(item.unit) }}><option value="">Choose item…</option>{inventoryItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>Destination location</span><select value={lineInventoryLocation} onChange={(event) => setLineInventoryLocation(event.target.value)}><option value="">Choose location…</option>{inventoryLocations.map((location) => <option key={location.id} value={location.id}>{locationLabel(location.id)}</option>)}</select></label></>}
                  <label className="field full"><span>Line notes</span><input value={lineNotes} onChange={(event) => setLineNotes(event.target.value)} /></label>
                </div>
                <button className="primary" disabled={saving || !lineDescription.trim()} onClick={() => void saveLineItem()}>{saving ? 'Saving…' : editingItemId ? 'Save line item' : 'Add line item'}</button>
              </div>}

              <div className="purchasing-lifecycle">
                <div className="purchasing-panel-heading compact"><div><span className="purchasing-kicker">Workflow</span><h3>Purchase status</h3></div></div>
                <div className="purchasing-timeline">
                  <span className="done"><b>Planned</b><small>{dateTimeLabel(selectedRequest.created_at)} • {staffMap.get(selectedRequest.requested_by) ?? 'Admin'}</small></span>
                  <span className={selectedRequest.submitted_at ? 'done' : ''}><b>Submitted</b><small>{dateTimeLabel(selectedRequest.submitted_at)}</small></span>
                  <span className={selectedRequest.approved_at ? 'done' : ''}><b>Approved</b><small>{dateTimeLabel(selectedRequest.approved_at)}{selectedRequest.approved_by ? ` • ${staffMap.get(selectedRequest.approved_by) ?? 'Admin'}` : ''}</small></span>
                  <span className={selectedRequest.ordered_at ? 'done' : ''}><b>Ordered</b><small>{dateTimeLabel(selectedRequest.ordered_at)}{selectedRequest.ordered_by ? ` • ${staffMap.get(selectedRequest.ordered_by) ?? 'Admin'}` : ''}</small></span>
                  <span className={selectedRequest.received_at ? 'done' : ''}><b>Received</b><small>{dateTimeLabel(selectedRequest.received_at)}{selectedRequest.received_by ? ` • ${staffMap.get(selectedRequest.received_by) ?? 'Admin'}` : ''}</small></span>
                </div>

                <div className="purchasing-status-actions">
                  {selectedRequest.status === 'planned' && <><button className="primary" disabled={saving || selectedRequestItems.length === 0} onClick={() => void changeStatus('awaiting_approval')}>Submit for approval</button><button className="ghost danger-button" disabled={saving} onClick={() => void changeStatus('canceled')}>Cancel request</button></>}
                  {selectedRequest.status === 'awaiting_approval' && <><button className="ghost" disabled={saving} onClick={() => void changeStatus('planned')}>Return to planned</button><button className="primary" disabled={saving} onClick={() => void changeStatus('approved')}>Approve request</button><button className="ghost danger-button" disabled={saving} onClick={() => void changeStatus('canceled')}>Decline / cancel</button></>}
                  {selectedRequest.status === 'approved' && <><button className="primary" disabled={saving} onClick={() => void changeStatus('ordered')}>Mark ordered</button><button className="ghost danger-button" disabled={saving} onClick={() => void changeStatus('canceled')}>Cancel request</button></>}
                  {selectedRequest.status === 'ordered' && <><button className="primary" disabled={saving} onClick={() => void changeStatus('received')}>Mark received</button><button className="ghost danger-button" disabled={saving} onClick={() => void changeStatus('canceled')}>Cancel order</button></>}
                  {selectedRequest.status === 'received' && <div className="purchasing-complete-note">✓ Purchase received and counted as spent.</div>}
                  {selectedRequest.status === 'canceled' && <div className="purchasing-canceled-note">Canceled requests do not count against the budget.</div>}
                </div>
              </div>

              {selectedRequestAudit.length > 0 && <details className="purchasing-audit"><summary>Status history</summary>{selectedRequestAudit.map((entry) => <p key={entry.id}><strong>{entry.new_status ? statusLabels[entry.new_status as PurchaseStatus] ?? entry.new_status : entry.action}</strong><span>{dateTimeLabel(entry.changed_at)} • {entry.changed_by ? staffMap.get(entry.changed_by) ?? 'Admin' : 'System'}</span></p>)}</details>}
            </section>}
          </div>
        </section>}
      </main>
    </div>
  )
}
