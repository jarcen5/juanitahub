'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import RewardWheel from '@/components/RewardWheel'
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
type Inventory = { prize_id: number; quantity_remaining: number; weight: number; enabled: boolean }
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
  const [wins, setWins] = useState<Win[]>([])
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('candy')
  const [loading, setLoading] = useState(true)
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [result, setResult] = useState<SpinResult | null>(null)
  const [message, setMessage] = useState('')

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
      supabase.from('wheel_inventory').select('prize_id, quantity_remaining, weight, enabled').eq('month_start', start),
    ])

    const error = profileResult.error || rosterResult.error || categoryResult.error || tierResult.error || prizeResult.error || inventoryResult.error
    if (error) setMessage(error.message)

    const nextProfile = profileResult.data as Profile | null
    const nextRoster = (rosterResult.data ?? []) as RewardChild[]
    setProfile(nextProfile)
    setRoster(nextRoster)
    setCategories((categoryResult.data ?? []) as Category[])
    setTiers((tierResult.data ?? []) as Tier[])
    setPrizes((prizeResult.data ?? []) as Prize[])
    setInventory((inventoryResult.data ?? []) as Inventory[])

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
    const adjustment = (desired - current + 360) % 360
    return rotation + 1440 + adjustment
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

  if (loading && !session) {
    return <main className="login-wrap"><div className="card login-card">Loading Reward Center…</div></main>
  }

  if (!session) {
    return (
      <main className="login-wrap">
        <section className="card login-card">
          <h1>Reward Center</h1>
          <p className="subtle">Sign in through Juanita Hub before opening monthly behavior rewards.</p>
          <Link className="primary link-button" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  if (!profile?.active) {
    return (
      <main className="login-wrap">
        <section className="card login-card">
          <h1>Reward Center</h1>
          <div className="notice">Your staff account must be approved before behavior rewards are available.</div>
          <Link className="ghost link-button" href="/">Back to Juanita Hub</Link>
        </section>
      </main>
    )
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Behavior Reward Center</small></div>
        <div className="toolbar">
          {profile.role === 'admin' && <Link className="ghost link-button" href="/rewards/setup">Wheel setup</Link>}
          <Link className="ghost link-button" href="/">Dashboard</Link>
        </div>
      </header>

      <main className="main reward-main">
        <div className="hero">
          <div>
            <h1>Reward Center</h1>
            <p className="subtle">Choose a child and reward category. The recorded monthly points determine earned spins and the unlocked tier.</p>
          </div>
          <label className="month-control-standalone">
            <span>Reward month</span>
            <input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} />
          </label>
        </div>

        {message && <div className="notice error">{message}</div>}

        <section className="reward-layout">
          <aside className="card reward-sidebar">
            <h2>Ready to reward</h2>
            <p className="subtle">{monthLabel(month)}</p>
            <div className="field">
              <label>Child</label>
              <select value={selectedChildId ?? ''} onChange={(event) => { setSelectedChildId(Number(event.target.value)); setResult(null) }}>
                {roster.map((child) => (
                  <option key={child.child_id} value={child.child_id}>
                    {child.child_name} — {child.remaining_spins} remaining
                  </option>
                ))}
              </select>
            </div>

            {selectedChild && (
              <div className="reward-child-stats">
                <div><span>Earned</span><strong>{selectedChild.earned_spins}</strong></div>
                <div><span>Used</span><strong>{selectedChild.used_spins}</strong></div>
                <div><span>Remaining</span><strong>{selectedChild.remaining_spins}</strong></div>
              </div>
            )}

            {selectedChild && <div className={`reward-tier-badge tier-${selectedChild.tier_slug}`}>{selectedChild.tier_name} tier unlocked</div>}

            <h3>Choose category</h3>
            <div className="reward-category-grid">
              {categories.map((item) => (
                <button
                  key={item.id}
                  className={`reward-category-button ${selectedCategory === item.slug ? 'selected' : ''}`}
                  onClick={() => { setSelectedCategory(item.slug); setResult(null) }}
                >
                  <span>{item.slug === 'candy' ? '🍬' : item.slug === 'toys' ? '🧸' : '🍕'}</span>
                  {item.name}
                </button>
              ))}
            </div>
          </aside>

          <section className="card reward-wheel-card">
            <div className="section-heading">
              <div>
                <h2>{category?.name ?? 'Reward'} selection</h2>
                <p className="subtle">The size of each section reflects its configured weight. Out-of-stock items are automatically excluded.</p>
              </div>
              <span className="badge">{availablePrizes.length} available</span>
            </div>

            <RewardWheel prizes={availablePrizes} rotation={rotation} spinning={spinning} resultName={result?.prize_name ?? null} />

            <button
              className="primary reward-spin-button"
              disabled={spinning || !selectedChild || selectedChild.remaining_spins <= 0 || availablePrizes.length === 0}
              onClick={spinReward}
            >
              {spinning ? 'Selecting reward…' : selectedChild?.remaining_spins ? `Select reward • ${selectedChild.remaining_spins} spin${selectedChild.remaining_spins === 1 ? '' : 's'} left` : 'No spins remaining'}
            </button>

            {availablePrizes.length === 0 && (
              <div className="notice">No eligible in-stock {category?.name.toLowerCase()} prizes are configured for this child's tier in {monthLabel(month)}.</div>
            )}
          </section>
        </section>

        <section className="card reward-history-card">
          <div className="section-heading">
            <div>
              <h2>{selectedChild?.child_name ?? 'Child'} reward history</h2>
              <p className="subtle">Every completed selection is recorded automatically.</p>
            </div>
          </div>
          {wins.length === 0 ? (
            <div className="empty">No rewards have been recorded for this child in {monthLabel(month)}.</div>
          ) : (
            wins.map((win) => (
              <div className="summary-row" key={win.id}>
                <span><strong>Spin {win.spin_number}: {win.prize_name_snapshot}</strong><br /><span className="subtle">{win.category_name_snapshot} • {win.tier_name_snapshot}</span></span>
                <span className="subtle">{new Date(win.won_at).toLocaleString()}</span>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  )
}
