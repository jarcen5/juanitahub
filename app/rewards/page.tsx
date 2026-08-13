'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type RewardChild = {
  child_id: number
  child_name: string
  child_active: boolean
  earned_spins: number
  used_spins: number
  remaining_spins: number
  tier_id: number
  tier_slug: string
  tier_name: string
}
type Category = { id: number; slug: string; name: string; display_order: number }
type Tier = { id: number; slug: string; name: string; min_spins: number; display_order: number }
type Prize = { id: number; category_id: number; name: string; required_tier_id: number; active: boolean }
type Inventory = { id: number; prize_id: number; quantity_start: number; quantity_remaining: number; weight: number; enabled: boolean }
type InventoryEdit = { remaining: number; weight: number; enabled: boolean }
type Win = {
  id: number
  child_id: number
  spin_number: number
  prize_name_snapshot: string
  category_name_snapshot: string
  tier_name_snapshot: string
  won_at: string
}
type SpinResult = {
  win_id: number
  prize_id: number
  prize_name: string
  category_name: string
  tier_name: string
  earned_spins: number
  used_spins: number
  remaining_spins: number
  quantity_remaining: number
}

const wheelColors = ['#5b8def', '#28a745', '#e8b923', '#ef7d23', '#d64545', '#8b5cf6', '#0ea5a4', '#ec4899']

function localMonth() {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 7)
}

function monthStart(month: string) {
  return `${month}-01`
}

