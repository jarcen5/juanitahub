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
type Stock = { id: number; prize_id: number; quantity_start: number; quantity_remaining: number; weight: number; enabled: boolean }
type StockEdit = { remaining: number; weight: number; enabled: boolean }
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
  const [rewardMonth, setRewardMonth] = useState(localMonth())
  const [roster, setRoster] = useState<RewardChild[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [stock, setStock] = useState<Stock[]>([])
  const [stockEdits, setStockEdits] = useState<Record<number, StockEdit>>({})
  const [wins, setWins] = useState<Win[]>([])
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('candy')
  const [loading, setLoading] = useState(true)
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [result, setResult] = useState<SpinResult | null>(null)
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<'info' | 'error' | 'success'>('info')
  const [newPrizeName, setNewPrizeName] = useState('')
  const [newPrizeCategory, setNewPrizeCategory] = useState<number | null>(null)
  const [newPrizeTier, setNewPrizeTier] = useState<number | null>(null)
  const [newPrizeStock, setNewPrizeStock] = useState(1)
  const [newPrizeWeight, setNewPrizeWeight] = useState(1)
  const [addingPrize, setAddingPrize] = useState(false)
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
    setResult(null)
    void loadRewardData()
  }, [session, rewardMonth])

  useEffect(() => {
    if (!session || !selectedChildId) {
      setWins([])
      return
    }
    void loadWins(selectedChildId)
  }, [session, selectedChildId, rewardMonth])

  function showMessage(text: string, kind: 'info' | 'error' | 'success' = 'info') {
    setMessage(text)
    setMessageKind(kind)
  }

  async function loadRewardData() {
    if (!session) return
    setLoading(true)

    const [profileResult, rosterResult, categoryResult, tierResult, prizeResult, stockResult] = await Promise.all([
      supabase.from('staff_profiles').select('display_name, role, active').eq('user_id', session.user.id).maybeSingle(),
      supabase.rpc('get_reward_roster', { p_month_start: monthStart(rewardMonth) }),
      supabase.from('wheel_categories').select('id, slug, name, display_order').eq('active', true).order('display_order'),
      supabase.from('wheel_tiers').select('id, slug, name, min_spins, display_order').eq('active', true).order('display_order'),
      supabase.from('wheel_prizes').select('id, category_id, name, required_tier_id, active').eq('active', true).order('name'),
      supabase.from('wheel_stock').select('id, prize_id, quantity_start, quantity_remaining, weight, enabled'),
    ])

    const error = profileResult.error || rosterResult.error || categoryResult.error || tierResult.error || prizeResult.error || stockResult.error
    if (error) showMessage(error.message, 'error')

    const nextRoster = (rosterResult.data ?? []) as RewardChild[]
    const nextCategories = (categoryResult.data ?? []) as Category[]
    const nextTiers = (tierResult.data ?? []) as Tier[]
    const nextStock = (stockResult.data ?? []) as Stock[]

    setProfile(profileResult.data as Profile | null)
    setRoster(nextRoster)
    setCategories(nextCategories)
    setTiers(nextTiers)
    setPrizes((prizeResult.data ?? []) as Prize[])
    setStock(nextStock)
    setStockEdits(Object.fromEntries(nextStock.map((row) => [row.prize_id, {
      remaining: Number(row.quantity_remaining),
      weight: Number(row.weight),
      enabled: row.enabled,
    }])))
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
      .eq('month_start', monthStart(rewardMonth))
      .order('spin_number', { ascending: true })

    if (error) showMessage(error.message, 'error')
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
  const stockByPrize = useMemo(() => new Map(stock.map((row) => [row.prize_id, row])), [stock])

  const availablePrizes = useMemo(() => {
    if (!selectedChild || !category) return []
    return prizes
      .filter((prize) => prize.category_id === category.id)
      .filter((prize) => (tierMinById.get(prize.required_tier_id) ?? Number.MAX_SAFE_INTEGER) <= selectedChild.earned_spins)
      .map((prize) => ({ prize, stock: stockByPrize.get(prize.id) }))
      .filter(({ stock: row }) => Boolean(row?.enabled && Number(row.quantity_remaining) > 0 && Number(row.weight) > 0))
      .map(({ prize, stock: row }) => ({ id: prize.id, name: prize.name, weight: Number(row?.weight ?? 1) }))
  }, [selectedChild, category, prizes, tierMinById, stockByPrize])

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

    const { data, error } = await supabase.rpc('spin_monthly_reward_wheel', {
      p_child_id: selectedChild.child_id,
      p_reward_month_start: monthStart(rewardMonth),
      p_category_slug: category.slug,
    })

    if (error || !data?.length) {
      setSpinning(false)
      showMessage(error?.message ?? 'The reward could not be recorded. No spin was used.', 'error')
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
    if (profile?.role !== 'admin') return
    if (!newPrizeName.trim()) return showMessage('Enter a prize name first.', 'error')
    if (!newPrizeCategory || !newPrizeTier) return showMessage('Choose a category and minimum tier.', 'error')

    setAddingPrize(true)
    const { error } = await supabase.rpc('add_reward_prize_with_inventory', {
      p_name: newPrizeName.trim(),
      p_category_id: newPrizeCategory,
      p_tier_id: newPrizeTier,
      p_month_start: monthStart(localMonth()),
      p_quantity: Math.max(0, Math.floor(Number(newPrizeStock) || 0)),
      p_weight: Math.max(0.01, Number(newPrizeWeight) || 1),
    })
    setAddingPrize(false)

    if (error) return showMessage(error.message, 'error')
    setNewPrizeName('')
    setNewPrizeStock(1)
    setNewPrizeWeight(1)
    showMessage('Prize added to the shared inventory.', 'success')
    await loadRewardData()
  }

  async function saveStock(prizeId: number) {
    if (profile?.role !== 'admin') return
    const edit = stockEdits[prizeId] ?? { remaining: 0, weight: 1, enabled: false }
    const existing = stockByPrize.get(prizeId)
    const remaining = Math.max(0, Math.floor(Number(edit.remaining) || 0))
    const weight = Math.max(0.01, Number(edit.weight) || 1)
    const alreadyUsed = existing ? Math.max(0, Number(existing.quantity_start) - Number(existing.quantity_remaining)) : 0
    setSavingPrizeId(prizeId)

    const { error } = await supabase.from('wheel_stock').upsert({
      prize_id: prizeId,
      quantity_start: alreadyUsed + remaining,
      quantity_remaining: remaining,
      weight,
      enabled: edit.enabled && remaining > 0,
    }, { onConflict: 'prize_id' })

    setSavingPrizeId(null)
    if (error) return showMessage(error.message, 'error')
    showMessage('Shared inventory updated.', 'success')
    await loadRewardData()
  }

  function updateStockEdit(prizeId: number, patch: Partial<StockEdit>) {
    const existing = stockByPrize.get(prizeId)
    setStockEdits((current) => ({
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
        <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span><Link className="ghost" style={{ textDecoration: 'none' }} href="/">Dashboard</Link></div>
      </header>

      <main className="main">
        <div className="hero" style={{ alignItems: 'end' }}>
          <div><h1>Reward Center</h1><p className="subtle">Choose the month the spins were earned. Every month uses the same shared prize inventory.</p></div>
          <label className="field" style={{ minWidth: 190, marginBottom: 0 }}>
            <span style={{ fontWeight: 700 }}>Spins earned in</span>
            <input type="month" value={rewardMonth} onChange={(event) => event.target.value && setRewardMonth(event.target.value)} />
          </label>
        </div>

        <div className="notice" style={{ marginBottom: 16 }}><strong>Shared inventory:</strong> July, August, future monthly spins, and Free Spins all deduct prizes from this same stock list.</div>
        {message && <div className={`notice ${messageKind === 'error' ? 'error' : messageKind === 'success' ? 'success' : ''}`}>{message}</div>}

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(270px, 320px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          <aside className="card">
            <h2>Ready to reward</h2>
            <p className="subtle"><strong>{monthLabel(rewardMonth)}</strong> spins • Shared inventory</p>
            <div className="field"><label>Child</label><select value={selectedChildId ?? ''} onChange={(event) => { setSelectedChildId(Number(event.target.value)); setResult(null) }}>{roster.map((child) => <option key={child.child_id} value={child.child_id}>{child.child_name} — {child.remaining_spins} remaining</option>)}</select></div>

            {selectedChild && <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>{[['Earned', selectedChild.earned_spins], ['Used', selectedChild.used_spins], ['Remaining', selectedChild.remaining_spins]].map(([label, value]) => <div key={String(label)} style={{ background: '#f8fafc', border: '1px solid #e4e7ec', borderRadius: 10, padding: 9, textAlign: 'center' }}><span className="subtle" style={{ display: 'block', fontSize: 11 }}>{label}</span><strong style={{ fontSize: 20 }}>{value}</strong></div>)}</div>}
            {selectedChild && <div className="notice" style={{ textAlign: 'center', marginTop: 0 }}><strong>{selectedChild.tier_name} tier unlocked</strong></div>}

            <h3>Choose category</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>{categories.map((item) => <button key={item.id} className={selectedCategory === item.slug ? 'primary' : 'ghost'} style={{ padding: '10px 5px' }} onClick={() => { setSelectedCategory(item.slug); setResult(null) }}>{item.slug === 'candy' ? '🍬' : item.slug === 'toys' ? '🧸' : '🍕'}<br />{item.name}</button>)}</div>
          </aside>

          <section className="card">
            <div className="section-heading"><div><h2>{category?.name ?? 'Reward'} wheel</h2><p className="subtle">Prize eligibility comes from the {monthLabel(rewardMonth)} tier. Stock and weights come from the shared inventory.</p></div><span className="badge">{availablePrizes.length} available</span></div>

            <div style={{ position: 'relative', width: 'min(500px, 92%)', aspectRatio: '1', margin: '22px auto' }}>
              <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', zIndex: 2, fontSize: 34 }}>▼</div>
              <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: weightedGradient, border: '8px solid white', boxShadow: '0 4px 18px rgba(16,24,40,.16)', transform: `rotate(${rotation}deg)`, transition: 'transform 4s cubic-bezier(.12,.72,.15,1)', display: 'grid', placeItems: 'center' }}><div style={{ width: 82, height: 82, borderRadius: '50%', background: '#111827', color: 'white', display: 'grid', placeItems: 'center', border: '5px solid white', fontWeight: 800 }}>REWARD</div></div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>{availablePrizes.map((prize, index) => <div key={prize.id} style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid #e4e7ec', borderRadius: 9, padding: 8 }}><span style={{ width: 13, height: 13, borderRadius: 99, background: wheelColors[index % wheelColors.length], flex: '0 0 auto' }} /><span><strong>{prize.name}</strong><br /><span className="subtle" style={{ fontSize: 12 }}>Weight {prize.weight}</span></span></div>)}</div>

            {result && !spinning && <div className="notice success" style={{ textAlign: 'center', fontSize: 18 }}>🎉 <strong>{selectedChild?.child_name} won {result.prize_name}!</strong><br /><span style={{ fontSize: 13 }}>{monthLabel(rewardMonth)} reward • Shared inventory</span></div>}

            <button className="primary" style={{ display: 'block', width: 'min(520px, 100%)', margin: '0 auto', padding: 14, fontSize: 17 }} disabled={spinning || !selectedChild || selectedChild.remaining_spins <= 0 || availablePrizes.length === 0} onClick={spinReward}>{spinning ? 'Selecting reward…' : selectedChild?.remaining_spins ? `SPIN FOR ${monthLabel(rewardMonth).toUpperCase()} • ${selectedChild.remaining_spins} remaining` : `No ${monthLabel(rewardMonth)} spins remaining`}</button>
            {availablePrizes.length === 0 && <div className="notice">No eligible in-stock {category?.name.toLowerCase()} prizes are available in the shared inventory for this tier.</div>}
          </section>
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <h2>{selectedChild?.child_name ?? 'Child'} — {monthLabel(rewardMonth)} reward history</h2>
          <p className="subtle">Each completed spin is charged only to the selected earned-spin month and deducts from the shared inventory.</p>
          {wins.length === 0 ? <div className="empty">No monthly rewards recorded for this child for {monthLabel(rewardMonth)}.</div> : wins.map((win) => <div className="summary-row" key={win.id}><span><strong>Spin {win.spin_number}: {win.prize_name_snapshot}</strong><br /><span className="subtle">{win.category_name_snapshot} • {win.tier_name_snapshot}</span></span><span className="subtle">{new Date(win.won_at).toLocaleString()}</span></div>)}
        </section>

        {profile.role === 'admin' && (
          <details open id="reward-setup" className="card" style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 20 }}>Admin: Shared inventory & weights</summary>
            <p className="subtle" style={{ marginTop: 12 }}>This is the one physical prize inventory used by every monthly reward and every Free Spin.</p>

            <section style={{ border: '1px solid #e4e7ec', borderRadius: 14, padding: 16, marginBottom: 16, background: '#f8fafc' }}>
              <h3>Add a prize</h3>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <div className="field" style={{ minWidth: 210 }}><label>Prize name</label><input value={newPrizeName} onChange={(event) => setNewPrizeName(event.target.value)} placeholder="Example: Airheads" /></div>
                <div className="field"><label>Category</label><select value={newPrizeCategory ?? ''} onChange={(event) => setNewPrizeCategory(Number(event.target.value))}>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                <div className="field"><label>Minimum tier</label><select value={newPrizeTier ?? ''} onChange={(event) => setNewPrizeTier(Number(event.target.value))}>{tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name} ({tier.min_spins}+ spins)</option>)}</select></div>
                <div className="field"><label>Stock</label><input type="number" min="0" step="1" value={newPrizeStock} onChange={(event) => setNewPrizeStock(Number(event.target.value))} /></div>
                <div className="field"><label>Weight</label><input type="number" min="0.01" step="0.25" value={newPrizeWeight} onChange={(event) => setNewPrizeWeight(Number(event.target.value))} /></div>
              </div>
              <button className="primary" disabled={addingPrize || !newPrizeName.trim()} onClick={addPrize}>{addingPrize ? 'Adding prize…' : 'Add prize to shared inventory'}</button>
            </section>

            {categories.map((item) => (
              <section key={item.id} style={{ marginTop: 20 }}>
                <h3>{item.slug === 'candy' ? '🍬' : item.slug === 'toys' ? '🧸' : '🍕'} {item.name}</h3>
                {prizes.filter((prize) => prize.category_id === item.id).length === 0 && <div className="empty">No {item.name.toLowerCase()} prizes yet.</div>}
                {prizes.filter((prize) => prize.category_id === item.id).map((prize) => {
                  const row = stockByPrize.get(prize.id)
                  const edit = stockEdits[prize.id] ?? { remaining: Number(row?.quantity_remaining ?? 0), weight: Number(row?.weight ?? 1), enabled: Boolean(row?.enabled) }
                  return <div className="summary-row" key={prize.id} style={{ alignItems: 'end', flexWrap: 'wrap' }}><span style={{ minWidth: 180 }}><strong>{prize.name}</strong><br /><span className="subtle">{tierNameById.get(prize.required_tier_id)} tier • {row ? `${Number(row.quantity_start) - Number(row.quantity_remaining)} already given` : 'Not stocked'}</span></span><span className="toolbar"><label className="field" style={{ margin: 0, width: 90 }}><span>Remaining</span><input type="number" min="0" step="1" value={edit.remaining} onChange={(event) => updateStockEdit(prize.id, { remaining: Number(event.target.value) })} /></label><label className="field" style={{ margin: 0, width: 85 }}><span>Weight</span><input type="number" min="0.01" step="0.25" value={edit.weight} onChange={(event) => updateStockEdit(prize.id, { weight: Number(event.target.value) })} /></label><label style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 10 }}><input type="checkbox" checked={edit.enabled} onChange={(event) => updateStockEdit(prize.id, { enabled: event.target.checked })} /> Enabled</label><button className="ghost" disabled={savingPrizeId === prize.id} onClick={() => saveStock(prize.id)}>{savingPrizeId === prize.id ? 'Saving…' : 'Save'}</button></span></div>
                })}
              </section>
            ))}
          </details>
        )}
      </main>
    </div>
  )
}
