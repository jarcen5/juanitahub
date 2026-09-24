'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type Category = { id: number; name: string; description: string | null; active: boolean }
type Location = { id: number; name: string; parent_location_id: number | null; description: string | null; active: boolean }
type ItemType = 'consumable' | 'durable'
type Condition = 'new' | 'good' | 'fair' | 'needs_repair' | 'damaged' | 'retired' | 'not_applicable'
type Item = {
  id: number
  name: string
  category_id: number | null
  item_type: ItemType
  unit: string
  minimum_stock: number
  condition: Condition
  notes: string | null
  active: boolean
}
type Stock = { item_id: number; location_id: number; quantity: number }
type TransactionType = 'receive' | 'use' | 'transfer' | 'damage_loss' | 'correction'
type Transaction = {
  id: number
  item_id: number
  location_id: number
  related_location_id: number | null
  transaction_type: TransactionType
  quantity_change: number
  balance_after: number
  notes: string | null
  recorded_by: string | null
  recorded_at: string
}
type Staff = { user_id: string; display_name: string }

const conditionLabels: Record<Condition, string> = {
  new: 'New',
  good: 'Good',
  fair: 'Fair',
  needs_repair: 'Needs repair',
  damaged: 'Damaged',
  retired: 'Retired',
  not_applicable: 'N/A',
}