function monthLabel(month: string) {
  const [year, number] = month.split('-').map(Number)
  return new Date(year, number - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export default function RewardsPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [month, setMonth] = useState(localMonth())
  const [roster, setRoster] = useState<RewardChild[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [inventoryEdits, setInventoryEdits] = useState<Record<number, InventoryEdit>>({})
  const [wins, setWins] = useState<Win[]>([])
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('candy')
  const [loading, setLoading] = useState(true)
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [result, setResult] = useState<SpinResult | null>(null)
  const [message, setMessage] = useState('')
  const [newPrizeName, setNewPrizeName] = useState('')
  const [newPrizeCategory, setNewPrizeCategory] = useState<number | null>(null)
  const [newPrizeTier, setNewPrizeTier] = useState<number | null>(null)
  const [newPrizeStock, setNewPrizeStock] = useState(1)
  const [newPrizeWeight, setNewPrizeWeight] = useState(1)
  const [savingPrizeId, setSavingPrizeId] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    void loadRewardData()
  }, [session, month])

  useEffect(() => {
    if (!session || !selectedChildId) {
      setWins([])
      return
    }
    void loadWins(selectedChildId)
  }, [session, selectedChildId, month])

  async function loadRewardData() {
    if (!session) return
    setLoading(true)
    setMessage('')

    const start = monthStart(month)
    const [profileResult, rosterResult, categoryResult, tierResult, prizeResult, inventoryResult] = await Promise.all([
      supabase.from('staff_profiles').select('display_name, role, active').eq('user_id', session.user.id).maybeSingle(),
      supabase.rpc('get_reward_roster', { p_month_start: start }),
      supabase.from('wheel_categories').select('id, slug, name, display_order').eq('active', true).order('display_order'),
      supabase.from('wheel_tiers').select('id, slug, name, min_spins, display_order').eq('active', true).order('display_order'),
      supabase.from('wheel_prizes').select('id, category_id, name, required_tier_id, active').eq('active', true).order('name'),
      supabase.from('wheel_inventory').select('id, prize_id, quantity_start, quantity_remaining, weight, enabled').eq('month_start', start),
    ])

    const error = profileResult.error || rosterResult.error || categoryResult.error || tierResult.error || prizeResult.error || inventoryResult.error
    if (error) setMessage(error.message)

    const nextProfile = profileResult.data as Profile | null
    const nextRoster = (rosterResult.data ?? []) as RewardChild[]
    const nextCategories = (categoryResult.data ?? []) as Category[]
    const nextTiers = (tierResult.data ?? []) as Tier[]
    const nextInventory = (inventoryResult.data ?? []) as Inventory[]

    setProfile(nextProfile)
    setRoster(nextRoster)
    setCategories(nextCategories)
    setTiers(nextTiers)
    setPrizes((prizeResult.data ?? []) as Prize[])
    setInventory(nextInventory)
    setInventoryEdits(Object.fromEntries(nextInventory.map((row) => [row.prize_id, { remaining: Number(row.quantity_remaining), weight: Number(row.weight), enabled: row.enabled }])))
    setNewPrizeCategory((current) => current ?? nextCategories[0]?.id ?? null)
    setNewPrizeTier((current) => current ?? nextTiers[0]?.id ?? null)

    const stillEligible = nextRoster.find((child) => child.child_id === selectedChildId && child.remaining_spins > 0)
    const firstEligible = nextRoster.find((child) => child.remaining_spins > 0)
    setSelectedChildId(stillEligible?.child_id ?? firstEligible?.child_id ?? nextRoster[0]?.child_id ?? null)
    setLoading(false)
  }

  async function loadWins(childId: number) {
    const { data, error } = await supabase
      .from('prize_wins')
      .select('id, child_id, spin_number, prize_name_snapshot, category_name_snapshot, tier_name_snapshot, won_at')
      .eq('child_id', childId)
      .eq('month_start', monthStart(month))
      .order('spin_number', { ascending: true })

    if (error) setMessage(error.message)
    setWins((data ?? []) as Win[])
  }

  const selectedChild = useMemo(
    () => roster.find((child) => child.child_id === selectedChildId) ?? null,
    [roster, selectedChildId],
  )
  const category = useMemo(
    () => categories.find((item) => item.slug === selectedCategory) ?? categories[0] ?? null,
    [categories, selectedCategory],
  )
  const tierMinById = useMemo(() => new Map(tiers.map((tier) => [tier.id, tier.min_spins])), [tiers])
  const tierNameById = useMemo(() => new Map(tiers.map((tier) => [tier.id, tier.name])), [tiers])
  const categoryNameById = useMemo(() => new Map(categories.map((item) => [item.id, item.name])), [categories])
  const inventoryByPrize = useMemo(() => new Map(inventory.map((row) => [row.prize_id, row])), [inventory])

  const availablePrizes = useMemo(() => {
    if (!selectedChild || !category) return []
    return prizes
      .filter((prize) => prize.category_id === category.id)
      .filter((prize) => (tierMinById.get(prize.required_tier_id) ?? Number.MAX_SAFE_INTEGER) <= selectedChild.earned_spins)
      .map((prize) => ({ prize, inventory: inventoryByPrize.get(prize.id) }))
      .filter(({ inventory: row }) => Boolean(row?.enabled && Number(row.quantity_remaining) > 0 && Number(row.weight) > 0))
      .map(({ prize, inventory: row }) => ({ id: prize.id, name: prize.name, weight: Number(row?.weight ?? 1) }))
  }, [selectedChild, category, prizes, tierMinById, inventoryByPrize])

  const weightedGradient = useMemo(() => {
    if (!availablePrizes.length) return '#f2f4f7'
    const total = availablePrizes.reduce((sum, prize) => sum + prize.weight, 0)
    let cursor = 0
    const stops: string[] = []
    availablePrizes.forEach((prize, index) => {
      const start = cursor
      cursor += total ? (prize.weight / total) * 100 : 100 / availablePrizes.length
      stops.push(`${wheelColors[index % wheelColors.length]} ${start}% ${cursor}%`)
    })
    return `conic-gradient(${stops.join(', ')})`
  }, [availablePrizes])

  function targetRotationForPrize(prizeId: number) {
    const totalWeight = availablePrizes.reduce((sum, prize) => sum + prize.weight, 0)
    let cursor = 0
    let middle = 0
    for (const prize of availablePrizes) {
      const angle = totalWeight ? (prize.weight / totalWeight) * 360 : 360 / Math.max(availablePrizes.length, 1)
      if (prize.id === prizeId) middle = cursor + angle / 2
      cursor += angle
    }
    const current = ((rotation % 360) + 360) % 360
    const desired = ((360 - middle) % 360 + 360) % 360
    return rotation + 1440 + ((desired - current + 360) % 360)
  }

  async function spinReward() {
    if (!selectedChild || !category || spinning || selectedChild.remaining_spins <= 0 || availablePrizes.length === 0) return
    setMessage('')
    setResult(null)
    setSpinning(true)

    const { data, error } = await supabase.rpc('spin_reward_wheel', {
      p_child_id: selectedChild.child_id,
      p_month_start: monthStart(month),
      p_category_slug: category.slug,
    })

    if (error || !data?.length) {
      setSpinning(false)
      setMessage(error?.message ?? 'The reward could not be recorded. No spin was used.')
      return
    }

    const nextResult = data[0] as SpinResult
    setRotation(targetRotationForPrize(nextResult.prize_id))
    setResult(nextResult)

    window.setTimeout(async () => {
      setSpinning(false)
      await loadRewardData()
      await loadWins(selectedChild.child_id)
    }, 4200)
  }

  async function addPrize() {
    if (profile?.role !== 'admin' || !newPrizeName.trim() || !newPrizeCategory || !newPrizeTier) return
    setMessage('')
    const { data, error } = await supabase
      .from('wheel_prizes')
      .insert({ category_id: newPrizeCategory, name: newPrizeName.trim(), required_tier_id: newPrizeTier })
      .select('id')
      .single()
    if (error || !data) {
      setMessage(error?.message ?? 'Prize could not be added.')
      return
    }
    const quantity = Math.max(0, Math.floor(Number(newPrizeStock) || 0))
    const weight = Math.max(0.01, Number(newPrizeWeight) || 1)
    const inventoryResult = await supabase.from('wheel_inventory').insert({
      prize_id: data.id,
      month_start: monthStart(month),
      quantity_start: quantity,
      quantity_remaining: quantity,
      weight,
      enabled: quantity > 0,
    })
    if (inventoryResult.error) {
      setMessage(inventoryResult.error.message)
      return
    }
    setNewPrizeName('')
    setNewPrizeStock(1)
    setNewPrizeWeight(1)
    setMessage('Prize added to this month’s reward inventory.')
    await loadRewardData()
  }

  async function saveInventory(prizeId: number) {
    if (profile?.role !== 'admin') return
    const edit = inventoryEdits[prizeId] ?? { remaining: 0, weight: 1, enabled: false }
    const existing = inventoryByPrize.get(prizeId)
    const remaining = Math.max(0, Math.floor(Number(edit.remaining) || 0))
    const weight = Math.max(0.01, Number(edit.weight) || 1)
    const alreadyUsed = existing ? Math.max(0, Number(existing.quantity_start) - Number(existing.quantity_remaining)) : 0
    setSavingPrizeId(prizeId)
    setMessage('')

    const { error } = await supabase.from('wheel_inventory').upsert({
      prize_id: prizeId,
      month_start: monthStart(month),
      quantity_start: alreadyUsed + remaining,
      quantity_remaining: remaining,
      weight,
      enabled: edit.enabled && remaining > 0,
    }, { onConflict: 'prize_id,month_start' })

    setSavingPrizeId(null)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Inventory updated.')
    await loadRewardData()
  }

  function updateInventoryEdit(prizeId: number, patch: Partial<InventoryEdit>) {
    const existing = inventoryByPrize.get(prizeId)
    setInventoryEdits((current) => ({
      ...current,
      [prizeId]: {
        remaining: current[prizeId]?.remaining ?? Number(existing?.quantity_remaining ?? 0),
        weight: current[prizeId]?.weight ?? Number(existing?.weight ?? 1),
        enabled: current[prizeId]?.enabled ?? Boolean(existing?.enabled),
        ...patch,
      },
    }))
  }

  if (loading && !session) return <main className="login-wrap"><div className="card login-card">Loading Reward Center…</div></main>

  if (!session) {
    return <main className="login-wrap"><section className="card login-card"><h1>Reward Center</h1><p className="subtle">Sign in through Juanita Hub before opening monthly behavior rewards.</p><Link className="primary" style={{ display: 'inline-block', textDecoration: 'none' }} href="/">Go to sign in</Link></section></main>
  }

  if (!profile?.active) {
    return <main className="login-wrap"><section className="card login-card"><h1>Reward Center</h1><div className="notice">Your staff account must be approved before behavior rewards are available.</div><Link className="ghost" style={{ display: 'inline-block', textDecoration: 'none' }} href="/">Back to Juanita Hub</Link></section></main>
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Behavior Reward Center</small></div>
        <div className="toolbar"><Link className="ghost" style={{ textDecoration: 'none' }} href="/">Dashboard</Link></div>
      </header>

      <main className="main">
        <div className="hero">
          <div><h1>Reward Center</h1><p className="subtle">Earned monthly spins determine the tier. The unlocked tier stays available for the full reward session.</p></div>
          <label className="field" style={{ minWidth: 180, marginBottom: 0 }}><span style={{ fontWeight: 650 }}>Reward month</span><input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} /></label>
        </div>

        {message && <div className="notice">{message}</div>}

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(270px, 320px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          <aside className="card">
            <h2>Ready to reward</h2><p className="subtle">{monthLabel(month)}</p>
            <div className="field"><label>Child</label><select value={selectedChildId ?? ''} onChange={(event) => { setSelectedChildId(Number(event.target.value)); setResult(null) }}>{roster.map((child) => <option key={child.child_id} value={child.child_id}>{child.child_name} — {child.remaining_spins} remaining</option>)}</select></div>
            {selectedChild && <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>{[['Earned', selectedChild.earned_spins], ['Used', selectedChild.used_spins], ['Remaining', selectedChild.remaining_spins]].map(([label, value]) => <div key={String(label)} style={{ background: '#f8fafc', border: '1px solid #e4e7ec', borderRadius: 10, padding: 9, textAlign: 'center' }}><span className="subtle" style={{ display: 'block', fontSize: 11 }}>{label}</span><strong style={{ fontSize: 20 }}>{value}</strong></div>)}</div>}
            {selectedChild && <div className="notice" style={{ textAlign: 'center', marginTop: 0 }}><strong>{selectedChild.tier_name} tier unlocked</strong></div>}
            <h3>Choose category</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>{categories.map((item) => <button key={item.id} className={selectedCategory === item.slug ? 'primary' : 'ghost'} style={{ padding: '10px 5px' }} onClick={() => { setSelectedCategory(item.slug); setResult(null) }}>{item.slug === 'candy' ? '🍬' : item.slug === 'toys' ? '🧸' : '🍕'}<br />{item.name}</button>)}</div>
          </aside>

          <section className="card">
            <div className="section-heading"><div><h2>{category?.name ?? 'Reward'} wheel</h2><p className="subtle">Section sizes reflect your configured weights. Items with zero stock are excluded automatically.</p></div><span className="badge">{availablePrizes.length} available</span></div>
            <div style={{ position: 'relative', width: 'min(500px, 92%)', aspectRatio: '1', margin: '22px auto' }}>
              <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', zIndex: 2, fontSize: 34 }}>▼</div>
              <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: weightedGradient, border: '8px solid white', boxShadow: '0 4px 18px rgba(16,24,40,.16)', transform: `rotate(${rotation}deg)`, transition: 'transform 4s cubic-bezier(.12,.72,.15,1)', display: 'grid', placeItems: 'center' }}>
                <div style={{ width: 82, height: 82, borderRadius: '50%', background: '#111827', color: 'white', display: 'grid', placeItems: 'center', border: '5px solid white', fontWeight: 800 }}>REWARD</div>
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>{availablePrizes.map((prize, index) => <div key={prize.id} style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid #e4e7ec', borderRadius: 9, padding: 8 }}><span style={{ width: 13, height: 13, borderRadius: 99, background: wheelColors[index % wheelColors.length], flex: '0 0 auto' }} /><span><strong>{prize.name}</strong><br /><span className="subtle" style={{ fontSize: 12 }}>Weight {prize.weight}</span></span></div>)}</div>
            {result && !spinning && <div className="notice success" style={{ textAlign: 'center', fontSize: 18 }}>🎉 <strong>{selectedChild?.child_name} won {result.prize_name}!</strong></div>}
            <button className="primary" style={{ display: 'block', width: 'min(520px, 100%)', margin: '0 auto', padding: 14, fontSize: 17 }} disabled={spinning || !selectedChild || selectedChild.remaining_spins <= 0 || availablePrizes.length === 0} onClick={spinReward}>{spinning ? 'Selecting reward…' : selectedChild?.remaining_spins ? `SPIN • ${selectedChild.remaining_spins} remaining` : 'No spins remaining'}</button>
            {availablePrizes.length === 0 && <div className="notice">No eligible in-stock {category?.name.toLowerCase()} prizes are configured for this tier in {monthLabel(month)}.</div>}
          </section>
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <h2>{selectedChild?.child_name ?? 'Child'} reward history</h2><p className="subtle">Every completed reward is recorded automatically.</p>
          {wins.length === 0 ? <div className="empty">No rewards recorded for this child in {monthLabel(month)}.</div> : wins.map((win) => <div className="summary-row" key={win.id}><span><strong>Spin {win.spin_number}: {win.prize_name_snapshot}</strong><br /><span className="subtle">{win.category_name_snapshot} • {win.tier_name_snapshot}</span></span><span className="subtle">{new Date(win.won_at).toLocaleString()}</span></div>)}
        </section>

        {profile.role === 'admin' && (
          <details id="reward-setup" className="card" style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 20 }}>Admin: Monthly inventory & weights</summary>
            <p className="subtle" style={{ marginTop: 12 }}>Configure the physical prizes available for {monthLabel(month)}. Weight 1 is rare relative to weight 10. Disabling a prize removes it without deleting it.</p>

            <div className="card" style={{ boxShadow: 'none', marginBottom: 16 }}>
              <h3>Add a prize</h3>
              <div className="grid" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 10 }}>
                <div className="field"><label>Prize name</label><input value={newPrizeName} onChange={(event) => setNewPrizeName(event.target.value)} placeholder="Airheads" /></div>
                <div className="field"><label>Category</label><select value={newPrizeCategory ?? ''} onChange={(event) => setNewPrizeCategory(Number(event.target.value))}>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                <div className="field"><label>Minimum tier</label><select value={newPrizeTier ?? ''} onChange={(event) => setNewPrizeTier(Number(event.target.value))}>{tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name} ({tier.min_spins}+)</option>)}</select></div>
                <div className="field"><label>Stock</label><input type="number" min="0" step="1" value={newPrizeStock} onChange={(event) => setNewPrizeStock(Number(event.target.value))} /></div>
                <div className="field"><label>Weight</label><input type="number" min="0.01" step="0.25" value={newPrizeWeight} onChange={(event) => setNewPrizeWeight(Number(event.target.value))} /></div>
              </div>
              <button className="primary" onClick={addPrize}>Add to {monthLabel(month)}</button>
            </div>

            {categories.map((item) => (
              <section key={item.id} style={{ marginTop: 20 }}>
                <h3>{item.slug === 'candy' ? '🍬' : item.slug === 'toys' ? '🧸' : '🍕'} {item.name}</h3>
                {prizes.filter((prize) => prize.category_id === item.id).length === 0 && <div className="empty">No {item.name.toLowerCase()} prizes yet.</div>}
                {prizes.filter((prize) => prize.category_id === item.id).map((prize) => {
                  const row = inventoryByPrize.get(prize.id)
                  const edit = inventoryEdits[prize.id] ?? { remaining: Number(row?.quantity_remaining ?? 0), weight: Number(row?.weight ?? 1), enabled: Boolean(row?.enabled) }
                  return <div className="summary-row" key={prize.id} style={{ alignItems: 'end', flexWrap: 'wrap' }}><span style={{ minWidth: 180 }}><strong>{prize.name}</strong><br /><span className="subtle">{tierNameById.get(prize.required_tier_id)} tier • {row ? `${Number(row.quantity_start) - Number(row.quantity_remaining)} already given` : 'Not stocked this month'}</span></span><span className="toolbar"><label className="field" style={{ margin: 0, width: 90 }}><span>Remaining</span><input type="number" min="0" step="1" value={edit.remaining} onChange={(event) => updateInventoryEdit(prize.id, { remaining: Number(event.target.value) })} /></label><label className="field" style={{ margin: 0, width: 85 }}><span>Weight</span><input type="number" min="0.01" step="0.25" value={edit.weight} onChange={(event) => updateInventoryEdit(prize.id, { weight: Number(event.target.value) })} /></label><label style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 10 }}><input type="checkbox" checked={edit.enabled} onChange={(event) => updateInventoryEdit(prize.id, { enabled: event.target.checked })} /> Enabled</label><button className="ghost" disabled={savingPrizeId === prize.id} onClick={() => saveInventory(prize.id)}>{savingPrizeId === prize.id ? 'Saving…' : 'Save'}</button></span></div>
                })}
              </section>
            ))}
          </details>
        )}
      </main>
    </div>
  )
}
