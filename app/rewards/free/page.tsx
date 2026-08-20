'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type Child = { id: number; first_name: string; last_name: string | null; active: boolean }
type Category = { id: number; slug: string; name: string; display_order: number }
type Tier = { id: number; slug: string; name: string; min_spins: number; display_order: number }
type AvailablePrize = { inventory_id: number; prize_id: number; prize_name: string; required_tier_name: string; weight: number; quantity_remaining: number }
type FreeWin = { id: number; child_id: number; prize_name_snapshot: string; category_name_snapshot: string; tier_name_snapshot: string; reason: string | null; recorded_by: string; won_at: string }
type StaffDirectory = { user_id: string; display_name: string }
type SpinResult = { win_id: number; prize_id: number; prize_name: string; category_name: string; tier_name: string; quantity_remaining: number; won_at: string }

const wheelColors = ['#5b8def', '#28a745', '#e8b923', '#ef7d23', '#d64545', '#8b5cf6', '#0ea5a4', '#ec4899']

function localMonth() {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 7)
}
function monthStart(month: string) { return `${month}-01` }
function monthLabel(month: string) {
  const [year, number] = month.split('-').map(Number)
  return new Date(year, number - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
function childName(child: Child) { return `${child.first_name}${child.last_name ? ` ${child.last_name}` : ''}` }
function categoryIcon(slug: string) { return slug === 'candy' ? '🍬' : slug === 'toys' ? '🧸' : slug === 'food' ? '🍕' : '🎁' }

export default function FreeSpinsPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [month, setMonth] = useState(localMonth())
  const [children, setChildren] = useState<Child[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('candy')
  const [selectedTier, setSelectedTier] = useState('normal')
  const [reason, setReason] = useState('')
  const [availablePrizes, setAvailablePrizes] = useState<AvailablePrize[]>([])
  const [wins, setWins] = useState<FreeWin[]>([])
  const [staff, setStaff] = useState<StaffDirectory[]>([])
  const [loading, setLoading] = useState(true)
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [result, setResult] = useState<SpinResult | null>(null)
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<'info' | 'error' | 'success'>('info')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session) void loadBaseData() }, [session, month])
  useEffect(() => { if (session && selectedCategory && selectedTier) void loadAvailablePrizes() }, [session, selectedCategory, selectedTier])
  useEffect(() => {
    if (!session || !selectedChildId) return setWins([])
    void loadWins(selectedChildId)
  }, [session, month, selectedChildId])

  function showMessage(text: string, kind: 'info' | 'error' | 'success' = 'info') { setMessage(text); setMessageKind(kind) }

  async function loadBaseData() {
    if (!session) return
    setLoading(true)
    const [profileResult, childrenResult, categoryResult, tierResult, staffResult] = await Promise.all([
      supabase.from('staff_profiles').select('display_name, role, active').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('children').select('id, first_name, last_name, active').eq('active', true).order('first_name').order('last_name'),
      supabase.from('wheel_categories').select('id, slug, name, display_order').eq('active', true).order('display_order'),
      supabase.from('wheel_tiers').select('id, slug, name, min_spins, display_order').eq('active', true).order('display_order'),
      supabase.from('staff_profiles').select('user_id, display_name').eq('active', true),
    ])
    const error = profileResult.error || childrenResult.error || categoryResult.error || tierResult.error || staffResult.error
    if (error) showMessage(error.message, 'error')

    const nextChildren = (childrenResult.data ?? []) as Child[]
    const nextCategories = (categoryResult.data ?? []) as Category[]
    const nextTiers = (tierResult.data ?? []) as Tier[]
    setProfile(profileResult.data as Profile | null)
    setChildren(nextChildren)
    setCategories(nextCategories)
    setTiers(nextTiers)
    setStaff((staffResult.data ?? []) as StaffDirectory[])
    setSelectedChildId((current) => nextChildren.some((child) => child.id === current) ? current : nextChildren[0]?.id ?? null)
    setSelectedCategory((current) => nextCategories.some((item) => item.slug === current) ? current : nextCategories[0]?.slug ?? '')
    setSelectedTier((current) => nextTiers.some((tier) => tier.slug === current) ? current : nextTiers[0]?.slug ?? '')
    setLoading(false)
  }

  async function loadAvailablePrizes() {
    const { data, error } = await supabase.rpc('get_available_free_wheel', {
      p_month_start: monthStart(month),
      p_category_slug: selectedCategory,
      p_tier_slug: selectedTier,
    })
    if (error) { setAvailablePrizes([]); return showMessage(error.message, 'error') }
    setAvailablePrizes((data ?? []).map((row: AvailablePrize) => ({ ...row, weight: Number(row.weight), quantity_remaining: Number(row.quantity_remaining) })))
  }

  async function loadWins(childId: number) {
    const { data, error } = await supabase.from('free_prize_wins').select('id, child_id, prize_name_snapshot, category_name_snapshot, tier_name_snapshot, reason, recorded_by, won_at').eq('child_id', childId).eq('month_start', monthStart(month)).order('won_at', { ascending: false })
    if (error) showMessage(error.message, 'error')
    setWins((data ?? []) as FreeWin[])
  }

  const selectedChild = useMemo(() => children.find((child) => child.id === selectedChildId) ?? null, [children, selectedChildId])
  const selectedCategoryName = useMemo(() => categories.find((item) => item.slug === selectedCategory)?.name ?? 'Reward', [categories, selectedCategory])
  const selectedTierName = useMemo(() => tiers.find((tier) => tier.slug === selectedTier)?.name ?? 'Tier', [tiers, selectedTier])
  const staffNameById = useMemo(() => new Map(staff.map((member) => [member.user_id, member.display_name])), [staff])

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
      if (prize.prize_id === prizeId) middle = cursor + angle / 2
      cursor += angle
    }
    const current = ((rotation % 360) + 360) % 360
    const desired = ((360 - middle) % 360 + 360) % 360
    return rotation + 1440 + ((desired - current + 360) % 360)
  }

  async function spinFreeReward() {
    if (!selectedChild || !selectedCategory || !selectedTier || spinning || availablePrizes.length === 0) return
    setResult(null); setMessage(''); setSpinning(true)
    const { data, error } = await supabase.rpc('spin_free_reward_wheel', {
      p_child_id: selectedChild.id,
      p_month_start: monthStart(month),
      p_category_slug: selectedCategory,
      p_tier_slug: selectedTier,
      p_reason: reason.trim() || null,
    })
    if (error || !data?.length) { setSpinning(false); return showMessage(error?.message ?? 'The free spin could not be recorded.', 'error') }

    const nextResult = data[0] as SpinResult
    setRotation(targetRotationForPrize(nextResult.prize_id))
    setResult(nextResult)
    window.setTimeout(async () => {
      setSpinning(false); setReason('')
      await loadAvailablePrizes(); await loadWins(selectedChild.id)
      showMessage('Free spin recorded. Monthly earned spins were not changed.', 'success')
    }, 4200)
  }

  if (loading && !session) return <main className="login-wrap"><div className="card login-card">Loading Free Spins…</div></main>
  if (!session) return <main className="login-wrap"><section className="card login-card"><h1>Free Spins</h1><p className="subtle">Sign in through Juanita Hub before awarding a free reward spin.</p><Link className="primary" style={{ display: 'inline-block', textDecoration: 'none' }} href="/">Go to sign in</Link></section></main>
  if (!profile?.active) return <main className="login-wrap"><section className="card login-card"><h1>Free Spins</h1><div className="notice">Your staff account must be active before free spins are available.</div><Link className="ghost" style={{ display: 'inline-block', textDecoration: 'none' }} href="/">Back to Juanita Hub</Link></section></main>

  return (
    <div className="shell">
      <header className="topbar"><div className="brand">Juanita Hub<small>Free Reward Spins</small></div><div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span><Link className="ghost" style={{ textDecoration: 'none' }} href="/rewards">Reward Center</Link></div></header>
      <main className="main">
        <div className="hero">
          <div><h1>Free Spins</h1><p className="subtle">Award a bonus spin without using the child’s earned monthly spins. The same shared prize inventory is used automatically.</p></div>
          <label className="field" style={{ minWidth: 180, marginBottom: 0 }}><span style={{ fontWeight: 650 }}>Record under month</span><input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} /></label>
        </div>

        {message && <div className={`notice ${messageKind === 'error' ? 'error' : messageKind === 'success' ? 'success' : ''}`}>{message}</div>}
        <div className="notice" style={{ marginBottom: 16 }}><strong>Free spins do not reduce monthly spins.</strong> Selecting Premium includes Normal + Premium prizes; selecting Special includes Normal + Premium + Special prizes. All tiers pull from the shared inventory.</div>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          <aside className="card">
            <h2>Set up free spin</h2>
            <div className="field"><label>Child</label><select value={selectedChildId ?? ''} onChange={(event) => { setSelectedChildId(Number(event.target.value)); setResult(null) }}>{children.map((child) => <option key={child.id} value={child.id}>{childName(child)}</option>)}</select></div>
            <div className="field"><label>Allowed tier</label><select value={selectedTier} onChange={(event) => { setSelectedTier(event.target.value); setResult(null) }}>{tiers.map((tier) => <option key={tier.id} value={tier.slug}>{tier.name}</option>)}</select></div>
            <div className="notice" style={{ textAlign: 'center', marginTop: 0 }}><strong>{selectedTierName} wheel selected</strong></div>
            <h3>Choose category</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>{categories.map((item) => <button key={item.id} className={selectedCategory === item.slug ? 'primary' : 'ghost'} style={{ padding: '10px 5px' }} onClick={() => { setSelectedCategory(item.slug); setResult(null) }}>{categoryIcon(item.slug)}<br />{item.name}</button>)}</div>
            <div className="field" style={{ marginBottom: 0 }}><label>Reason <span className="subtle">(optional)</span></label><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Example: bonus activity" maxLength={200} /></div>
          </aside>

          <section className="card">
            <div className="section-heading"><div><h2>{selectedCategoryName} — {selectedTierName}</h2><p className="subtle">This wheel uses the same shared stock and weights as the monthly Reward Center.</p></div><span className="badge">{availablePrizes.length} available</span></div>
            <div style={{ position: 'relative', width: 'min(500px, 92%)', aspectRatio: '1', margin: '22px auto' }}><div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', zIndex: 2, fontSize: 34 }}>▼</div><div style={{ width: '100%', height: '100%', borderRadius: '50%', background: weightedGradient, border: '8px solid white', boxShadow: '0 4px 18px rgba(16,24,40,.16)', transform: `rotate(${rotation}deg)`, transition: 'transform 4s cubic-bezier(.12,.72,.15,1)', display: 'grid', placeItems: 'center' }}><div style={{ width: 86, height: 86, borderRadius: '50%', background: '#111827', color: 'white', display: 'grid', placeItems: 'center', border: '5px solid white', fontWeight: 800, textAlign: 'center', fontSize: 13 }}>FREE<br />SPIN</div></div></div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 8, marginBottom: 14 }}>{availablePrizes.map((prize, index) => <div key={prize.prize_id} style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid #e4e7ec', borderRadius: 9, padding: 8 }}><span style={{ width: 13, height: 13, borderRadius: 99, background: wheelColors[index % wheelColors.length], flex: '0 0 auto' }} /><span><strong>{prize.prize_name}</strong><br /><span className="subtle" style={{ fontSize: 12 }}>{prize.required_tier_name} • stock {prize.quantity_remaining} • weight {prize.weight}</span></span></div>)}</div>

            {result && !spinning && <div className="notice success" style={{ textAlign: 'center', fontSize: 18 }}>🎉 <strong>{selectedChild ? childName(selectedChild) : 'Child'} won {result.prize_name}!</strong></div>}
            <button className="primary" style={{ display: 'block', width: 'min(520px, 100%)', margin: '0 auto', padding: 14, fontSize: 17 }} disabled={spinning || !selectedChild || availablePrizes.length === 0} onClick={spinFreeReward}>{spinning ? 'Selecting free reward…' : `FREE SPIN • ${selectedTierName}`}</button>
            {availablePrizes.length === 0 && <div className="notice">No eligible in-stock {selectedCategoryName.toLowerCase()} prizes are available for the {selectedTierName} wheel in shared inventory.</div>}
          </section>
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <div className="section-heading"><div><h2>{selectedChild ? childName(selectedChild) : 'Child'} free-spin history</h2><p className="subtle">Showing free spins recorded under {monthLabel(month)}. These are separate from earned monthly spins but use the same shared prize inventory.</p></div><span className="badge">{wins.length} free {wins.length === 1 ? 'spin' : 'spins'}</span></div>
          {wins.length === 0 ? <div className="empty">No free spins recorded for this child in {monthLabel(month)}.</div> : wins.map((win) => <div className="summary-row" key={win.id}><span><strong>Free Spin: {win.prize_name_snapshot}</strong><br /><span className="subtle">{win.category_name_snapshot} • {win.tier_name_snapshot}{win.reason ? ` • ${win.reason}` : ''}</span></span><span className="subtle" style={{ textAlign: 'right' }}>{new Date(win.won_at).toLocaleString()}<br />{staffNameById.get(win.recorded_by) ?? 'Staff'}</span></div>)}
        </section>
      </main>
    </div>
  )
}