const transactionLabels: Record<TransactionType, string> = {
  receive: 'Received',
  use: 'Used',
  transfer: 'Transfer',
  damage_loss: 'Damage / loss',
  correction: 'Correction',
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function InventoryPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [stock, setStock] = useState<Stock[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<'items' | 'history' | 'setup'>('items')
  const [search, setSearch] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all')
  const [categoryFilter, setCategoryFilter] = useState('')

  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [itemName, setItemName] = useState('')
  const [itemCategory, setItemCategory] = useState('')
  const [itemType, setItemType] = useState<ItemType>('consumable')
  const [itemUnit, setItemUnit] = useState('each')
  const [itemMin, setItemMin] = useState('0')
  const [itemCondition, setItemCondition] = useState<Condition>('not_applicable')
  const [itemNotes, setItemNotes] = useState('')
  const [initialLocation, setInitialLocation] = useState('')
  const [initialQuantity, setInitialQuantity] = useState('0')

  const [adjustType, setAdjustType] = useState<TransactionType>('receive')
  const [adjustLocation, setAdjustLocation] = useState('')
  const [adjustDestination, setAdjustDestination] = useState('')
  const [adjustQuantity, setAdjustQuantity] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')

  const [categoryName, setCategoryName] = useState('')
  const [categoryDescription, setCategoryDescription] = useState('')
  const [locationName, setLocationName] = useState('')
  const [locationParent, setLocationParent] = useState('')
  const [locationDescription, setLocationDescription] = useState('')

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

    if (!currentProfile?.active) {
      setLoading(false)
      return
    }

    const [categoryResult, locationResult, itemResult, stockResult, transactionResult, staffResult] = await Promise.all([
      supabase.from('inventory_categories').select('id,name,description,active').order('name'),
      supabase.from('inventory_locations').select('id,name,parent_location_id,description,active').order('name'),
      supabase.from('inventory_items').select('id,name,category_id,item_type,unit,minimum_stock,condition,notes,active').order('name'),
      supabase.from('inventory_stock').select('item_id,location_id,quantity'),
      supabase.from('inventory_transactions').select('id,item_id,location_id,related_location_id,transaction_type,quantity_change,balance_after,notes,recorded_by,recorded_at').order('recorded_at', { ascending: false }).limit(500),
      supabase.from('staff_profiles').select('user_id,display_name').eq('active', true),
    ])

    setCategories((categoryResult.data ?? []) as Category[])
    setLocations((locationResult.data ?? []) as Location[])
    setItems((itemResult.data ?? []) as Item[])
    setStock((stockResult.data ?? []).map((row: any) => ({ ...row, quantity: Number(row.quantity) })) as Stock[])
    setTransactions((transactionResult.data ?? []).map((row: any) => ({ ...row, quantity_change: Number(row.quantity_change), balance_after: Number(row.balance_after) })) as Transaction[])
    setStaff((staffResult.data ?? []) as Staff[])
    setMessage(
      profileResult.error?.message
      ?? categoryResult.error?.message
      ?? locationResult.error?.message
      ?? itemResult.error?.message
      ?? stockResult.error?.message
      ?? transactionResult.error?.message
      ?? staffResult.error?.message
      ?? '',
    )
    setLoading(false)
  }

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
  const locationMap = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations])
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const staffMap = useMemo(() => new Map(staff.map((person) => [person.user_id, person.display_name])), [staff])

  const locationLabel = (id: number) => {
    const location = locationMap.get(id)
    if (!location) return 'Unknown location'
    if (!location.parent_location_id) return location.name
    const parent = locationMap.get(location.parent_location_id)
    return parent ? `${parent.name} → ${location.name}` : location.name
  }

  const totalByItem = useMemo(() => {
    const map = new Map<number, number>()
    for (const row of stock) map.set(row.item_id, (map.get(row.item_id) ?? 0) + row.quantity)
    return map
  }, [stock])

  const stockByItem = useMemo(() => {
    const map = new Map<number, Stock[]>()
    for (const row of stock) {
      const list = map.get(row.item_id) ?? []
      list.push(row)
      map.set(row.item_id, list)
    }
    return map
  }, [stock])

  const lowStockCount = useMemo(() => items.filter((item) => item.active && item.minimum_stock > 0 && (totalByItem.get(item.id) ?? 0) <= item.minimum_stock).length, [items, totalByItem])
  const outOfStockCount = useMemo(() => items.filter((item) => item.active && (totalByItem.get(item.id) ?? 0) <= 0).length, [items, totalByItem])
  const durableCount = items.filter((item) => item.active && item.item_type === 'durable').length

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items
      .filter((item) => item.active)
      .filter((item) => !categoryFilter || String(item.category_id ?? '') === categoryFilter)
      .filter((item) => {
        const total = totalByItem.get(item.id) ?? 0
        if (stockFilter === 'low') return item.minimum_stock > 0 && total <= item.minimum_stock
        if (stockFilter === 'out') return total <= 0
        return true
      })
      .filter((item) => !term
        || item.name.toLowerCase().includes(term)
        || (categoryMap.get(item.category_id ?? -1)?.name ?? '').toLowerCase().includes(term)
        || (item.notes ?? '').toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items, search, categoryFilter, stockFilter, totalByItem, categoryMap])

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null

  function resetItemForm() {
    setSelectedItemId(null)
    setItemName('')
    setItemCategory('')
    setItemType('consumable')
    setItemUnit('each')
    setItemMin('0')
    setItemCondition('not_applicable')
    setItemNotes('')
    setInitialLocation(locations.find((location) => location.active)?.id ? String(locations.find((location) => location.active)?.id) : '')
    setInitialQuantity('0')
  }

  function editItem(item: Item) {
    setSelectedItemId(item.id)
    setItemName(item.name)
    setItemCategory(item.category_id ? String(item.category_id) : '')
    setItemType(item.item_type)
    setItemUnit(item.unit)
    setItemMin(String(item.minimum_stock))
    setItemCondition(item.condition)
    setItemNotes(item.notes ?? '')
    const firstStock = (stockByItem.get(item.id) ?? []).find((row) => row.quantity > 0) ?? (stockByItem.get(item.id) ?? [])[0]
    setAdjustLocation(firstStock ? String(firstStock.location_id) : String(locations.find((location) => location.active)?.id ?? ''))
    setAdjustDestination('')
    setAdjustQuantity('')
    setAdjustNotes('')
    setTab('items')
  }

  async function saveItem() {
    if (!session || profile?.role !== 'admin' || saving || !itemName.trim()) return
    const minimum = Number(itemMin)
    if (!Number.isFinite(minimum) || minimum < 0) {
      setMessage('Minimum stock must be zero or greater.')
      return
    }

    setSaving(true)
    setMessage('')
    const payload = {
      name: itemName.trim(),
      category_id: itemCategory ? Number(itemCategory) : null,
      item_type: itemType,
      unit: itemUnit.trim() || 'each',
      minimum_stock: minimum,
      condition: itemType === 'consumable' && itemCondition === 'good' ? 'not_applicable' : itemCondition,
      notes: itemNotes.trim() || null,
      updated_by: session.user.id,
    }

    if (selectedItem) {
      const { error } = await supabase.from('inventory_items').update(payload).eq('id', selectedItem.id)
      if (error) setMessage(error.message)
      else {
        setMessage('Inventory item updated.')
        await loadData()
      }
      setSaving(false)
      return
    }

    if (Number(initialQuantity) > 0 && !initialLocation) {
      setMessage('Choose a location for the initial quantity.')
      setSaving(false)
      return
    }

    const { data, error } = await supabase.from('inventory_items').insert({ ...payload, created_by: session.user.id }).select('id').single()
    if (error || !data) {
      setMessage(error?.message ?? 'Could not create the inventory item.')
      setSaving(false)
      return
    }

    const initial = Number(initialQuantity)
    if (initial > 0) {
      const { error: stockError } = await supabase.rpc('adjust_inventory_stock', {
        p_item_id: data.id,
        p_location_id: Number(initialLocation),
        p_transaction_type: 'receive',
        p_quantity: initial,
        p_notes: 'Initial inventory quantity',
        p_to_location_id: null,
      })
      if (stockError) {
        setMessage(`Item created at zero stock, but the initial quantity could not be added: ${stockError.message}`)
        setSelectedItemId(data.id)
        await loadData()
        setSaving(false)
        return
      }
    }

    setMessage('Inventory item created.')
    resetItemForm()
    await loadData()
    setSaving(false)
  }

  async function adjustStock() {
    if (!selectedItem || profile?.role !== 'admin' || saving || !adjustLocation) return
    const quantity = Number(adjustQuantity)
    if (!Number.isFinite(quantity) || quantity === 0) {
      setMessage('Enter a quantity other than zero.')
      return
    }
    if (adjustType !== 'correction' && quantity < 0) {
      setMessage('Use a positive quantity for this adjustment type.')
      return
    }
    if (adjustType === 'transfer' && (!adjustDestination || adjustDestination === adjustLocation)) {
      setMessage('Choose a different destination location for the transfer.')
      return
    }

    setSaving(true)
    setMessage('')
    const { error } = await supabase.rpc('adjust_inventory_stock', {
      p_item_id: selectedItem.id,
      p_location_id: Number(adjustLocation),
      p_transaction_type: adjustType,
      p_quantity: quantity,
      p_notes: adjustNotes.trim() || null,
      p_to_location_id: adjustType === 'transfer' ? Number(adjustDestination) : null,
    })

    if (error) setMessage(error.message)
    else {
      setAdjustQuantity('')
      setAdjustNotes('')
      setAdjustDestination('')
      setMessage('Stock updated and recorded in inventory history.')
      await loadData()
    }
    setSaving(false)
  }

  async function archiveItem() {
    if (!selectedItem || !session || profile?.role !== 'admin' || saving) return
    const total = totalByItem.get(selectedItem.id) ?? 0
    if (total > 0) {
      setMessage('Move, use, or correct this item to zero stock before archiving it.')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('inventory_items').update({ active: false, updated_by: session.user.id }).eq('id', selectedItem.id)
    if (error) setMessage(error.message)
    else {
      setMessage('Inventory item archived. Its history is preserved.')
      resetItemForm()
      await loadData()
    }
    setSaving(false)
  }

  async function addCategory() {
    if (!session || profile?.role !== 'admin' || saving || !categoryName.trim()) return
    setSaving(true)
    const { error } = await supabase.from('inventory_categories').insert({
      name: categoryName.trim(),
      description: categoryDescription.trim() || null,
      created_by: session.user.id,
      updated_by: session.user.id,
    })
    if (error) setMessage(error.message)
    else {
      setCategoryName('')
      setCategoryDescription('')
      setMessage('Inventory category added.')
      await loadData()
    }
    setSaving(false)
  }

  async function addLocation() {
    if (!session || profile?.role !== 'admin' || saving || !locationName.trim()) return
    setSaving(true)
    const { error } = await supabase.from('inventory_locations').insert({
      name: locationName.trim(),
      parent_location_id: locationParent ? Number(locationParent) : null,
      description: locationDescription.trim() || null,
      created_by: session.user.id,
      updated_by: session.user.id,
    })
    if (error) setMessage(error.message)
    else {
      setLocationName('')
      setLocationParent('')
      setLocationDescription('')
      setMessage('Inventory location added.')
      await loadData()
    }
    setSaving(false)
  }

  if (loading && !profile) return <main className="login-wrap"><div className="card login-card">Loading Inventory…</div></main>
  if (!session) return <main className="login-wrap"><div className="card login-card"><h1>Inventory</h1><p className="subtle">Sign in to Juanita Hub to continue.</p></div></main>
  if (!profile?.active) return <main className="login-wrap"><div className="card login-card"><h1>Inventory</h1><p className="subtle">An active staff account is required.</p></div></main>

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Inventory & Supplies</small></div>
        <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div>
      </header>

      <main className="main inventory-page">
        <section className="hero inventory-hero">
          <div><span className="inventory-kicker">Center supplies</span><h1>Inventory</h1><p className="subtle">Know what the center has, where it is, what is running low, and how quantities changed.</p></div>
          {profile.role === 'admin' && <button className="primary" onClick={() => { resetItemForm(); setTab('items') }}>+ New item</button>}
        </section>

        {message && <div className="notice">{message}</div>}

        <section className="grid stats inventory-stats">
          <div className="card stat"><span className="subtle">Active items</span><strong>{items.filter((item) => item.active).length}</strong></div>
          <button className="card stat inventory-stat-button" onClick={() => { setStockFilter('low'); setTab('items') }}><span className="subtle">Low stock</span><strong>{lowStockCount}</strong></button>
          <button className="card stat inventory-stat-button" onClick={() => { setStockFilter('out'); setTab('items') }}><span className="subtle">Out of stock</span><strong>{outOfStockCount}</strong></button>
          <div className="card stat"><span className="subtle">Durable items</span><strong>{durableCount}</strong></div>
        </section>

        <div className="inventory-tabs">
          <button className={tab === 'items' ? 'active' : ''} onClick={() => setTab('items')}>Items</button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>History</button>
          <button className={tab === 'setup' ? 'active' : ''} onClick={() => setTab('setup')}>Categories & Locations</button>
        </div>

        {tab === 'items' && <section className="inventory-layout">
          <div className="inventory-list-column">
            <section className="card inventory-filter-card">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inventory…" />
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
              <div className="inventory-segmented"><button className={stockFilter === 'all' ? 'active' : ''} onClick={() => setStockFilter('all')}>All</button><button className={stockFilter === 'low' ? 'active' : ''} onClick={() => setStockFilter('low')}>Low</button><button className={stockFilter === 'out' ? 'active' : ''} onClick={() => setStockFilter('out')}>Out</button></div>
            </section>

            <div className="inventory-item-list">
              {filteredItems.length === 0 && <section className="card inventory-empty"><strong>No inventory items match this view.</strong><span>{items.length === 0 ? 'Use New item to add the center’s first supply or piece of equipment.' : 'Try changing the filters.'}</span></section>}
              {filteredItems.map((item) => {
                const total = totalByItem.get(item.id) ?? 0
                const low = item.minimum_stock > 0 && total <= item.minimum_stock
                const itemStock = (stockByItem.get(item.id) ?? []).filter((row) => row.quantity > 0)
                return <button className={`card inventory-item-card ${selectedItemId === item.id ? 'selected' : ''} ${low ? 'low' : ''}`} key={item.id} onClick={() => editItem(item)}>
                  <div className="inventory-item-heading"><div><span className={`inventory-type ${item.item_type}`}>{item.item_type}</span><h3>{item.name}</h3></div><strong className={total <= 0 ? 'zero' : low ? 'low' : ''}>{formatQuantity(total)} <small>{item.unit}</small></strong></div>
                  <div className="inventory-item-meta"><span>{categoryMap.get(item.category_id ?? -1)?.name ?? 'Uncategorized'}</span>{item.item_type === 'durable' && <span>{conditionLabels[item.condition]}</span>}{low && <span className="inventory-low-label">{total <= 0 ? 'Out of stock' : `Low • min ${formatQuantity(item.minimum_stock)}`}</span>}</div>
                  <div className="inventory-location-chips">{itemStock.length ? itemStock.slice(0, 3).map((row) => <span key={row.location_id}>{locationLabel(row.location_id)} • {formatQuantity(row.quantity)}</span>) : <span>No stock on hand</span>}{itemStock.length > 3 && <span>+{itemStock.length - 3} locations</span>}</div>
                </button>
              })}
            </div>
          </div>

          {profile.role === 'admin' ? <aside className="card inventory-editor">
            <div className="inventory-panel-heading"><div><span className="inventory-kicker">{selectedItem ? 'Item details' : 'New inventory item'}</span><h2>{selectedItem?.name ?? 'Create an item'}</h2></div>{selectedItem && <button className="ghost" onClick={resetItemForm}>New</button>}</div>
            <div className="inventory-form">
              <label className="field"><span>Name *</span><input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Construction paper" /></label>
              <div className="inventory-form-grid">
                <label className="field"><span>Category</span><select value={itemCategory} onChange={(event) => setItemCategory(event.target.value)}><option value="">Uncategorized</option>{categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                <label className="field"><span>Type</span><select value={itemType} onChange={(event) => { const value = event.target.value as ItemType; setItemType(value); if (value === 'consumable') setItemCondition('not_applicable'); else if (itemCondition === 'not_applicable') setItemCondition('good') }}><option value="consumable">Consumable</option><option value="durable">Durable</option></select></label>
                <label className="field"><span>Unit</span><input value={itemUnit} onChange={(event) => setItemUnit(event.target.value)} placeholder="each, packs, boxes…" /></label>
                <label className="field"><span>Low-stock level</span><input type="number" min="0" step="0.01" value={itemMin} onChange={(event) => setItemMin(event.target.value)} /></label>
                {itemType === 'durable' && <label className="field"><span>Condition</span><select value={itemCondition} onChange={(event) => setItemCondition(event.target.value as Condition)}>{(['new','good','fair','needs_repair','damaged','retired'] as Condition[]).map((condition) => <option key={condition} value={condition}>{conditionLabels[condition]}</option>)}</select></label>}
                {!selectedItem && <><label className="field"><span>Initial location</span><select value={initialLocation} onChange={(event) => setInitialLocation(event.target.value)}><option value="">Choose location…</option>{locations.filter((location) => location.active).map((location) => <option key={location.id} value={location.id}>{locationLabel(location.id)}</option>)}</select></label><label className="field"><span>Initial quantity</span><input type="number" min="0" step="0.01" value={initialQuantity} onChange={(event) => setInitialQuantity(event.target.value)} /></label></>}
              </div>
              <label className="field"><span>Notes</span><textarea rows={3} value={itemNotes} onChange={(event) => setItemNotes(event.target.value)} placeholder="Size, brand, model, storage note…" /></label>
              {locations.filter((location) => location.active).length === 0 && !selectedItem && <div className="inventory-helper-warning">Add at least one location under Categories & Locations before entering starting stock.</div>}
              <button className="primary" disabled={saving || !itemName.trim()} onClick={() => void saveItem()}>{saving ? 'Saving…' : selectedItem ? 'Save item details' : 'Create item'}</button>
            </div>

            {selectedItem && <div className="inventory-adjustment">
              <div className="inventory-panel-heading compact"><div><span className="inventory-kicker">Stock movement</span><h3>Adjust quantity</h3></div><strong>{formatQuantity(totalByItem.get(selectedItem.id) ?? 0)} {selectedItem.unit} total</strong></div>
              <div className="inventory-form-grid">
                <label className="field"><span>Action</span><select value={adjustType} onChange={(event) => setAdjustType(event.target.value as TransactionType)}><option value="receive">Receive stock</option><option value="use">Use / consume</option><option value="transfer">Transfer location</option><option value="damage_loss">Damage / loss</option><option value="correction">Count correction (+/-)</option></select></label>
                <label className="field"><span>{adjustType === 'transfer' ? 'From location' : 'Location'}</span><select value={adjustLocation} onChange={(event) => setAdjustLocation(event.target.value)}><option value="">Choose location…</option>{locations.filter((location) => location.active).map((location) => <option key={location.id} value={location.id}>{locationLabel(location.id)} • {formatQuantity((stockByItem.get(selectedItem.id) ?? []).find((row) => row.location_id === location.id)?.quantity ?? 0)}</option>)}</select></label>
                {adjustType === 'transfer' && <label className="field"><span>To location</span><select value={adjustDestination} onChange={(event) => setAdjustDestination(event.target.value)}><option value="">Choose destination…</option>{locations.filter((location) => location.active && String(location.id) !== adjustLocation).map((location) => <option key={location.id} value={location.id}>{locationLabel(location.id)}</option>)}</select></label>}
                <label className="field"><span>{adjustType === 'correction' ? 'Change (+ or -)' : 'Quantity'}</span><input type="number" step="0.01" value={adjustQuantity} onChange={(event) => setAdjustQuantity(event.target.value)} placeholder={adjustType === 'correction' ? '-3 or 5' : '0'} /></label>
              </div>
              <label className="field"><span>Reason / note</span><input value={adjustNotes} onChange={(event) => setAdjustNotes(event.target.value)} placeholder="Optional explanation" /></label>
              <button className="primary" disabled={saving || !adjustLocation || !adjustQuantity} onClick={() => void adjustStock()}>{saving ? 'Updating…' : 'Record adjustment'}</button>
              <button className="ghost danger-button inventory-archive-button" disabled={saving} onClick={() => void archiveItem()}>Archive item</button>
            </div>}
          </aside> : <aside className="card inventory-readonly-note"><strong>Inventory is view-only for staff.</strong><span>An admin can create items, change quantities, and manage locations/categories.</span></aside>}
        </section>}

        {tab === 'history' && <section className="card inventory-history">
          <div className="inventory-panel-heading"><div><span className="inventory-kicker">Audit trail</span><h2>Stock history</h2></div><span>{transactions.length} recent changes</span></div>
          <div className="inventory-history-list">
            {transactions.length === 0 && <div className="inventory-empty"><strong>No stock history yet.</strong><span>Receiving or adjusting inventory will create the first record.</span></div>}
            {transactions.map((transaction) => {
              const item = itemMap.get(transaction.item_id)
              const positive = transaction.quantity_change > 0
              return <article key={transaction.id}>
                <div className={`inventory-history-change ${positive ? 'positive' : 'negative'}`}>{positive ? '+' : ''}{formatQuantity(transaction.quantity_change)}</div>
                <div><strong>{item?.name ?? 'Inventory item'}</strong><span>{transactionLabels[transaction.transaction_type]} • {locationLabel(transaction.location_id)}{transaction.related_location_id ? ` ↔ ${locationLabel(transaction.related_location_id)}` : ''}</span>{transaction.notes && <p>{transaction.notes}</p>}</div>
                <div className="inventory-history-meta"><strong>{formatQuantity(transaction.balance_after)} {item?.unit ?? ''}</strong><span>{formatDateTime(transaction.recorded_at)}</span><small>{transaction.recorded_by ? staffMap.get(transaction.recorded_by) ?? 'Staff' : 'System'}</small></div>
              </article>
            })}
          </div>
        </section>}

        {tab === 'setup' && <section className="inventory-setup-grid">
          <section className="card inventory-setup-card">
            <div className="inventory-panel-heading"><div><span className="inventory-kicker">Organize supplies</span><h2>Categories</h2></div><span>{categories.filter((category) => category.active).length}</span></div>
            <div className="inventory-setup-list">{categories.filter((category) => category.active).map((category) => <article key={category.id}><strong>{category.name}</strong><span>{category.description || 'No description'}</span></article>)}{categories.filter((category) => category.active).length === 0 && <div className="inventory-empty small">No categories yet.</div>}</div>
            {profile.role === 'admin' && <div className="inventory-setup-form"><label className="field"><span>Name</span><input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Arts & Crafts" /></label><label className="field"><span>Description</span><input value={categoryDescription} onChange={(event) => setCategoryDescription(event.target.value)} placeholder="Optional" /></label><button className="primary" disabled={saving || !categoryName.trim()} onClick={() => void addCategory()}>Add category</button></div>}
          </section>

          <section className="card inventory-setup-card">
            <div className="inventory-panel-heading"><div><span className="inventory-kicker">Where things live</span><h2>Locations</h2></div><span>{locations.filter((location) => location.active).length}</span></div>
            <div className="inventory-setup-list">{locations.filter((location) => location.active).map((location) => <article key={location.id}><strong>{locationLabel(location.id)}</strong><span>{location.description || (location.parent_location_id ? 'Nested storage location' : 'Top-level location')}</span></article>)}{locations.filter((location) => location.active).length === 0 && <div className="inventory-empty small">No locations yet.</div>}</div>
            {profile.role === 'admin' && <div className="inventory-setup-form"><label className="field"><span>Name</span><input value={locationName} onChange={(event) => setLocationName(event.target.value)} placeholder="Cabinet A" /></label><label className="field"><span>Inside</span><select value={locationParent} onChange={(event) => setLocationParent(event.target.value)}><option value="">Top-level location</option>{locations.filter((location) => location.active && !location.parent_location_id).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label className="field"><span>Description</span><input value={locationDescription} onChange={(event) => setLocationDescription(event.target.value)} placeholder="Optional" /></label><button className="primary" disabled={saving || !locationName.trim()} onClick={() => void addLocation()}>Add location</button></div>}
          </section>
        </section>}
      </main>
    </div>
  )
}
