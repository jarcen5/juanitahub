'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type Budget = {
  id: number
  name: string
  period_label: string | null
  starts_on: string | null
  ends_on: string | null
  allocated_amount: number
  notes: string | null
  active: boolean
}
type BudgetSummary = {
  budget_id: number
  allocated_amount: number
  planned_amount: number
  spent_amount: number
  remaining_amount: number
}
type BudgetItem = {
  id: number
  budget_id: number
  purchase_item_id: number | null
  description: string
  category: string
  planned_amount: number
  counts_toward_plan: boolean
  notes: string | null
  active: boolean
}
type BudgetSpend = {
  id: number
  budget_id: number
  budget_item_id: number | null
  purchase_item_id: number | null
  description: string
  category: string
  amount: number
  spent_on: string | null
  notes: string | null
}
type PurchaseList = {
  id: number
  title: string
  wishlist_url: string | null
  budget_id: number | null
  vendor: string | null
  status: string
  notes: string | null
  requested_by: string
  created_at: string
  updated_at: string
}
type PurchaseItem = {
  id: number
  purchase_request_id: number
  description: string
  quantity: number
  unit: string
  estimated_unit_cost: number
  actual_unit_cost: number | null
  vendor: string | null
  product_url: string | null
  category_tag: string
  item_status: 'need' | 'purchased' | 'received'
  purchased_at: string | null
  received_at: string | null
  notes: string | null
}
type InventoryNeed = { item_id: number; requested_at: string }
type InventoryItem = { id: number; name: string; unit: string; category_id: number | null }
type InventoryCategory = { id: number; name: string }

const defaultCategories = [
  'Personnel',
  'Supplies',
  'Snacks & Food',
  'Field Trips',
  'Rewards',
  'Equipment',
  'Reimbursements',
  'Transportation & Supplies',
  'Other',
]

function money(value: number) {
  return Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function shortDate(value: string | null) {
  if (!value) return 'Date not recorded'
  const raw = value.slice(0, 10)
  const [year, month, day] = raw.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined
    return parsed.toString()
  } catch {
    return undefined
  }
}

