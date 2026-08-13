'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type Category = { id: number; slug: string; name: string }
type Tier = { id: number; name: string; min_spins: number }
type Prize = {
  id: number
  category_id: number
  required_tier_id: number
  name: string
  active: boolean
}
type Inventory = {
  prize_id: number
  month_start: string
  quantity_start: number
  quantity_remaining: number
  enabled: boolean
}
type WinRef = { prize_id: number | null }

function localMonthStart() {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return `${new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 7)}-01`
}

export default function ManagePrizesPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [winRefs, setWinRefs] = useState<WinRef[]>([])
  const [loading, setLoading] = useState(true)
  const [editingPrizeId, setEditingPrizeId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [busyPrizeId, setBusyPrizeId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<'info' | 'error' | 'success'>('info')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      setPrizes([])
      return
    }
    void loadData()
  }, [session])

  function showMessage(text: string, kind: 'info' | 'error' | 'success' = 'info') {
    setMessage(text)
    setMessageKind(kind)
  }

  async function loadData() {
    if (!session) return
    setLoading(true)

    const [profileResult, categoryResult, tierResult, prizeResult, inventoryResult, winsResult] = await Promise.all([
      supabase.from('staff_profiles').select('display_name, role, active').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('wheel_categories').select('id, slug, name').order('display_order'),
      supabase.from('wheel_tiers').select('id, name, min_spins').order('display_order'),
      supabase.from('wheel_prizes').select('id, category_id, required_tier_id, name, active').order('category_id').order('name'),
      supabase.from('wheel_inventory').select('prize_id, month_start, quantity_start, quantity_remaining, enabled'),
      supabase.from('prize_wins').select('prize_id'),
    ])

    const error = profileResult.error || categoryResult.error || tierResult.error || prizeResult.error || inventoryResult.error || winsResult.error
    if (error) showMessage(error.message, 'error')

    setProfile(profileResult.data as Profile | null)
    setCategories((categoryResult.data ?? []) as Category[])
    setTiers((tierResult.data ?? []) as Tier[])
    setPrizes((prizeResult.data ?? []) as Prize[])
    setInventory((inventoryResult.data ?? []) as Inventory[])
    setWinRefs((winsResult.data ?? []) as WinRef[])
    setLoading(false)
  }

  const categoryById = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories])
  const tierById = useMemo(() => new Map(tiers.map((item) => [item.id, item])), [tiers])
  const winCountByPrize = useMemo(() => {
    const counts = new Map<number, number>()
    for (const row of winRefs) {
      if (row.prize_id == null) continue
      counts.set(row.prize_id, (counts.get(row.prize_id) ?? 0) + 1)
    }
    return counts
  }, [winRefs])

  const inventoryCountByPrize = useMemo(() => {
    const counts = new Map<number, number>()
    for (const row of inventory) counts.set(row.prize_id, (counts.get(row.prize_id) ?? 0) + 1)
    return counts
  }, [inventory])

  const currentMonth = localMonthStart()
  const currentInventoryByPrize = useMemo(
    () => new Map(inventory.filter((row) => row.month_start === currentMonth).map((row) => [row.prize_id, row])),
    [inventory, currentMonth],
  )

  function startRename(prize: Prize) {
    setEditingPrizeId(prize.id)
    setEditingName(prize.name)
    setMessage('')
  }

  function cancelRename() {
    setEditingPrizeId(null)
    setEditingName('')
  }

  async function saveRename(prize: Prize) {
    if (profile?.role !== 'admin') return
    const nextName = editingName.trim()
    if (!nextName) {
      showMessage('Prize name cannot be blank.', 'error')
      return
    }

    setBusyPrizeId(prize.id)
    const { error } = await supabase.from('wheel_prizes').update({ name: nextName }).eq('id', prize.id)
    setBusyPrizeId(null)

    if (error) {
      showMessage(error.message, 'error')
      return
    }

    setEditingPrizeId(null)
    setEditingName('')
    showMessage(`Renamed “${prize.name}” to “${nextName}”. Existing recorded wins keep the prize name that was saved when the child spun.`, 'success')
    await loadData()
  }

  async function deletePrize(prize: Prize) {
    if (profile?.role !== 'admin') return

    const typed = window.prompt(
      `Permanently delete “${prize.name}”?\n\nThis removes the prize from every month’s inventory. Existing reward history will remain. This cannot be undone.\n\nType the exact prize name to confirm:`,
    )

    if (typed === null) return
    if (typed.trim() !== prize.name) {
      showMessage('Delete canceled because the confirmation text did not exactly match the prize name.', 'error')
      return
    }

    setBusyPrizeId(prize.id)
    const { error } = await supabase.from('wheel_prizes').delete().eq('id', prize.id)
    setBusyPrizeId(null)

    if (error) {
      showMessage(error.message, 'error')
      return
    }

    if (editingPrizeId === prize.id) cancelRename()
    showMessage(`“${prize.name}” was permanently deleted. Existing recorded wins were preserved.`, 'success')
    await loadData()
  }

  if (loading && !session) {
    return <main className="login-wrap"><div className="card login-card">Loading prize management…</div></main>
  }

  if (!session) {
    return (
      <main className="login-wrap">
        <section className="card login-card">
          <h1>Manage prizes</h1>
          <p className="subtle">Sign in through Juanita Hub first.</p>
          <Link className="primary" style={{ display: 'inline-block', textDecoration: 'none' }} href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  if (!profile?.active || profile.role !== 'admin') {
    return (
      <main className="login-wrap">
        <section className="card login-card">
          <h1>Manage prizes</h1>
          <div className="notice error">Only an active Juanita Hub administrator can rename or permanently delete prizes.</div>
          <Link className="ghost" style={{ display: 'inline-block', textDecoration: 'none' }} href="/rewards">Back to Reward Center</Link>
        </section>
      </main>
    )
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Prize Management</small></div>
        <div className="toolbar">
          <span>{profile.display_name} <span className="badge">admin</span></span>
          <Link className="ghost" style={{ textDecoration: 'none' }} href="/rewards">Reward Center</Link>
        </div>
      </header>

      <main className="main">
        <div className="hero">
          <div>
            <h1>Manage prizes</h1>
            <p className="subtle">Correct prize names or permanently remove prizes you no longer want in Juanita Hub.</p>
          </div>
        </div>

        <div className="notice" style={{ marginBottom: 16 }}>
          <strong>History is protected.</strong> Renaming a prize changes its current name. Permanently deleting it removes all of its monthly inventory, but previously recorded wins keep their saved prize name, category, and tier.
        </div>

        {message && <div className={`notice ${messageKind === 'error' ? 'error' : messageKind === 'success' ? 'success' : ''}`}>{message}</div>}

        {prizes.length === 0 ? (
          <section className="card"><div className="empty">No prizes have been created yet.</div></section>
        ) : categories.map((category) => {
          const categoryPrizes = prizes.filter((prize) => prize.category_id === category.id)
          if (categoryPrizes.length === 0) return null

          return (
            <section className="card" key={category.id} style={{ marginBottom: 16 }}>
              <h2>{category.slug === 'candy' ? '🍬' : category.slug === 'toys' ? '🧸' : '🍕'} {category.name}</h2>

              {categoryPrizes.map((prize) => {
                const tier = tierById.get(prize.required_tier_id)
                const currentInventory = currentInventoryByPrize.get(prize.id)
                const winCount = winCountByPrize.get(prize.id) ?? 0
                const monthCount = inventoryCountByPrize.get(prize.id) ?? 0
                const isEditing = editingPrizeId === prize.id
                const isBusy = busyPrizeId === prize.id

                return (
                  <div className="summary-row" key={prize.id} style={{ alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 280px' }}>
                      {isEditing ? (
                        <div className="inline-name-editor" style={{ maxWidth: 420 }}>
                          <input
                            value={editingName}
                            onChange={(event) => setEditingName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') void saveRename(prize)
                              if (event.key === 'Escape') cancelRename()
                            }}
                            autoFocus
                          />
                          <button className="primary" disabled={isBusy || !editingName.trim()} onClick={() => void saveRename(prize)}>{isBusy ? 'Saving…' : 'Save'}</button>
                          <button className="ghost" disabled={isBusy} onClick={cancelRename}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <strong style={{ fontSize: 17 }}>{prize.name}</strong>
                          {!prize.active && <span className="badge" style={{ marginLeft: 8 }}>Inactive</span>}
                        </>
                      )}

                      <div className="subtle" style={{ marginTop: 4 }}>
                        {tier?.name ?? 'Unknown'} tier ({tier?.min_spins ?? '?'}+ spins) • {winCount} recorded win{winCount === 1 ? '' : 's'} • stocked in {monthCount} month{monthCount === 1 ? '' : 's'}
                      </div>

                      <div className="subtle" style={{ marginTop: 2 }}>
                        {currentInventory
                          ? `This month: ${currentInventory.quantity_remaining} of ${currentInventory.quantity_start} remaining${currentInventory.enabled ? '' : ' • disabled'}`
                          : 'Not stocked this month'}
                      </div>
                    </div>

                    {!isEditing && (
                      <div className="toolbar" style={{ marginLeft: 'auto' }}>
                        <button className="ghost" disabled={isBusy} onClick={() => startRename(prize)}>Edit name</button>
                        <button className="danger-button" disabled={isBusy} onClick={() => void deletePrize(prize)}>{isBusy ? 'Deleting…' : 'Delete permanently'}</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          )
        })}
      </main>
    </div>
  )
}