export default function PurchasingPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tab, setTab] = useState<'purchases' | 'budgeting'>('purchases')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [budgetSummaries, setBudgetSummaries] = useState<BudgetSummary[]>([])
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([])
  const [budgetSpends, setBudgetSpends] = useState<BudgetSpend[]>([])
  const [purchaseLists, setPurchaseLists] = useState<PurchaseList[]>([])
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([])
  const [inventoryNeeds, setInventoryNeeds] = useState<InventoryNeed[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategory[]>([])

  const [selectedListId, setSelectedListId] = useState<number | null>(null)
  const [listTitle, setListTitle] = useState('')
  const [listWishlist, setListWishlist] = useState('')
  const [listBudget, setListBudget] = useState('')
  const [listNotes, setListNotes] = useState('')
  const [creatingList, setCreatingList] = useState(false)

  const [editingPurchaseItemId, setEditingPurchaseItemId] = useState<number | null>(null)
  const [itemDescription, setItemDescription] = useState('')
  const [itemQuantity, setItemQuantity] = useState('1')
  const [itemEstimated, setItemEstimated] = useState('')
  const [itemActual, setItemActual] = useState('')
  const [itemVendor, setItemVendor] = useState('')
  const [itemUrl, setItemUrl] = useState('')
  const [itemCategory, setItemCategory] = useState('Supplies')
  const [itemNotes, setItemNotes] = useState('')

  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [budgetItemView, setBudgetItemView] = useState<'current' | 'hidden'>('current')
  const [budgetItemDescription, setBudgetItemDescription] = useState('')
  const [budgetItemCategory, setBudgetItemCategory] = useState('Supplies')
  const [budgetItemPlanned, setBudgetItemPlanned] = useState('')
  const [budgetItemNotes, setBudgetItemNotes] = useState('')
  const [budgetItemCounts, setBudgetItemCounts] = useState(true)

  const [spendItemId, setSpendItemId] = useState('')
  const [spendDescription, setSpendDescription] = useState('')
  const [spendCategory, setSpendCategory] = useState('Supplies')
  const [spendAmount, setSpendAmount] = useState('')
  const [spendDate, setSpendDate] = useState('')
  const [spendNotes, setSpendNotes] = useState('')
  const [spendOpen, setSpendOpen] = useState(false)

  const [budgetEditorOpen, setBudgetEditorOpen] = useState(false)
  const [editingBudgetId, setEditingBudgetId] = useState<number | null>(null)
  const [budgetName, setBudgetName] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [budgetPeriod, setBudgetPeriod] = useState('')
  const [budgetStart, setBudgetStart] = useState('')
  const [budgetEnd, setBudgetEnd] = useState('')
  const [budgetNotes, setBudgetNotes] = useState('')

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
    setMessage('')

    const profileResult = await supabase
      .from('staff_profiles')
      .select('display_name,role,active')
      .eq('user_id', session.user.id)
      .maybeSingle()

    const nextProfile = profileResult.data as Profile | null
    setProfile(nextProfile)
    if (!nextProfile?.active) {
      setLoading(false)
      return
    }

    const [
      budgetResult,
      summaryResult,
      budgetItemResult,
      spendResult,
      listResult,
      purchaseItemResult,
      restockResult,
      inventoryItemResult,
      inventoryCategoryResult,
    ] = await Promise.all([
      supabase.from('budget_accounts').select('id,name,period_label,starts_on,ends_on,allocated_amount,notes,active').order('active', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('budget_simple_summary').select('budget_id,allocated_amount,planned_amount,spent_amount,remaining_amount'),
      supabase.from('budget_items').select('id,budget_id,purchase_item_id,description,category,planned_amount,counts_toward_plan,notes,active').order('category').order('description'),
      supabase.from('budget_spend_entries').select('id,budget_id,budget_item_id,purchase_item_id,description,category,amount,spent_on,notes').order('created_at', { ascending: false }),
      supabase.from('purchase_requests').select('id,title,wishlist_url,budget_id,vendor,status,notes,requested_by,created_at,updated_at').neq('status', 'canceled').order('updated_at', { ascending: false }),
      supabase.from('purchase_request_items').select('id,purchase_request_id,description,quantity,unit,estimated_unit_cost,actual_unit_cost,vendor,product_url,category_tag,item_status,purchased_at,received_at,notes').order('id'),
      supabase.from('inventory_restock_requests').select('item_id,requested_at').order('requested_at', { ascending: false }),
      supabase.from('inventory_items').select('id,name,unit,category_id').eq('active', true).order('name'),
      supabase.from('inventory_categories').select('id,name').eq('active', true).order('name'),
    ])

    setBudgets(((budgetResult.data ?? []) as any[]).map((row) => ({ ...row, allocated_amount: Number(row.allocated_amount) })) as Budget[])
    setBudgetSummaries(((summaryResult.data ?? []) as any[]).map((row) => ({
      ...row,
      allocated_amount: Number(row.allocated_amount),
      planned_amount: Number(row.planned_amount),
      spent_amount: Number(row.spent_amount),
      remaining_amount: Number(row.remaining_amount),
    })) as BudgetSummary[])
    setBudgetItems(((budgetItemResult.data ?? []) as any[]).map((row) => ({ ...row, planned_amount: Number(row.planned_amount) })) as BudgetItem[])
    setBudgetSpends(((spendResult.data ?? []) as any[]).map((row) => ({ ...row, amount: Number(row.amount) })) as BudgetSpend[])
    setPurchaseLists((listResult.data ?? []) as PurchaseList[])
    setPurchaseItems(((purchaseItemResult.data ?? []) as any[]).map((row) => ({
      ...row,
      quantity: Number(row.quantity),
      estimated_unit_cost: Number(row.estimated_unit_cost),
      actual_unit_cost: row.actual_unit_cost == null ? null : Number(row.actual_unit_cost),
    })) as PurchaseItem[])
    setInventoryNeeds((restockResult.data ?? []) as InventoryNeed[])
    setInventoryItems((inventoryItemResult.data ?? []) as InventoryItem[])
    setInventoryCategories((inventoryCategoryResult.data ?? []) as InventoryCategory[])

    const error =
      profileResult.error?.message ??
      budgetResult.error?.message ??
      summaryResult.error?.message ??
      budgetItemResult.error?.message ??
      spendResult.error?.message ??
      listResult.error?.message ??
      purchaseItemResult.error?.message ??
      restockResult.error?.message ??
      inventoryItemResult.error?.message ??
      inventoryCategoryResult.error?.message ??
      ''

    if (error) setMessage(error)

    const nextLists = (listResult.data ?? []) as PurchaseList[]
    const nextBudgets = ((budgetResult.data ?? []) as any[]).map((row) => ({ ...row, allocated_amount: Number(row.allocated_amount) })) as Budget[]
    setSelectedListId((current) => current && nextLists.some((list) => list.id === current) ? current : nextLists[0]?.id ?? null)
    setSelectedBudgetId((current) => current && nextBudgets.some((budget) => budget.id === current) ? current : nextBudgets.find((budget) => budget.name === 'Summer 2026')?.id ?? nextBudgets[0]?.id ?? null)
    setLoading(false)
  }

  const budgetMap = useMemo(() => new Map(budgets.map((budget) => [budget.id, budget])), [budgets])
  const summaryMap = useMemo(() => new Map(budgetSummaries.map((summary) => [summary.budget_id, summary])), [budgetSummaries])
  const inventoryMap = useMemo(() => new Map(inventoryItems.map((item) => [item.id, item])), [inventoryItems])
  const inventoryCategoryMap = useMemo(() => new Map(inventoryCategories.map((category) => [category.id, category.name])), [inventoryCategories])

  const categoryOptions = useMemo(() => {
    const values = new Set(defaultCategories)
    budgetItems.forEach((item) => values.add(item.category))
    budgetSpends.forEach((entry) => values.add(entry.category))
    purchaseItems.forEach((item) => values.add(item.category_tag))
    return Array.from(values).filter(Boolean).sort((a, b) => a.localeCompare(b))
  }, [budgetItems, budgetSpends, purchaseItems])

  const selectedList = purchaseLists.find((list) => list.id === selectedListId) ?? null

  useEffect(() => {
    if (!selectedList || creatingList) return
    setListTitle(selectedList.title)
    setListWishlist(selectedList.wishlist_url ?? '')
    setListBudget(selectedList.budget_id ? String(selectedList.budget_id) : '')
    setListNotes(selectedList.notes ?? '')
  }, [selectedListId, purchaseLists, creatingList])

  const selectedListItems = purchaseItems.filter((item) => item.purchase_request_id === selectedListId)
  const selectedListEstimated = selectedListItems.reduce((sum, item) => sum + item.quantity * item.estimated_unit_cost, 0)
  const selectedListSpent = selectedListItems
    .filter((item) => item.item_status !== 'need')
    .reduce((sum, item) => sum + item.quantity * (item.actual_unit_cost ?? item.estimated_unit_cost), 0)

  const activeBudgets = budgets.filter((budget) => budget.active)
  const selectedBudget = budgets.find((budget) => budget.id === selectedBudgetId) ?? null
  const selectedBudgetSummary = selectedBudget ? summaryMap.get(selectedBudget.id) ?? null : null
  const selectedBudgetAllItems = budgetItems.filter((item) => item.budget_id === selectedBudgetId)
  const selectedBudgetItems = selectedBudgetAllItems.filter((item) => item.active)
  const hiddenBudgetItems = selectedBudgetAllItems.filter((item) => !item.active)
  const selectedBudgetSpends = budgetSpends.filter((entry) => entry.budget_id === selectedBudgetId)

  const categoryRows = useMemo(() => {
    const names = new Set<string>()
    selectedBudgetItems.forEach((item) => names.add(item.category))
    selectedBudgetSpends.forEach((entry) => names.add(entry.category))
    return Array.from(names).sort((a, b) => a.localeCompare(b)).map((category) => ({
      category,
      planned: selectedBudgetItems.filter((item) => item.category === category && item.counts_toward_plan).reduce((sum, item) => sum + item.planned_amount, 0),
      spent: selectedBudgetSpends.filter((entry) => entry.category === category).reduce((sum, entry) => sum + entry.amount, 0),
    }))
  }, [selectedBudgetItems, selectedBudgetSpends])

  const maxCategorySpend = Math.max(1, ...categoryRows.map((row) => row.spent))
  const budgetItemsForView = budgetItemView === 'current' ? selectedBudgetItems : hiddenBudgetItems
  const visibleBudgetItems = budgetItemsForView.filter((item) => categoryFilter === 'all' || item.category === categoryFilter)
  const unplannedSpends = selectedBudgetSpends.filter((entry) => !entry.budget_item_id && (categoryFilter === 'all' || entry.category === categoryFilter))

  const itemSpendMap = useMemo(() => {
    const map = new Map<number, number>()
    for (const entry of selectedBudgetSpends) {
      if (!entry.budget_item_id) continue
      map.set(entry.budget_item_id, (map.get(entry.budget_item_id) ?? 0) + entry.amount)
    }
    return map
  }, [selectedBudgetSpends])

  const allPurchaseItems = purchaseItems.filter((item) => purchaseLists.some((list) => list.id === item.purchase_request_id))
  const neededCount = allPurchaseItems.filter((item) => item.item_status === 'need').length
  const purchaseEstimate = allPurchaseItems.reduce((sum, item) => sum + item.quantity * item.estimated_unit_cost, 0)
  const purchaseSpent = allPurchaseItems
    .filter((item) => item.item_status !== 'need')
    .reduce((sum, item) => sum + item.quantity * (item.actual_unit_cost ?? item.estimated_unit_cost), 0)

  function resetListForm() {
    setCreatingList(false)
    setListTitle('')
    setListWishlist('')
    setListBudget('')
    setListNotes('')
  }

  function startNewList() {
    setCreatingList(true)
    setListTitle('')
    setListWishlist('')
    setListBudget('')
    setListNotes('')
  }

  async function createList() {
    if (!session || saving || !listTitle.trim()) return
    const wishlist = normalizeUrl(listWishlist)
    if (wishlist === undefined) {
      setMessage('Wishlist links must start with http:// or https://.')
      return
    }
    setSaving(true)
    setMessage('')
    const { data, error } = await supabase.from('purchase_requests').insert({
      title: listTitle.trim(),
      wishlist_url: wishlist,
      budget_id: listBudget ? Number(listBudget) : null,
      status: 'planned',
      notes: listNotes.trim() || null,
      requested_by: session.user.id,
      updated_by: session.user.id,
    }).select('id').single()
    setSaving(false)
    if (error || !data) {
      setMessage(error?.message ?? 'Could not create the purchase list.')
      return
    }
    setMessage('Purchase list created.')
    resetListForm()
    await loadData()
    setSelectedListId(data.id)
  }

  async function saveListDetails() {
    if (!selectedList || saving) return
    const wishlist = normalizeUrl(listWishlist)
    if (wishlist === undefined) {
      setMessage('Wishlist links must start with http:// or https://.')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('purchase_requests').update({
      title: listTitle.trim() || selectedList.title,
      wishlist_url: wishlist,
      budget_id: listBudget ? Number(listBudget) : null,
      notes: listNotes.trim() || null,
    }).eq('id', selectedList.id)
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Purchase list updated.')
    await loadData()
  }

  function loadSelectedListEditor(list: PurchaseList) {
    setSelectedListId(list.id)
    setCreatingList(false)
    setListTitle(list.title)
    setListWishlist(list.wishlist_url ?? '')
    setListBudget(list.budget_id ? String(list.budget_id) : '')
    setListNotes(list.notes ?? '')
    resetPurchaseItemForm()
  }

  async function archiveList() {
    if (!selectedList || saving) return
    if (!window.confirm('Archive this purchase list? Its items and any budget history will be preserved.')) return
    setSaving(true)
    const { error } = await supabase.from('purchase_requests').update({ status: 'canceled' }).eq('id', selectedList.id)
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Purchase list archived.')
    setSelectedListId(null)
    await loadData()
  }

  function resetPurchaseItemForm() {
    setEditingPurchaseItemId(null)
    setItemDescription('')
    setItemQuantity('1')
    setItemEstimated('')
    setItemActual('')
    setItemVendor('')
    setItemUrl('')
    setItemCategory('Supplies')
    setItemNotes('')
  }

  function editPurchaseItem(item: PurchaseItem) {
    setEditingPurchaseItemId(item.id)
    setItemDescription(item.description)
    setItemQuantity(String(item.quantity))
    setItemEstimated(String(item.estimated_unit_cost))
    setItemActual(item.actual_unit_cost == null ? '' : String(item.actual_unit_cost))
    setItemVendor(item.vendor ?? '')
    setItemUrl(item.product_url ?? '')
    setItemCategory(item.category_tag || 'Other')
    setItemNotes(item.notes ?? '')
  }

  async function savePurchaseItem() {
    if (!selectedList || saving || !itemDescription.trim()) return
    const quantity = Number(itemQuantity)
    const estimated = Number(itemEstimated || 0)
    const actual = itemActual.trim() === '' ? null : Number(itemActual)
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(estimated) || estimated < 0 || (actual != null && (!Number.isFinite(actual) || actual < 0))) {
      setMessage('Enter valid non-negative prices and a quantity greater than zero.')
      return
    }
    const productUrl = normalizeUrl(itemUrl)
    if (productUrl === undefined) {
      setMessage('Item links must start with http:// or https://.')
      return
    }
    setSaving(true)
    setMessage('')
    const payload = {
      description: itemDescription.trim(),
      quantity,
      unit: 'each',
      estimated_unit_cost: estimated,
      actual_unit_cost: actual,
      vendor: itemVendor.trim() || null,
      product_url: productUrl,
      category_tag: itemCategory.trim() || 'Other',
      notes: itemNotes.trim() || null,
    }
    const result = editingPurchaseItemId
      ? await supabase.from('purchase_request_items').update(payload).eq('id', editingPurchaseItemId)
      : await supabase.from('purchase_request_items').insert({ ...payload, purchase_request_id: selectedList.id, item_status: 'need' })
    setSaving(false)
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    setMessage(editingPurchaseItemId ? 'Purchase item updated.' : 'Item added to the purchase list.')
    resetPurchaseItemForm()
    await loadData()
  }

  async function markPurchaseItem(item: PurchaseItem, nextStatus: 'purchased' | 'received') {
    if (saving) return
    setSaving(true)
    setMessage('')
    const payload: Record<string, unknown> = { item_status: nextStatus }
    if (nextStatus === 'purchased' && item.actual_unit_cost == null) payload.actual_unit_cost = item.estimated_unit_cost
    const { error } = await supabase.from('purchase_request_items').update(payload).eq('id', item.id)
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage(nextStatus === 'purchased'
      ? 'Marked purchased. If this list has a budget, the spend was recorded automatically.'
      : 'Marked received.')
    await loadData()
  }

  async function deletePurchaseItem(item: PurchaseItem) {
    if (saving || !window.confirm('Remove "' + item.description + '" from this purchase list?')) return
    setSaving(true)
    const { error } = await supabase.from('purchase_request_items').delete().eq('id', item.id)
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Item removed.')
    if (editingPurchaseItemId === item.id) resetPurchaseItemForm()
    await loadData()
  }

  async function addInventoryNeed(need: InventoryNeed) {
    if (!selectedList || saving) {
      setMessage('Choose or create a purchase list first.')
      return
    }
    const inventory = inventoryMap.get(need.item_id)
    if (!inventory) return
    setSaving(true)
    const category = inventory.category_id ? inventoryCategoryMap.get(inventory.category_id) ?? 'Supplies' : 'Supplies'
    const { error } = await supabase.from('purchase_request_items').insert({
      purchase_request_id: selectedList.id,
      description: inventory.name,
      quantity: 1,
      unit: inventory.unit || 'each',
      estimated_unit_cost: 0,
      category_tag: category,
      item_status: 'need',
      notes: 'Added from Inventory Needs purchase.',
    })
    if (!error) await supabase.from('inventory_restock_requests').delete().eq('item_id', need.item_id)
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage(inventory.name + ' was added to ' + selectedList.title + '.')
    await loadData()
  }

  async function addBudgetItem() {
    if (!session || !selectedBudget || saving || !budgetItemDescription.trim()) return
    const planned = Number(budgetItemPlanned || 0)
    if (!Number.isFinite(planned) || planned < 0) {
      setMessage('Planned amount must be zero or greater.')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('budget_items').insert({
      budget_id: selectedBudget.id,
      description: budgetItemDescription.trim(),
      category: budgetItemCategory.trim() || 'Other',
      planned_amount: planned,
      counts_toward_plan: budgetItemCounts,
      notes: budgetItemNotes.trim() || null,
      created_by: session.user.id,
      updated_by: session.user.id,
    })
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setBudgetItemDescription('')
    setBudgetItemPlanned('')
    setBudgetItemNotes('')
    setBudgetItemCounts(true)
    setMessage('Budget item added.')
    await loadData()
  }

  function openSpendForItem(item: BudgetItem) {
    setSpendItemId(String(item.id))
    setSpendDescription(item.description)
    setSpendCategory(item.category)
    setSpendAmount('')
    setSpendDate('')
    setSpendNotes('')
    setSpendOpen(true)
  }

  function openGeneralSpend() {
    setSpendItemId('')
    setSpendDescription('')
    setSpendCategory(categoryFilter !== 'all' ? categoryFilter : 'Supplies')
    setSpendAmount('')
    setSpendDate('')
    setSpendNotes('')
    setSpendOpen(true)
  }

  async function recordSpend() {
    if (!session || !selectedBudget || saving || !spendDescription.trim()) return
    const amount = Number(spendAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage('Spent amount must be zero or greater.')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('budget_spend_entries').insert({
      budget_id: selectedBudget.id,
      budget_item_id: spendItemId ? Number(spendItemId) : null,
      description: spendDescription.trim(),
      category: spendCategory.trim() || 'Other',
      amount,
      spent_on: spendDate || null,
      notes: spendNotes.trim() || null,
      created_by: session.user.id,
      updated_by: session.user.id,
    })
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setSpendOpen(false)
    setMessage('Spending recorded.')
    await loadData()
  }

  async function archiveBudgetItem(item: BudgetItem) {
    if (saving || item.purchase_item_id) return
    setSaving(true)
    const { error } = await supabase.from('budget_items').update({ active: false }).eq('id', item.id)
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Budget item hidden. You can restore it from Hidden items.')
    await loadData()
  }

  async function restoreBudgetItem(item: BudgetItem) {
    if (saving || item.purchase_item_id) return
    setSaving(true)
    const { error } = await supabase.from('budget_items').update({ active: true }).eq('id', item.id)
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage(item.description + ' was restored to the budget.')
    await loadData()
  }

  async function removeBudgetItem(item: BudgetItem) {
    if (saving || profile?.role !== 'admin' || item.purchase_item_id) return
    const spendCount = selectedBudgetSpends.filter((entry) => entry.budget_item_id === item.id).length
    if (spendCount > 0) {
      setMessage('This item has spending history, so it can be hidden but not permanently removed.')
      return
    }
    if (!window.confirm('Permanently remove "' + item.description + '" from this budget?')) return
    setSaving(true)
    const { error } = await supabase.from('budget_items').delete().eq('id', item.id)
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage(item.description + ' was removed from the budget.')
    await loadData()
  }

  function startNewBudget() {
    if (profile?.role !== 'admin') return
    setEditingBudgetId(null)
    setBudgetName('')
    setBudgetAmount('')
    setBudgetPeriod('')
    setBudgetStart('')
    setBudgetEnd('')
    setBudgetNotes('')
    setBudgetEditorOpen(true)
  }

  function editBudget(budget: Budget) {
    if (profile?.role !== 'admin') return
    setEditingBudgetId(budget.id)
    setBudgetName(budget.name)
    setBudgetAmount(String(budget.allocated_amount))
    setBudgetPeriod(budget.period_label ?? '')
    setBudgetStart(budget.starts_on ?? '')
    setBudgetEnd(budget.ends_on ?? '')
    setBudgetNotes(budget.notes ?? '')
    setBudgetEditorOpen(true)
  }

  async function saveBudget() {
    if (!session || profile?.role !== 'admin' || saving || !budgetName.trim()) return
    const amount = Number(budgetAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage('Budget amount must be zero or greater.')
      return
    }
    if (budgetStart && budgetEnd && budgetEnd < budgetStart) {
      setMessage('Budget end date cannot be before its start date.')
      return
    }
    setSaving(true)
    const payload = {
      name: budgetName.trim(),
      allocated_amount: amount,
      period_label: budgetPeriod.trim() || null,
      starts_on: budgetStart || null,
      ends_on: budgetEnd || null,
      notes: budgetNotes.trim() || null,
      updated_by: session.user.id,
    }
    const result = editingBudgetId
      ? await supabase.from('budget_accounts').update(payload).eq('id', editingBudgetId)
      : await supabase.from('budget_accounts').insert({ ...payload, active: true, created_by: session.user.id })
    setSaving(false)
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    setBudgetEditorOpen(false)
    setMessage(editingBudgetId ? 'Budget updated.' : 'Budget created.')
    await loadData()
  }

  if (loading) return <main className="login-wrap"><div className="card login-card">Loading Purchasing…</div></main>
  if (!session) return <main className="login-wrap"><section className="card login-card"><h1>Purchasing</h1><p className="subtle">Sign in through Juanita Hub first.</p></section></main>
  if (!profile?.active) return <main className="login-wrap"><section className="card login-card"><h1>Purchasing</h1><div className="notice">Your staff account must be active.</div></section></main>

  const spentPercent = selectedBudgetSummary && selectedBudgetSummary.allocated_amount > 0
    ? Math.min(100, Math.max(0, selectedBudgetSummary.spent_amount / selectedBudgetSummary.allocated_amount * 100))
    : 0

  return <div className="shell">
    <header className="topbar">
      <div className="brand">Juanita Hub<small>Purchases & budgeting</small></div>
      <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div>
    </header>

    <main className="main purchasing-page">
      <section className="hero purchasing-hero">
        <div><span className="purchasing-kicker">Operations</span><h1>Purchases & Budgeting</h1><p className="subtle">Keep everyday purchase lists simple, and track program budgets only when you actually have one.</p></div>
        {tab === 'purchases'
          ? <button className="primary" onClick={startNewList}>+ New purchase list</button>
          : profile.role === 'admin' ? <button className="primary" onClick={startNewBudget}>+ New budget</button> : null}
      </section>

      {message && <div className="notice">{message}</div>}

      <nav className="purchasing-tabs" aria-label="Purchasing sections">
        <button className={tab === 'purchases' ? 'active' : ''} onClick={() => setTab('purchases')}>Purchases</button>
        <button className={tab === 'budgeting' ? 'active' : ''} onClick={() => setTab('budgeting')}>Budgeting</button>
      </nav>

      {tab === 'purchases' && <>
        <section className="grid stats purchasing-stats">
          <div className="card stat"><span className="subtle">Purchase lists</span><strong>{purchaseLists.length}</strong></div>
          <div className="card stat"><span className="subtle">Items still needed</span><strong>{neededCount}</strong></div>
          <div className="card stat"><span className="subtle">Estimated total</span><strong>{money(purchaseEstimate)}</strong></div>
          <div className="card stat"><span className="subtle">Purchased so far</span><strong>{money(purchaseSpent)}</strong></div>
        </section>

        {inventoryNeeds.length > 0 && <section className="card purchasing-inventory-needs">
          <div className="purchasing-section-heading">
            <div><span className="purchasing-kicker">From Inventory</span><h2>Needs purchase</h2><p>These items were checked in Inventory. Add them to the selected purchase list when you are ready.</p></div>
            <span className="purchasing-count-pill">{inventoryNeeds.length}</span>
          </div>
          <div className="purchasing-need-chips">
            {inventoryNeeds.map((need) => {
              const item = inventoryMap.get(need.item_id)
              if (!item) return null
              return <button className="purchasing-need-chip" key={need.item_id} disabled={saving || !selectedList} onClick={() => void addInventoryNeed(need)}>
                <span>＋</span><strong>{item.name}</strong><small>{selectedList ? 'Add to ' + selectedList.title : 'Choose a list first'}</small>
              </button>
            })}
          </div>
        </section>}

        <section className="purchasing-lists-layout">
          <aside className="card purchasing-lists">
            <div className="purchasing-section-heading compact"><div><span className="purchasing-kicker">Lists</span><h2>Purchase lists</h2></div><button className="ghost compact-button" onClick={startNewList}>New</button></div>
            <div className="purchasing-list-stack">
              {purchaseLists.map((list) => {
                const items = purchaseItems.filter((item) => item.purchase_request_id === list.id)
                const estimate = items.reduce((sum, item) => sum + item.quantity * item.estimated_unit_cost, 0)
                const needed = items.filter((item) => item.item_status === 'need').length
                return <button className={selectedListId === list.id && !creatingList ? 'active' : ''} key={list.id} onClick={() => loadSelectedListEditor(list)}>
                  <span><strong>{list.title}</strong><small>{list.budget_id ? budgetMap.get(list.budget_id)?.name ?? 'Budget' : 'No budget'} • {items.length} items</small></span>
                  <span><b>{money(estimate)}</b><small>{needed} needed</small></span>
                </button>
              })}
              {purchaseLists.length === 0 && <div className="purchasing-empty small">No purchase lists yet.</div>}
            </div>
          </aside>

          <section className="purchasing-list-workspace">
            {creatingList || !selectedList ? <div className="card purchasing-simple-editor">
              <div className="purchasing-section-heading"><div><span className="purchasing-kicker">New list</span><h2>Create a purchase list</h2><p>For afterschool, leave Budget set to No budget.</p></div></div>
              <div className="purchasing-form-grid">
                <label className="field full"><span>List name *</span><input value={listTitle} onChange={(event) => setListTitle(event.target.value)} placeholder="Afterschool Needs, Summer Supplies…" /></label>
                <label className="field"><span>Budget (optional)</span><select value={listBudget} onChange={(event) => setListBudget(event.target.value)}><option value="">No budget</option>{activeBudgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.name}</option>)}</select></label>
                <label className="field"><span>Wishlist link (optional)</span><input type="url" value={listWishlist} onChange={(event) => setListWishlist(event.target.value)} placeholder="https://www.amazon.com/…" /></label>
                <label className="field full"><span>Notes</span><textarea rows={3} value={listNotes} onChange={(event) => setListNotes(event.target.value)} placeholder="What is this list for?" /></label>
              </div>
              <div className="purchasing-editor-actions"><button className="primary" disabled={saving || !listTitle.trim()} onClick={() => void createList()}>{saving ? 'Creating…' : 'Create list'}</button>{creatingList && <button className="ghost" onClick={resetListForm}>Cancel</button>}</div>
            </div> : <div className="card purchasing-list-detail">
              <div className="purchasing-list-header">
                <div><span className="purchasing-kicker">{selectedList.budget_id ? 'Budget-linked list' : 'Everyday purchase list'}</span><h2>{selectedList.title}</h2><p>{selectedList.budget_id ? (budgetMap.get(selectedList.budget_id)?.name ?? 'Budget') : 'No budget required'}</p></div>
                <div className="purchasing-list-total"><strong>{money(selectedListEstimated)}</strong><small>estimated</small><span>{money(selectedListSpent)} purchased</span></div>
              </div>

              <div className="purchasing-list-settings">
                <label className="field"><span>List name</span><input value={listTitle} onChange={(event) => setListTitle(event.target.value)} /></label>
                <label className="field"><span>Budget</span><select value={listBudget} onChange={(event) => setListBudget(event.target.value)}><option value="">No budget</option>{activeBudgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.name}</option>)}</select></label>
                <label className="field"><span>Wishlist link</span><input type="url" value={listWishlist} onChange={(event) => setListWishlist(event.target.value)} placeholder="Paste Amazon or another wishlist link" /></label>
                <label className="field full"><span>Notes</span><input value={listNotes} onChange={(event) => setListNotes(event.target.value)} /></label>
                <div className="purchasing-list-settings-actions"><button className="ghost compact-button" disabled={saving} onClick={() => void saveListDetails()}>Save list details</button>{selectedList.wishlist_url && <a className="ghost compact-button" href={selectedList.wishlist_url} target="_blank" rel="noopener noreferrer">Open wishlist ↗</a>}<button className="ghost compact-button danger-button" disabled={saving} onClick={() => void archiveList()}>Archive list</button></div>
              </div>

              <div className="purchasing-item-list">
                <div className="purchasing-section-heading compact"><div><span className="purchasing-kicker">Items</span><h3>{selectedListItems.length} item{selectedListItems.length === 1 ? '' : 's'}</h3></div></div>
                {selectedListItems.map((item) => <article className={'purchasing-item ' + item.item_status} key={item.id}>
                  <div className="purchasing-item-main">
                    <div className="purchasing-item-title"><strong>{item.description}</strong><span className={'purchasing-item-status ' + item.item_status}>{item.item_status === 'need' ? 'Need' : item.item_status === 'purchased' ? 'Purchased' : 'Received'}</span></div>
                    <div className="purchasing-item-meta">
                      <span>{item.quantity} × {money(item.actual_unit_cost ?? item.estimated_unit_cost)}</span>
                      {item.vendor && <span>{item.vendor}</span>}
                      <span>{item.category_tag}</span>
                      {item.product_url && <a href={item.product_url} target="_blank" rel="noopener noreferrer">Item link ↗</a>}
                    </div>
                    {item.notes && <p>{item.notes}</p>}
                  </div>
                  <div className="purchasing-item-price"><strong>{money(item.quantity * (item.actual_unit_cost ?? item.estimated_unit_cost))}</strong><small>{item.actual_unit_cost != null ? 'actual' : 'estimated'}</small></div>
                  <div className="purchasing-item-actions">
                    {item.item_status === 'need' && <button className="primary compact-button" disabled={saving} onClick={() => void markPurchaseItem(item, 'purchased')}>Mark purchased</button>}
                    {item.item_status === 'purchased' && <button className="primary compact-button" disabled={saving} onClick={() => void markPurchaseItem(item, 'received')}>Mark received</button>}
                    <button className="ghost compact-button" onClick={() => editPurchaseItem(item)}>Edit</button>
                    <button className="ghost compact-button danger-button" disabled={saving} onClick={() => void deletePurchaseItem(item)}>Remove</button>
                  </div>
                </article>)}
                {selectedListItems.length === 0 && <div className="purchasing-empty">Add the first item below, or bring an item over from Inventory.</div>}
              </div>

              <div className="purchasing-item-editor">
                <div className="purchasing-section-heading compact"><div><span className="purchasing-kicker">{editingPurchaseItemId ? 'Edit item' : 'Add item'}</span><h3>{editingPurchaseItemId ? itemDescription || 'Purchase item' : 'New purchase item'}</h3></div>{editingPurchaseItemId && <button className="ghost compact-button" onClick={resetPurchaseItemForm}>Cancel edit</button>}</div>
                <div className="purchasing-form-grid">
                  <label className="field full"><span>Item *</span><input value={itemDescription} onChange={(event) => setItemDescription(event.target.value)} placeholder="Construction paper, printer ink, field trip tickets…" /></label>
                  <label className="field"><span>Quantity</span><input type="number" min="0.01" step="0.01" value={itemQuantity} onChange={(event) => setItemQuantity(event.target.value)} /></label>
                  <label className="field"><span>Estimated price each</span><input type="number" min="0" step="0.01" value={itemEstimated} onChange={(event) => setItemEstimated(event.target.value)} /></label>
                  <label className="field"><span>Actual price each (optional)</span><input type="number" min="0" step="0.01" value={itemActual} onChange={(event) => setItemActual(event.target.value)} placeholder="Fill in when known" /></label>
                  <label className="field"><span>Store / site</span><input value={itemVendor} onChange={(event) => setItemVendor(event.target.value)} placeholder="Amazon, Target, Staples…" /></label>
                  <label className="field"><span>Category tag</span><input list="purchasing-categories" value={itemCategory} onChange={(event) => setItemCategory(event.target.value)} /></label>
                  <label className="field"><span>Item link</span><input type="url" value={itemUrl} onChange={(event) => setItemUrl(event.target.value)} placeholder="https://…" /></label>
                  <label className="field full"><span>Notes</span><input value={itemNotes} onChange={(event) => setItemNotes(event.target.value)} /></label>
                </div>
                <button className="primary" disabled={saving || !itemDescription.trim()} onClick={() => void savePurchaseItem()}>{saving ? 'Saving…' : editingPurchaseItemId ? 'Save item' : 'Add item'}</button>
              </div>
            </div>}
          </section>
        </section>
      </>}

      {tab === 'budgeting' && <>
        <section className="purchasing-budget-picker card">
          <div><span className="purchasing-kicker">Program budgets</span><h2>{selectedBudget?.name ?? 'Choose a budget'}</h2><p>{selectedBudget?.period_label ?? 'Budgets are optional and are mainly useful for programs like summer.'}</p></div>
          <div className="purchasing-budget-picker-actions">
            <select value={selectedBudgetId ?? ''} onChange={(event) => { setSelectedBudgetId(Number(event.target.value)); setCategoryFilter('all'); setBudgetItemView('current') }}>{activeBudgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.name}</option>)}</select>
            {profile.role === 'admin' && selectedBudget && <button className="ghost" onClick={() => editBudget(selectedBudget)}>Budget settings</button>}
          </div>
        </section>

        {selectedBudget && selectedBudgetSummary ? <>
          <section className="grid stats purchasing-budget-stats">
            <div className="card stat"><span className="subtle">Total budget</span><strong>{money(selectedBudgetSummary.allocated_amount)}</strong></div>
            <div className="card stat"><span className="subtle">Planned</span><strong>{money(selectedBudgetSummary.planned_amount)}</strong></div>
            <div className="card stat"><span className="subtle">Spent so far</span><strong>{money(selectedBudgetSummary.spent_amount)}</strong></div>
            <div className={'card stat ' + (selectedBudgetSummary.remaining_amount < 0 ? 'purchasing-negative' : '')}><span className="subtle">Budget remaining</span><strong>{money(selectedBudgetSummary.remaining_amount)}</strong></div>
          </section>

          <section className="purchasing-budget-visuals">
            <article className="card purchasing-donut-card">
              <div className="purchasing-section-heading compact"><div><span className="purchasing-kicker">Budget use</span><h2>Spent vs. remaining</h2></div></div>
              <div className="purchasing-donut-wrap">
                <div className="purchasing-donut" style={{ background: 'conic-gradient(#2376c9 ' + spentPercent + '%, #e8eff4 ' + spentPercent + '%)' }}><div><strong>{Math.round(spentPercent)}%</strong><span>spent</span></div></div>
                <div className="purchasing-donut-legend"><span><i className="spent" />Spent <strong>{money(selectedBudgetSummary.spent_amount)}</strong></span><span><i className="remaining" />Remaining <strong>{money(selectedBudgetSummary.remaining_amount)}</strong></span></div>
              </div>
            </article>

            <article className="card purchasing-category-chart">
              <div className="purchasing-section-heading compact"><div><span className="purchasing-kicker">Where it went</span><h2>Spending by category</h2></div></div>
              <div className="purchasing-category-bars">
                {categoryRows.map((row) => <div key={row.category}>
                  <div><span>{row.category}</span><strong>{money(row.spent)}</strong></div>
                  <div className="purchasing-bar-track"><span style={{ width: Math.max(2, row.spent / maxCategorySpend * 100) + '%' }} /></div>
                  <small>{money(row.planned)} planned</small>
                </div>)}
              </div>
            </article>
          </section>

          <section className="purchasing-budget-tools">
            <article className="card purchasing-budget-list-card">
              <div className="purchasing-section-heading">
                <div><span className="purchasing-kicker">Budget list</span><h2>Everything in the budget</h2><p>Add items, organize them with category tags, and record payments as money is actually spent.</p></div>
                <div className="purchasing-budget-list-actions"><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{categoryRows.map((row) => <option key={row.category} value={row.category}>{row.category}</option>)}</select><button className="primary compact-button" onClick={openGeneralSpend}>+ Record spending</button></div>
              </div>

              <div className="purchasing-budget-item-view" aria-label="Budget item visibility">
                <button className={budgetItemView === 'current' ? 'active' : ''} onClick={() => setBudgetItemView('current')}>Current items <span>{selectedBudgetItems.length}</span></button>
                <button className={budgetItemView === 'hidden' ? 'active' : ''} onClick={() => setBudgetItemView('hidden')}>Hidden items <span>{hiddenBudgetItems.length}</span></button>
              </div>

              <div className="purchasing-budget-table">
                <div className="purchasing-budget-table-head"><span>Item</span><span>Planned</span><span>Spent</span><span>Difference</span><span></span></div>
                {visibleBudgetItems.map((item) => {
                  const itemSpends = selectedBudgetSpends.filter((entry) => entry.budget_item_id === item.id)
                  const spent = itemSpendMap.get(item.id) ?? 0
                  const difference = item.planned_amount - spent
                  return <div className={'purchasing-budget-row ' + (!item.active ? 'hidden-item' : '')} key={item.id}>
                    <span className="purchasing-budget-item-name"><strong>{item.description}</strong><small>{item.category}{!item.counts_toward_plan ? ' • Reference only' : ''}{item.purchase_item_id ? ' • From Purchases' : ''}{itemSpends.length > 0 ? ' • ' + itemSpends.length + ' spend ' + (itemSpends.length === 1 ? 'record' : 'records') : ''}{!item.active ? ' • Hidden' : ''}</small>{item.notes && <em>{item.notes}</em>}</span>
                    <span data-label="Planned"><strong>{money(item.planned_amount)}</strong></span>
                    <span data-label="Spent"><strong>{money(spent)}</strong></span>
                    <span className={difference < 0 ? 'negative' : ''} data-label="Difference"><strong>{money(difference)}</strong></span>
                    <span className="purchasing-budget-row-actions">
                      {item.purchase_item_id ? <span className="purchasing-auto-tracked">Tracked in Purchases</span> : item.active ? <>
                        <button className="ghost compact-button" onClick={() => openSpendForItem(item)}>Record spend</button>
                        <button className="ghost compact-button" disabled={saving} onClick={() => void archiveBudgetItem(item)}>Hide</button>
                        {profile.role === 'admin' && itemSpends.length === 0 && <button className="ghost compact-button danger-button" disabled={saving} onClick={() => void removeBudgetItem(item)}>Remove</button>}
                      </> : <>
                        <button className="ghost compact-button" disabled={saving} onClick={() => void restoreBudgetItem(item)}>Restore</button>
                        {profile.role === 'admin' && itemSpends.length === 0 && <button className="ghost compact-button danger-button" disabled={saving} onClick={() => void removeBudgetItem(item)}>Remove</button>}
                      </>}
                    </span>
                  </div>
                })}
                {visibleBudgetItems.length === 0 && <div className="purchasing-empty">{budgetItemView === 'hidden' ? 'No hidden budget items.' : 'No budget items match this category.'}</div>}
              </div>

              {unplannedSpends.length > 0 && <div className="purchasing-unplanned">
                <div className="purchasing-section-heading compact"><div><span className="purchasing-kicker">Unplanned spending</span><h3>Spent without a planned line</h3></div></div>
                {unplannedSpends.map((entry) => <div className="purchasing-unplanned-row" key={entry.id}><span><strong>{entry.description}</strong><small>{entry.category} • {shortDate(entry.spent_on)}</small></span><strong>{money(entry.amount)}</strong></div>)}
              </div>}

              <details className="purchasing-spend-history">
                <summary>Spending history <span>{selectedBudgetSpends.length}</span></summary>
                <div>
                  {selectedBudgetSpends
                    .filter((entry) => categoryFilter === 'all' || entry.category === categoryFilter)
                    .map((entry) => <article key={entry.id}><span><strong>{entry.description}</strong><small>{entry.category} • {shortDate(entry.spent_on)}</small>{entry.notes && <em>{entry.notes}</em>}</span><strong>{money(entry.amount)}</strong></article>)}
                </div>
              </details>
            </article>

            <aside className="card purchasing-budget-add">
              <div className="purchasing-section-heading compact"><div><span className="purchasing-kicker">Add to plan</span><h2>New budget item</h2></div></div>
              <label className="field"><span>Item *</span><input value={budgetItemDescription} onChange={(event) => setBudgetItemDescription(event.target.value)} placeholder="Intern pay, snacks, trip tickets…" /></label>
              <label className="field"><span>Category tag</span><input list="purchasing-categories" value={budgetItemCategory} onChange={(event) => setBudgetItemCategory(event.target.value)} /></label>
              <label className="field"><span>Planned amount</span><input type="number" min="0" step="0.01" value={budgetItemPlanned} onChange={(event) => setBudgetItemPlanned(event.target.value)} /></label>
              <label className="field"><span>Notes</span><textarea rows={3} value={budgetItemNotes} onChange={(event) => setBudgetItemNotes(event.target.value)} /></label>
              <label className="purchasing-check"><input type="checkbox" checked={budgetItemCounts} onChange={(event) => setBudgetItemCounts(event.target.checked)} /><span><strong>Count this in the planned total</strong><small>Turn this off for an idea/reference item you do not want included yet.</small></span></label>
              <button className="primary" disabled={saving || !budgetItemDescription.trim()} onClick={() => void addBudgetItem()}>{saving ? 'Adding…' : 'Add budget item'}</button>
            </aside>
          </section>
        </> : <div className="card purchasing-empty">No active budgets yet. An admin can create one when a program has a fixed budget.</div>}
      </>}

      {spendOpen && selectedBudget && <div className="purchasing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSpendOpen(false) }}>
        <section className="card purchasing-modal" role="dialog" aria-modal="true" aria-labelledby="record-spend-title">
          <div className="purchasing-section-heading"><div><span className="purchasing-kicker">Actual spending</span><h2 id="record-spend-title">Record money spent</h2><p>{selectedBudget.name}</p></div><button className="ghost" onClick={() => setSpendOpen(false)}>Close</button></div>
          <div className="purchasing-form-grid">
            <label className="field full"><span>Description *</span><input value={spendDescription} onChange={(event) => setSpendDescription(event.target.value)} /></label>
            <label className="field"><span>Budget item (optional)</span><select value={spendItemId} onChange={(event) => { const value = event.target.value; setSpendItemId(value); const item = selectedBudgetItems.find((entry) => entry.id === Number(value)); if (item) { setSpendDescription(item.description); setSpendCategory(item.category) } }}><option value="">Unplanned / general spend</option>{selectedBudgetItems.filter((item) => !item.purchase_item_id).map((item) => <option key={item.id} value={item.id}>{item.description}</option>)}</select></label>
            <label className="field"><span>Category</span><input list="purchasing-categories" value={spendCategory} onChange={(event) => setSpendCategory(event.target.value)} /></label>
            <label className="field"><span>Amount *</span><input type="number" min="0" step="0.01" value={spendAmount} onChange={(event) => setSpendAmount(event.target.value)} /></label>
            <label className="field"><span>Date (optional)</span><input type="date" value={spendDate} onChange={(event) => setSpendDate(event.target.value)} /></label>
            <label className="field full"><span>Notes</span><textarea rows={3} value={spendNotes} onChange={(event) => setSpendNotes(event.target.value)} /></label>
          </div>
          <button className="primary" disabled={saving || !spendDescription.trim() || !spendAmount} onClick={() => void recordSpend()}>{saving ? 'Recording…' : 'Record spending'}</button>
        </section>
      </div>}

      {budgetEditorOpen && profile.role === 'admin' && <div className="purchasing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setBudgetEditorOpen(false) }}>
        <section className="card purchasing-modal" role="dialog" aria-modal="true" aria-labelledby="budget-editor-title">
          <div className="purchasing-section-heading"><div><span className="purchasing-kicker">Admin</span><h2 id="budget-editor-title">{editingBudgetId ? 'Budget settings' : 'Create budget'}</h2><p>Only admins set the total program budget.</p></div><button className="ghost" onClick={() => setBudgetEditorOpen(false)}>Close</button></div>
          <div className="purchasing-form-grid">
            <label className="field full"><span>Budget name *</span><input value={budgetName} onChange={(event) => setBudgetName(event.target.value)} placeholder="Summer 2027" /></label>
            <label className="field"><span>Total budget</span><input type="number" min="0" step="0.01" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} /></label>
            <label className="field"><span>Period label</span><input value={budgetPeriod} onChange={(event) => setBudgetPeriod(event.target.value)} placeholder="Summer 2027" /></label>
            <label className="field"><span>Starts</span><input type="date" value={budgetStart} onChange={(event) => setBudgetStart(event.target.value)} /></label>
            <label className="field"><span>Ends</span><input type="date" value={budgetEnd} onChange={(event) => setBudgetEnd(event.target.value)} /></label>
            <label className="field full"><span>Notes</span><textarea rows={3} value={budgetNotes} onChange={(event) => setBudgetNotes(event.target.value)} /></label>
          </div>
          <button className="primary" disabled={saving || !budgetName.trim()} onClick={() => void saveBudget()}>{saving ? 'Saving…' : editingBudgetId ? 'Save budget' : 'Create budget'}</button>
        </section>
      </div>}

      <datalist id="purchasing-categories">{categoryOptions.map((category) => <option value={category} key={category} />)}</datalist>
    </main>
  </div>
}
