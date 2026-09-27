'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import RewardWheel, { type WheelPrize } from '@/components/RewardWheel'

type Profile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type Category = { id: number; slug: string; name: string; display_order: number }
type Tier = { id: number; slug: string; name: string; min_spins: number; display_order: number }
type Prize = { id: number; category_id: number; name: string; required_tier_id: number; active: boolean }
type Stock = { id?: number; prize_id: number; quantity_start: number; quantity_remaining: number; weight: number; enabled: boolean }
type RewardChild = {
  child_id: number; child_name: string; child_active: boolean; earned_spins: number; used_spins: number;
  remaining_spins: number; tier_id: number; tier_slug: string; tier_name: string
}
type Child = { id: number; first_name: string; last_name: string | null; active: boolean }
type MonthlyWin = {
  id: number; child_id: number; spin_number: number; prize_name_snapshot: string;
  category_name_snapshot: string; tier_name_snapshot: string; won_at: string
}
type FreeWin = {
  id: number; child_id: number; prize_name_snapshot: string; category_name_snapshot: string;
  tier_name_snapshot: string; reason: string | null; recorded_by: string; won_at: string
}
type StaffDirectory = { user_id: string; display_name: string }
type FreeAvailable = {
  inventory_id: number; prize_id: number; prize_name: string; required_tier_name: string;
  weight: number; quantity_remaining: number
}
type MonthlySpinResult = {
  win_id: number; prize_id: number; prize_name: string; category_name: string; tier_name: string;
  earned_spins: number; used_spins: number; remaining_spins: number; quantity_remaining: number
}
type FreeSpinResult = {
  win_id: number; prize_id: number; prize_name: string; category_name: string;
  tier_name: string; quantity_remaining: number; won_at: string
}
type FulfillmentRow = {
  source: 'monthly' | 'free'; win_id: number; child_id: number; first_name: string; last_name: string | null;
  month_start: string; prize_name: string; category_name: string; tier_name: string; reason: string | null;
  won_at: string; received_at: string | null; received_by: string | null
}
type RewardTab = 'monthly' | 'free' | 'test' | 'setup' | 'fulfillment'
type MessageKind = 'info' | 'error' | 'success'

function localMonth() {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 7)
}
function previousMonth() {
  const now = new Date()
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return previous.getFullYear() + '-' + String(previous.getMonth() + 1).padStart(2, '0')
}
function monthStart(month: string) { return month + '-01' }
function monthLabel(month: string) {
  const parts = month.split('-').map(Number)
  return new Date(parts[0], parts[1] - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
function childName(child: Child) { return child.first_name + (child.last_name ? ' ' + child.last_name : '') }
function categoryIcon(slug: string) {
  if (slug === 'candy') return '🍬'
  if (slug === 'toys') return '🧸'
  if (slug === 'food') return '🍕'
  return '🎁'
}
function targetRotationForPrize(prizeId: number, prizes: WheelPrize[], rotation: number) {
  const total = prizes.reduce((sum, prize) => sum + Math.max(0, Number(prize.weight)), 0)
  let cursor = 0
  let middle = 0
  for (const prize of prizes) {
    const angle = total > 0 ? (Number(prize.weight) / total) * 360 : 360 / Math.max(prizes.length, 1)
    if (prize.id === prizeId) middle = cursor + angle / 2
    cursor += angle
  }
  const current = ((rotation % 360) + 360) % 360
  const desired = ((360 - middle) % 360 + 360) % 360
  return rotation + 1440 + ((desired - current + 360) % 360)
}
function weightedPick(prizes: WheelPrize[]) {
  const total = prizes.reduce((sum, prize) => sum + Math.max(0, Number(prize.weight)), 0)
  if (total <= 0) return null
  let target = Math.random() * total
  for (const prize of prizes) {
    target -= Math.max(0, Number(prize.weight))
    if (target <= 0) return prize
  }
  return prizes[prizes.length - 1] ?? null
}
function noticeClass(kind: MessageKind) {
  return 'notice ' + (kind === 'error' ? 'error' : kind === 'success' ? 'success' : '')
}

export default function RewardsPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const searchParams = useSearchParams()

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    void loadProfile()
  }, [session])

  async function loadProfile() {
    if (!session) return
    setLoading(true)
    const { data, error } = await supabase.from('staff_profiles').select('display_name, role, active').eq('user_id', session.user.id).maybeSingle()
    setProfile(data as Profile | null)
    setMessage(error?.message ?? '')
    setLoading(false)
  }

  if (loading && !session) return <main className="login-wrap"><div className="card login-card">Loading Reward Center…</div></main>
  if (!session) return <main className="login-wrap"><section className="card login-card"><h1>Reward Center</h1><p className="subtle">Sign in through Juanita Hub before opening rewards.</p><Link className="primary" style={{ display: 'inline-block', textDecoration: 'none' }} href="/">Go to sign in</Link></section></main>
  if (!profile?.active) return <main className="login-wrap"><section className="card login-card"><h1>Reward Center</h1><div className="notice">Your staff account must be approved before rewards are available.</div><Link className="ghost" style={{ display: 'inline-block', textDecoration: 'none' }} href="/">Back to Juanita Hub</Link></section></main>

  const requestedTab = searchParams.get('tab')
  const validTabs: RewardTab[] = ['monthly', 'free', 'test', 'setup', 'fulfillment']
  let tab: RewardTab = validTabs.includes(requestedTab as RewardTab) ? requestedTab as RewardTab : 'monthly'
  if (tab === 'setup' && profile.role !== 'admin') tab = 'monthly'

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Reward Center</small></div>
        <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div>
      </header>

      <main className="main rewards-workspace">
        <section className="rewards-hero">
          <div><span className="rewards-kicker">Rewards</span><h1>Reward Center</h1><p>Monthly spins, bonus spins, live prize chances, testing, inventory, and prize handoff now live in one workspace.</p></div>
        </section>

        {message && <div className="notice error">{message}</div>}

        {tab === 'monthly' && <MonthlySpinsPanel session={session} />}
        {tab === 'free' && <FreeSpinsPanel session={session} />}
        {tab === 'test' && <TestWheelPanel />}
        {tab === 'setup' && profile.role === 'admin' && <PrizeSetupPanel />}
        {tab === 'fulfillment' && <FulfillmentPanel session={session} />}
      </main>
    </div>
  )
}

function MonthlySpinsPanel({ session }: { session: Session }) {
  const [month, setMonth] = useState(localMonth())
  const [roster, setRoster] = useState<RewardChild[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [stock, setStock] = useState<Stock[]>([])
  const [wins, setWins] = useState<MonthlyWin[]>([])
  const [childId, setChildId] = useState<number | null>(null)
  const [categorySlug, setCategorySlug] = useState('candy')
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<MonthlySpinResult | null>(null)
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<MessageKind>('info')
  const [loading, setLoading] = useState(true)

  useEffect(() => { void loadData() }, [month])
  useEffect(() => { if (childId) void loadWins(childId); else setWins([]) }, [childId, month])

  function showMessage(text: string, kind: MessageKind = 'info') { setMessage(text); setMessageKind(kind) }

  async function loadData() {
    setLoading(true)
    const [rosterResult, categoryResult, tierResult, prizeResult, stockResult] = await Promise.all([
      supabase.rpc('get_reward_roster', { p_month_start: monthStart(month) }),
      supabase.from('wheel_categories').select('id, slug, name, display_order').eq('active', true).order('display_order'),
      supabase.from('wheel_tiers').select('id, slug, name, min_spins, display_order').eq('active', true).order('display_order'),
      supabase.from('wheel_prizes').select('id, category_id, name, required_tier_id, active').eq('active', true).order('name'),
      supabase.from('wheel_stock').select('id, prize_id, quantity_start, quantity_remaining, weight, enabled'),
    ])
    const error = rosterResult.error || categoryResult.error || tierResult.error || prizeResult.error || stockResult.error
    if (error) showMessage(error.message, 'error')
    const nextRoster = (rosterResult.data ?? []) as RewardChild[]
    const nextCategories = (categoryResult.data ?? []) as Category[]
    setRoster(nextRoster)
    setCategories(nextCategories)
    setTiers((tierResult.data ?? []) as Tier[])
    setPrizes((prizeResult.data ?? []) as Prize[])
    setStock(((stockResult.data ?? []) as Stock[]).map((row) => ({ ...row, weight: Number(row.weight) })))
    setChildId((current) => nextRoster.some((child) => child.child_id === current) ? current : (nextRoster.find((child) => child.remaining_spins > 0)?.child_id ?? nextRoster[0]?.child_id ?? null))
    setCategorySlug((current) => nextCategories.some((category) => category.slug === current) ? current : (nextCategories[0]?.slug ?? ''))
    setLoading(false)
  }

  async function loadWins(selected: number) {
    const { data, error } = await supabase.from('prize_wins')
      .select('id, child_id, spin_number, prize_name_snapshot, category_name_snapshot, tier_name_snapshot, won_at')
      .eq('child_id', selected).eq('month_start', monthStart(month)).order('spin_number')
    if (error) showMessage(error.message, 'error')
    setWins((data ?? []) as MonthlyWin[])
  }

  const selectedChild = useMemo(() => roster.find((child) => child.child_id === childId) ?? null, [roster, childId])
  const category = useMemo(() => categories.find((item) => item.slug === categorySlug) ?? categories[0] ?? null, [categories, categorySlug])
  const tierMinById = useMemo(() => new Map(tiers.map((tier) => [tier.id, tier.min_spins])), [tiers])
  const stockByPrize = useMemo(() => new Map(stock.map((row) => [row.prize_id, row])), [stock])

  const available = useMemo<WheelPrize[]>(() => {
    if (!selectedChild || !category) return []
    return prizes
      .filter((prize) => prize.category_id === category.id)
      .filter((prize) => (tierMinById.get(prize.required_tier_id) ?? Number.MAX_SAFE_INTEGER) <= selectedChild.earned_spins)
      .map((prize) => ({ prize, stock: stockByPrize.get(prize.id) }))
      .filter(({ stock: row }) => Boolean(row?.enabled && Number(row.quantity_remaining) > 0 && Number(row.weight) > 0))
      .map(({ prize, stock: row }) => ({ id: prize.id, name: prize.name, weight: Number(row?.weight ?? 1), detail: 'Stock ' + Number(row?.quantity_remaining ?? 0) }))
  }, [selectedChild, category, prizes, tierMinById, stockByPrize])

  async function spin() {
    if (!selectedChild || !category || spinning || selectedChild.remaining_spins <= 0 || !available.length) return
    setSpinning(true); setResult(null); setMessage('')
    const { data, error } = await supabase.rpc('spin_monthly_reward_wheel', {
      p_child_id: selectedChild.child_id,
      p_reward_month_start: monthStart(month),
      p_category_slug: category.slug,
    })
    if (error || !data?.length) {
      setSpinning(false)
      return showMessage(error?.message ?? 'The reward could not be recorded. No spin was used.', 'error')
    }
    const next = data[0] as MonthlySpinResult
    setRotation(targetRotationForPrize(next.prize_id, available, rotation))
    setResult(next)
    window.setTimeout(async () => {
      setSpinning(false)
      await loadData()
      await loadWins(selectedChild.child_id)
    }, 4200)
  }

  return (
    <section className="rewards-panel">
      <div className="rewards-panel-heading">
        <div><span className="rewards-kicker">Earned rewards</span><h2>Monthly Spins</h2><p>Use the child’s earned spins for the selected month. Completed spins record a win and reduce shared inventory.</p></div>
        <label className="field rewards-month-field"><span>Spins earned in</span><input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} /></label>
      </div>

      {message && <div className={noticeClass(messageKind)}>{message}</div>}

      <div className="rewards-two-column">
        <aside className="card rewards-controls-card">
          <h3>Choose child</h3>
          <label className="field"><span>Child</span><select value={childId ?? ''} onChange={(event) => { setChildId(Number(event.target.value)); setResult(null) }}>{roster.map((child) => <option value={child.child_id} key={child.child_id}>{child.child_name} — {child.remaining_spins} remaining</option>)}</select></label>
          {selectedChild && <>
            <div className="rewards-stat-grid">
              <div><span>Earned</span><strong>{selectedChild.earned_spins}</strong></div>
              <div><span>Used</span><strong>{selectedChild.used_spins}</strong></div>
              <div><span>Remaining</span><strong>{selectedChild.remaining_spins}</strong></div>
            </div>
            <div className="notice success reward-mode-notice"><strong>{selectedChild.tier_name} tier unlocked</strong></div>
          </>}
          <h3>Category</h3>
          <div className="rewards-category-grid">{categories.map((item) => <button type="button" key={item.id} className={categorySlug === item.slug ? 'primary' : 'ghost'} onClick={() => { setCategorySlug(item.slug); setResult(null) }}>{categoryIcon(item.slug)}<br />{item.name}</button>)}</div>
        </aside>

        <section className="card rewards-wheel-card">
          <div className="section-heading"><div><h2>{category?.name ?? 'Reward'} wheel</h2><p className="subtle">The legend shows the real chance of each currently eligible prize.</p></div><span className="badge">{available.length} available</span></div>
          <RewardWheel
            prizes={available}
            rotation={rotation}
            spinning={spinning}
            resultName={result?.prize_name}
            centerLabel="REWARD"
            title={(category?.name ?? 'Reward') + ' wheel'}
            actionLabel={spinning ? 'Selecting reward…' : selectedChild?.remaining_spins ? 'SPIN • ' + selectedChild.remaining_spins + ' remaining' : 'No spins remaining'}
            actionDisabled={loading || spinning || !selectedChild || selectedChild.remaining_spins <= 0 || !available.length}
            onAction={() => void spin()}
          />
        </section>
      </div>

      <section className="card rewards-history">
        <div className="section-heading"><div><h2>{selectedChild?.child_name ?? 'Child'} — {monthLabel(month)}</h2><p className="subtle">Recorded monthly reward history.</p></div><span className="badge">{wins.length} win{wins.length === 1 ? '' : 's'}</span></div>
        {wins.length === 0 ? <div className="empty">No monthly rewards recorded for this child in {monthLabel(month)}.</div> : wins.map((win) => <div className="summary-row" key={win.id}><span><strong>Spin {win.spin_number}: {win.prize_name_snapshot}</strong><br /><span className="subtle">{win.category_name_snapshot} • {win.tier_name_snapshot}</span></span><span className="subtle">{new Date(win.won_at).toLocaleString()}</span></div>)}
      </section>
    </section>
  )
}

function FreeSpinsPanel({ session }: { session: Session }) {
  const [month, setMonth] = useState(localMonth())
  const [children, setChildren] = useState<Child[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [staff, setStaff] = useState<StaffDirectory[]>([])
  const [childId, setChildId] = useState<number | null>(null)
  const [categorySlug, setCategorySlug] = useState('candy')
  const [tierSlug, setTierSlug] = useState('normal')
  const [reason, setReason] = useState('')
  const [availableRows, setAvailableRows] = useState<FreeAvailable[]>([])
  const [wins, setWins] = useState<FreeWin[]>([])
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<FreeSpinResult | null>(null)
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<MessageKind>('info')

  useEffect(() => { void loadBase() }, [month])
  useEffect(() => { if (categorySlug && tierSlug) void loadWheel() }, [categorySlug, tierSlug])
  useEffect(() => { if (childId) void loadWins(childId); else setWins([]) }, [childId, month])

  function showMessage(text: string, kind: MessageKind = 'info') { setMessage(text); setMessageKind(kind) }

  async function loadBase() {
    const [childrenResult, categoryResult, tierResult, staffResult] = await Promise.all([
      supabase.from('children').select('id, first_name, last_name, active').eq('active', true).order('first_name').order('last_name'),
      supabase.from('wheel_categories').select('id, slug, name, display_order').eq('active', true).order('display_order'),
      supabase.from('wheel_tiers').select('id, slug, name, min_spins, display_order').eq('active', true).order('display_order'),
      supabase.from('staff_profiles').select('user_id, display_name').eq('active', true),
    ])
    const error = childrenResult.error || categoryResult.error || tierResult.error || staffResult.error
    if (error) showMessage(error.message, 'error')
    const nextChildren = (childrenResult.data ?? []) as Child[]
    const nextCategories = (categoryResult.data ?? []) as Category[]
    const nextTiers = (tierResult.data ?? []) as Tier[]
    setChildren(nextChildren); setCategories(nextCategories); setTiers(nextTiers); setStaff((staffResult.data ?? []) as StaffDirectory[])
    setChildId((current) => nextChildren.some((child) => child.id === current) ? current : nextChildren[0]?.id ?? null)
    setCategorySlug((current) => nextCategories.some((category) => category.slug === current) ? current : nextCategories[0]?.slug ?? '')
    setTierSlug((current) => nextTiers.some((tier) => tier.slug === current) ? current : nextTiers[0]?.slug ?? '')
  }

  async function loadWheel() {
    const { data, error } = await supabase.rpc('get_available_free_wheel', {
      p_month_start: monthStart(month), p_category_slug: categorySlug, p_tier_slug: tierSlug,
    })
    if (error) { setAvailableRows([]); return showMessage(error.message, 'error') }
    setAvailableRows(((data ?? []) as FreeAvailable[]).map((row) => ({ ...row, weight: Number(row.weight), quantity_remaining: Number(row.quantity_remaining) })))
  }

  async function loadWins(selected: number) {
    const { data, error } = await supabase.from('free_prize_wins')
      .select('id, child_id, prize_name_snapshot, category_name_snapshot, tier_name_snapshot, reason, recorded_by, won_at')
      .eq('child_id', selected).eq('month_start', monthStart(month)).order('won_at', { ascending: false })
    if (error) showMessage(error.message, 'error')
    setWins((data ?? []) as FreeWin[])
  }

  const selectedChild = useMemo(() => children.find((child) => child.id === childId) ?? null, [children, childId])
  const categoryName = useMemo(() => categories.find((category) => category.slug === categorySlug)?.name ?? 'Reward', [categories, categorySlug])
  const tierName = useMemo(() => tiers.find((tier) => tier.slug === tierSlug)?.name ?? 'Tier', [tiers, tierSlug])
  const staffById = useMemo(() => new Map(staff.map((member) => [member.user_id, member.display_name])), [staff])
  const available = useMemo<WheelPrize[]>(() => availableRows.map((row) => ({
    id: row.prize_id, name: row.prize_name, weight: Number(row.weight), detail: row.required_tier_name + ' • Stock ' + row.quantity_remaining,
  })), [availableRows])

  async function spin() {
    if (!selectedChild || !available.length || spinning) return
    setSpinning(true); setResult(null); setMessage('')
    const { data, error } = await supabase.rpc('spin_free_reward_wheel', {
      p_child_id: selectedChild.id, p_month_start: monthStart(month), p_category_slug: categorySlug,
      p_tier_slug: tierSlug, p_reason: reason.trim() || null,
    })
    if (error || !data?.length) { setSpinning(false); return showMessage(error?.message ?? 'The free spin could not be recorded.', 'error') }
    const next = data[0] as FreeSpinResult
    setRotation(targetRotationForPrize(next.prize_id, available, rotation))
    setResult(next)
    window.setTimeout(async () => {
      setSpinning(false); setReason('')
      await loadWheel(); await loadWins(selectedChild.id)
      showMessage('Free spin recorded. Monthly earned spins were not changed.', 'success')
    }, 4200)
  }

  return (
    <section className="rewards-panel">
      <div className="rewards-panel-heading">
        <div><span className="rewards-kicker">Bonus rewards</span><h2>Free Spin</h2><p>Award a bonus wheel spin without reducing the child’s earned monthly spins.</p></div>
        <label className="field rewards-month-field"><span>Record under month</span><input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} /></label>
      </div>

      {message && <div className={noticeClass(messageKind)}>{message}</div>}
      <div className="notice"><strong>Same prizes, same chances.</strong> Free Spins use the shared live inventory and chance settings.</div>

      <div className="rewards-two-column">
        <aside className="card rewards-controls-card">
          <label className="field"><span>Child</span><select value={childId ?? ''} onChange={(event) => { setChildId(Number(event.target.value)); setResult(null) }}>{children.map((child) => <option value={child.id} key={child.id}>{childName(child)}</option>)}</select></label>
          <label className="field"><span>Allowed tier</span><select value={tierSlug} onChange={(event) => { setTierSlug(event.target.value); setResult(null) }}>{tiers.map((tier) => <option value={tier.slug} key={tier.id}>{tier.name}</option>)}</select></label>
          <h3>Category</h3>
          <div className="rewards-category-grid">{categories.map((item) => <button type="button" key={item.id} className={categorySlug === item.slug ? 'primary' : 'ghost'} onClick={() => { setCategorySlug(item.slug); setResult(null) }}>{categoryIcon(item.slug)}<br />{item.name}</button>)}</div>
          <label className="field" style={{ marginTop: 14 }}><span>Reason <span className="subtle">(optional)</span></span><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} placeholder="Example: bonus activity" /></label>
        </aside>

        <section className="card rewards-wheel-card">
          <div className="section-heading"><div><h2>{categoryName} — {tierName}</h2><p className="subtle">This bonus spin does not change monthly spin counts.</p></div><span className="badge">{available.length} available</span></div>
          <RewardWheel
            prizes={available}
            rotation={rotation}
            spinning={spinning}
            resultName={result?.prize_name}
            centerLabel="FREE"
            title={categoryName + ' free-spin wheel'}
            actionLabel={spinning ? 'Selecting free reward…' : 'FREE SPIN • ' + tierName}
            actionDisabled={spinning || !selectedChild || !available.length}
            onAction={() => void spin()}
          />
        </section>
      </div>

      <section className="card rewards-history">
        <div className="section-heading"><div><h2>{selectedChild ? childName(selectedChild) : 'Child'} free-spin history</h2><p className="subtle">{monthLabel(month)} bonus rewards.</p></div><span className="badge">{wins.length} free spin{wins.length === 1 ? '' : 's'}</span></div>
        {wins.length === 0 ? <div className="empty">No free spins recorded for this child in {monthLabel(month)}.</div> : wins.map((win) => <div className="summary-row" key={win.id}><span><strong>{win.prize_name_snapshot}</strong><br /><span className="subtle">{win.category_name_snapshot} • {win.tier_name_snapshot}{win.reason ? ' • ' + win.reason : ''}</span></span><span className="subtle" style={{ textAlign: 'right' }}>{new Date(win.won_at).toLocaleString()}<br />{staffById.get(win.recorded_by) ?? 'Staff'}</span></div>)}
      </section>
    </section>
  )
}

function TestWheelPanel() {
  const [categories, setCategories] = useState<Category[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [stock, setStock] = useState<Stock[]>([])
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [tierId, setTierId] = useState<number | null>(null)
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => { void loadData() }, [])

  async function loadData() {
    const [categoryResult, tierResult, prizeResult, stockResult] = await Promise.all([
      supabase.from('wheel_categories').select('id, slug, name, display_order').eq('active', true).order('display_order'),
      supabase.from('wheel_tiers').select('id, slug, name, min_spins, display_order').eq('active', true).order('display_order'),
      supabase.from('wheel_prizes').select('id, category_id, name, required_tier_id, active').eq('active', true).order('name'),
      supabase.from('wheel_stock').select('id, prize_id, quantity_start, quantity_remaining, weight, enabled'),
    ])
    const error = categoryResult.error || tierResult.error || prizeResult.error || stockResult.error
    if (error) setMessage(error.message)
    const nextCategories = (categoryResult.data ?? []) as Category[]
    const nextTiers = (tierResult.data ?? []) as Tier[]
    setCategories(nextCategories); setTiers(nextTiers); setPrizes((prizeResult.data ?? []) as Prize[])
    setStock(((stockResult.data ?? []) as Stock[]).map((row) => ({ ...row, weight: Number(row.weight) })))
    setCategoryId(nextCategories[0]?.id ?? null); setTierId(nextTiers[nextTiers.length - 1]?.id ?? nextTiers[0]?.id ?? null)
  }

  const tierMin = tiers.find((tier) => tier.id === tierId)?.min_spins ?? -1
  const selectedCategory = categories.find((category) => category.id === categoryId)
  const selectedTier = tiers.find((tier) => tier.id === tierId)
  const tierMinById = useMemo(() => new Map(tiers.map((tier) => [tier.id, tier.min_spins])), [tiers])
  const stockByPrize = useMemo(() => new Map(stock.map((row) => [row.prize_id, row])), [stock])
  const available = useMemo<WheelPrize[]>(() => prizes
    .filter((prize) => prize.category_id === categoryId)
    .filter((prize) => (tierMinById.get(prize.required_tier_id) ?? Number.MAX_SAFE_INTEGER) <= tierMin)
    .map((prize) => ({ prize, stock: stockByPrize.get(prize.id) }))
    .filter(({ stock: row }) => Boolean(row?.enabled && Number(row.quantity_remaining) > 0 && Number(row.weight) > 0))
    .map(({ prize, stock: row }) => ({ id: prize.id, name: prize.name, weight: Number(row?.weight ?? 1), detail: 'Live stock ' + Number(row?.quantity_remaining ?? 0) })),
    [prizes, categoryId, tierMin, tierMinById, stockByPrize])

  function spin() {
    if (spinning || !available.length) return
    const picked = weightedPick(available)
    if (!picked) return
    setSpinning(true); setResult(null)
    setRotation(targetRotationForPrize(picked.id, available, rotation))
    window.setTimeout(() => {
      setResult(picked.name)
      setHistory((current) => [picked.name, ...current].slice(0, 20))
      setSpinning(false)
    }, 4200)
  }

  return (
    <section className="rewards-panel">
      <div className="rewards-panel-heading"><div><span className="rewards-kicker">Safe testing</span><h2>Test the Real Wheel</h2><p>Uses the current live prizes, stock availability, tiers, and chances — but never writes a win, uses a spin, or reduces inventory.</p></div></div>
      <div className="notice reward-test-banner"><strong>TEST MODE:</strong> every spin on this tab is browser-only. Reloading clears the test history.</div>
      {message && <div className="notice error">{message}</div>}
      <div className="rewards-two-column">
        <aside className="card rewards-controls-card">
          <label className="field"><span>Wheel tier</span><select value={tierId ?? ''} onChange={(event) => { setTierId(Number(event.target.value)); setResult(null) }}>{tiers.map((tier) => <option value={tier.id} key={tier.id}>{tier.name}</option>)}</select></label>
          <h3>Category</h3>
          <div className="rewards-category-grid">{categories.map((item) => <button type="button" key={item.id} className={categoryId === item.id ? 'primary' : 'ghost'} onClick={() => { setCategoryId(item.id); setResult(null) }}>{categoryIcon(item.slug)}<br />{item.name}</button>)}</div>
          <button type="button" className="ghost" style={{ width: '100%', marginTop: 14 }} onClick={() => { setHistory([]); setResult(null); setRotation(0) }}>Clear test history</button>
        </aside>
        <section className="card rewards-wheel-card">
          <div className="section-heading"><div><h2>{selectedCategory?.name ?? 'Reward'} — {selectedTier?.name ?? 'Tier'}</h2><p className="subtle">This is the same live wheel configuration children would use right now.</p></div><span className="badge">{available.length} available</span></div>
          <RewardWheel
            prizes={available}
            rotation={rotation}
            spinning={spinning}
            resultName={result}
            centerLabel="TEST"
            title={(selectedCategory?.name ?? 'Reward') + ' test wheel'}
            actionLabel={spinning ? 'Testing spin…' : 'TEST REAL WHEEL'}
            actionDisabled={spinning || !available.length}
            onAction={spin}
          />
          {history.length > 0 && <div className="reward-test-history" style={{ marginTop: 14 }}>{history.map((name, index) => <span key={index}>#{history.length - index} {name}</span>)}</div>}
        </section>
      </div>
    </section>
  )
}

function PrizeSetupPanel() {
  const [categories, setCategories] = useState<Category[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [stock, setStock] = useState<Stock[]>([])
  const [winRefs, setWinRefs] = useState<{ prize_id: number | null }[]>([])
  const [stockDrafts, setStockDrafts] = useState<Record<number, { remaining: number; enabled: boolean }>>({})
  const [chanceCategoryId, setChanceCategoryId] = useState<number | null>(null)
  const [chanceTierId, setChanceTierId] = useState<number | null>(null)
  const [chanceInputs, setChanceInputs] = useState<Record<number, number>>({})
  const [editingPrizeId, setEditingPrizeId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [busyPrizeId, setBusyPrizeId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<MessageKind>('info')
  const [newName, setNewName] = useState('')
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null)
  const [newTierId, setNewTierId] = useState<number | null>(null)
  const [newStock, setNewStock] = useState(1)
  const [adding, setAdding] = useState(false)
  const [prizeSearch, setPrizeSearch] = useState('')
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<number | 'all'>('all')
  const [inventoryTierFilter, setInventoryTierFilter] = useState<number | 'all'>('all')
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<'all' | 'enabled' | 'disabled' | 'out'>('all')

  useEffect(() => { void loadData() }, [])

  function showMessage(text: string, kind: MessageKind = 'info') { setMessage(text); setMessageKind(kind) }

  async function loadData() {
    const [categoryResult, tierResult, prizeResult, stockResult, monthlyWins, freeWins] = await Promise.all([
      supabase.from('wheel_categories').select('id, slug, name, display_order').order('display_order'),
      supabase.from('wheel_tiers').select('id, slug, name, min_spins, display_order').order('display_order'),
      supabase.from('wheel_prizes').select('id, category_id, name, required_tier_id, active').order('category_id').order('name'),
      supabase.from('wheel_stock').select('id, prize_id, quantity_start, quantity_remaining, weight, enabled'),
      supabase.from('prize_wins').select('prize_id'),
      supabase.from('free_prize_wins').select('prize_id'),
    ])
    const error = categoryResult.error || tierResult.error || prizeResult.error || stockResult.error || monthlyWins.error || freeWins.error
    if (error) showMessage(error.message, 'error')
    const nextCategories = (categoryResult.data ?? []) as Category[]
    const nextTiers = (tierResult.data ?? []) as Tier[]
    const nextStock = ((stockResult.data ?? []) as Stock[]).map((row) => ({ ...row, weight: Number(row.weight) }))
    setCategories(nextCategories); setTiers(nextTiers); setPrizes((prizeResult.data ?? []) as Prize[]); setStock(nextStock)
    setWinRefs([...(monthlyWins.data ?? []), ...(freeWins.data ?? [])] as { prize_id: number | null }[])
    setStockDrafts(Object.fromEntries(nextStock.map((row) => [row.prize_id, { remaining: Number(row.quantity_remaining), enabled: Boolean(row.enabled) }])))
    setChanceCategoryId((current) => current ?? nextCategories[0]?.id ?? null)
    setChanceTierId((current) => current ?? nextTiers[nextTiers.length - 1]?.id ?? nextTiers[0]?.id ?? null)
    setNewCategoryId((current) => current ?? nextCategories[0]?.id ?? null)
    setNewTierId((current) => current ?? nextTiers[0]?.id ?? null)
  }

  const tierById = useMemo(() => new Map(tiers.map((tier) => [tier.id, tier])), [tiers])
  const stockByPrize = useMemo(() => new Map(stock.map((row) => [row.prize_id, row])), [stock])
  const winCountByPrize = useMemo(() => {
    const map = new Map<number, number>()
    for (const row of winRefs) if (row.prize_id != null) map.set(row.prize_id, (map.get(row.prize_id) ?? 0) + 1)
    return map
  }, [winRefs])

  const chanceTierMin = tierById.get(chanceTierId ?? -1)?.min_spins ?? -1
  const eligibleChancePrizes = useMemo(() => prizes
    .filter((prize) => prize.active && prize.category_id === chanceCategoryId)
    .filter((prize) => (tierById.get(prize.required_tier_id)?.min_spins ?? Number.MAX_SAFE_INTEGER) <= chanceTierMin)
    .map((prize) => ({ prize, stock: stockByPrize.get(prize.id) }))
    .filter(({ stock: row }) => Boolean(row?.enabled && Number(row.quantity_remaining) > 0 && Number(row.weight) > 0)),
    [prizes, chanceCategoryId, chanceTierMin, tierById, stockByPrize])

  const chanceTotal = eligibleChancePrizes.reduce((sum, item) => sum + Number(item.stock?.weight ?? 0), 0)

  const filteredInventoryPrizes = useMemo(() => {
    const needle = prizeSearch.trim().toLowerCase()
    return prizes.filter((prize) => {
      const row = stockByPrize.get(prize.id)
      if (needle && !prize.name.toLowerCase().includes(needle)) return false
      if (inventoryCategoryFilter !== 'all' && prize.category_id !== inventoryCategoryFilter) return false
      if (inventoryTierFilter !== 'all' && prize.required_tier_id !== inventoryTierFilter) return false
      if (inventoryStatusFilter === 'enabled' && !row?.enabled) return false
      if (inventoryStatusFilter === 'disabled' && row?.enabled) return false
      if (inventoryStatusFilter === 'out' && Number(row?.quantity_remaining ?? 0) > 0) return false
      return true
    })
  }, [prizes, stockByPrize, prizeSearch, inventoryCategoryFilter, inventoryTierFilter, inventoryStatusFilter])

  useEffect(() => {
    const next: Record<number, number> = {}
    eligibleChancePrizes.forEach(({ prize, stock: row }) => {
      next[prize.id] = chanceTotal > 0 ? Number(((Number(row?.weight ?? 0) / chanceTotal) * 100).toFixed(1)) : 0
    })
    setChanceInputs(next)
  }, [chanceCategoryId, chanceTierId, stock])

  async function applyChance(prizeId: number) {
    const desired = Number(chanceInputs[prizeId])
    if (!Number.isFinite(desired) || desired <= 0 || desired > 100) return showMessage('Enter a chance greater than 0% and no more than 100%.', 'error')
    if (eligibleChancePrizes.length > 1 && desired >= 100) return showMessage('A 100% chance is only possible when this is the only prize on the wheel.', 'error')

    const others = eligibleChancePrizes.filter(({ prize }) => prize.id !== prizeId)
    const otherTotal = others.reduce((sum, item) => sum + Number(item.stock?.weight ?? 0), 0)
    const remainder = 100 - desired
    const updates = eligibleChancePrizes.map(({ prize, stock: row }) => {
      let nextWeight = desired
      if (prize.id !== prizeId) {
        nextWeight = otherTotal > 0 ? (Number(row?.weight ?? 0) / otherTotal) * remainder : remainder / Math.max(others.length, 1)
      }
      return supabase.from('wheel_stock').update({ weight: Math.max(0.0001, Number(nextWeight.toFixed(4))) }).eq('prize_id', prize.id)
    })

    setBusyPrizeId(prizeId)
    const results = await Promise.all(updates)
    setBusyPrizeId(null)
    const error = results.find((result) => result.error)?.error
    if (error) return showMessage(error.message, 'error')
    showMessage('Chance updated to ' + desired + '%. The other prizes on this wheel were rebalanced automatically.', 'success')
    await loadData()
  }

  async function saveStock(prizeId: number) {
    const draft = stockDrafts[prizeId]
    const existing = stockByPrize.get(prizeId)
    if (!draft) return
    const remaining = Math.max(0, Math.floor(Number(draft.remaining) || 0))
    const alreadyGiven = existing ? Math.max(0, Number(existing.quantity_start) - Number(existing.quantity_remaining)) : 0
    setBusyPrizeId(prizeId)
    const { error } = await supabase.from('wheel_stock').upsert({
      prize_id: prizeId,
      quantity_start: alreadyGiven + remaining,
      quantity_remaining: remaining,
      weight: Number(existing?.weight ?? 1),
      enabled: draft.enabled && remaining > 0,
    }, { onConflict: 'prize_id' })
    setBusyPrizeId(null)
    if (error) return showMessage(error.message, 'error')
    showMessage('Prize inventory updated.', 'success')
    await loadData()
  }

  async function addPrize() {
    if (!newName.trim() || !newCategoryId || !newTierId) return showMessage('Enter a prize name, category, and tier.', 'error')
    setAdding(true)
    const { error } = await supabase.rpc('add_reward_prize_with_inventory', {
      p_name: newName.trim(), p_category_id: newCategoryId, p_tier_id: newTierId,
      p_month_start: monthStart(localMonth()), p_quantity: Math.max(0, Math.floor(newStock || 0)), p_weight: 1,
    })
    setAdding(false)
    if (error) return showMessage(error.message, 'error')
    setNewName(''); setNewStock(1)
    showMessage('Prize added. Use Wheel Chances below to set its percentage.', 'success')
    await loadData()
  }

  function startRename(prize: Prize) { setEditingPrizeId(prize.id); setEditingName(prize.name); setMessage('') }
  async function saveRename(prize: Prize) {
    const next = editingName.trim()
    if (!next) return showMessage('Prize name cannot be blank.', 'error')
    setBusyPrizeId(prize.id)
    const { error } = await supabase.from('wheel_prizes').update({ name: next }).eq('id', prize.id)
    setBusyPrizeId(null)
    if (error) return showMessage(error.message, 'error')
    setEditingPrizeId(null); setEditingName('')
    showMessage('Prize renamed. Existing win history keeps its original saved name.', 'success')
    await loadData()
  }
  async function deletePrize(prize: Prize) {
    const typed = window.prompt('Permanently delete “' + prize.name + '”? Existing reward history will remain.\n\nType the exact prize name to confirm:')
    if (typed === null) return
    if (typed.trim() !== prize.name) return showMessage('Delete canceled because the confirmation did not match the prize name.', 'error')
    setBusyPrizeId(prize.id)
    const { error } = await supabase.from('wheel_prizes').delete().eq('id', prize.id)
    setBusyPrizeId(null)
    if (error) return showMessage(error.message, 'error')
    showMessage('Prize permanently removed from shared inventory.', 'success')
    await loadData()
  }

  return (
    <section className="rewards-panel">
      <div className="rewards-panel-heading"><div><span className="rewards-kicker">Admin tools</span><h2>Prize Setup & Wheel Chances</h2><p>Manage the physical prize list and use percentages instead of abstract weights.</p></div></div>
      {message && <div className={noticeClass(messageKind)}>{message}</div>}

      <section className="card">
        <div className="section-heading"><div><h2>Add prize</h2><p className="subtle">New prizes start with a small chance setting. Adjust the exact chance in the section below.</p></div></div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          <label className="field"><span>Prize name</span><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Example: Robux" /></label>
          <label className="field"><span>Category</span><select value={newCategoryId ?? ''} onChange={(event) => setNewCategoryId(Number(event.target.value))}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="field"><span>Minimum tier</span><select value={newTierId ?? ''} onChange={(event) => setNewTierId(Number(event.target.value))}>{tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name} ({tier.min_spins}+ spins)</option>)}</select></label>
          <label className="field"><span>Starting stock</span><input type="number" min="0" step="1" value={newStock} onChange={(event) => setNewStock(Number(event.target.value))} /></label>
        </div>
        <button className="primary" type="button" disabled={adding || !newName.trim()} onClick={() => void addPrize()}>{adding ? 'Adding…' : 'Add prize'}</button>
      </section>

      <section className="card">
        <div className="section-heading"><div><h2>Wheel Chances</h2><p className="subtle">Choose a wheel, enter the percentage you want for one prize, and Juanita Hub rebalances the other visible prizes automatically.</p></div></div>
        <div className="reward-setup-toolbar">
          <label className="field"><span>Category</span><select value={chanceCategoryId ?? ''} onChange={(event) => setChanceCategoryId(Number(event.target.value))}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="field"><span>Tier wheel</span><select value={chanceTierId ?? ''} onChange={(event) => setChanceTierId(Number(event.target.value))}>{tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}</select></label>
          <div className="reward-chance-summary"><strong>100% total</strong><span>Only enabled, in-stock prizes on this wheel are included. Higher tiers also include eligible lower-tier prizes.</span></div>
        </div>
        <div style={{ marginTop: 14 }}>
          {eligibleChancePrizes.length === 0 ? <div className="empty">No enabled, in-stock prizes are available for this wheel.</div> : eligibleChancePrizes.map(({ prize, stock: row }) => {
            const actual = chanceTotal > 0 ? (Number(row?.weight ?? 0) / chanceTotal) * 100 : 0
            return <div className="reward-chance-row" key={prize.id}>
              <span><strong>{prize.name}</strong><small>{tierById.get(prize.required_tier_id)?.name ?? 'Tier'} • stock {row?.quantity_remaining ?? 0}</small></span>
              <span className="reward-chance-current">{actual.toFixed(actual >= 10 ? 0 : 1)}% now</span>
              <label className="reward-chance-input"><input type="number" min="0.1" max="100" step="0.1" value={chanceInputs[prize.id] ?? Number(actual.toFixed(1))} onChange={(event) => setChanceInputs((current) => ({ ...current, [prize.id]: Number(event.target.value) }))} /><span>%</span></label>
              <button className="ghost" type="button" disabled={busyPrizeId === prize.id} onClick={() => void applyChance(prize.id)}>{busyPrizeId === prize.id ? 'Saving…' : 'Set chance'}</button>
            </div>
          })}
        </div>
      </section>

      <section className="card">
        <div className="section-heading"><div><h2>Prize Inventory</h2><p className="subtle">Search or filter first, then rename prizes, adjust stock, enable/disable them, or remove them.</p></div><span className="badge">{filteredInventoryPrizes.length} shown</span></div>
        <div className="reward-inventory-filters">
          <label className="field reward-search-field"><span>Search prizes</span><input type="search" value={prizeSearch} onChange={(event) => setPrizeSearch(event.target.value)} placeholder="Search by prize name…" /></label>
          <label className="field"><span>Category</span><select value={inventoryCategoryFilter} onChange={(event) => setInventoryCategoryFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))}><option value="all">All categories</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <label className="field"><span>Tier</span><select value={inventoryTierFilter} onChange={(event) => setInventoryTierFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))}><option value="all">All tiers</option>{tiers.map((tier) => <option value={tier.id} key={tier.id}>{tier.name}</option>)}</select></label>
          <label className="field"><span>Status</span><select value={inventoryStatusFilter} onChange={(event) => setInventoryStatusFilter(event.target.value as typeof inventoryStatusFilter)}><option value="all">All prizes</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option><option value="out">Out of stock</option></select></label>
          <button className="ghost reward-clear-filters" type="button" onClick={() => { setPrizeSearch(''); setInventoryCategoryFilter('all'); setInventoryTierFilter('all'); setInventoryStatusFilter('all') }}>Clear filters</button>
        </div>
        <div className="reward-prize-list">
          {filteredInventoryPrizes.length === 0 && <div className="empty">No prizes match these filters.</div>}
          {categories.map((category) => {
            const categoryPrizes = filteredInventoryPrizes.filter((prize) => prize.category_id === category.id)
            if (!categoryPrizes.length) return null
            return <div key={category.id}>
              <h3>{categoryIcon(category.slug)} {category.name}</h3>
              {categoryPrizes.map((prize) => {
                const row = stockByPrize.get(prize.id)
                const draft = stockDrafts[prize.id] ?? { remaining: Number(row?.quantity_remaining ?? 0), enabled: Boolean(row?.enabled) }
                const isEditing = editingPrizeId === prize.id
                return <div className="reward-prize-row" key={prize.id}>
                  <div className="reward-prize-copy">
                    {isEditing ? <div className="inline-name-editor"><input value={editingName} autoFocus onChange={(event) => setEditingName(event.target.value)} /><button className="primary" type="button" onClick={() => void saveRename(prize)}>Save</button><button className="ghost" type="button" onClick={() => { setEditingPrizeId(null); setEditingName('') }}>Cancel</button></div> : <><strong>{prize.name}</strong><small>{tierById.get(prize.required_tier_id)?.name ?? 'Tier'} • {winCountByPrize.get(prize.id) ?? 0} recorded win{(winCountByPrize.get(prize.id) ?? 0) === 1 ? '' : 's'} • {row ? (Number(row.quantity_start) - Number(row.quantity_remaining)) + ' given' : 'not stocked'}</small></>}
                  </div>
                  <label className="field"><span>Remaining</span><input type="number" min="0" step="1" value={draft.remaining} onChange={(event) => setStockDrafts((current) => ({ ...current, [prize.id]: { ...draft, remaining: Number(event.target.value) } }))} /></label>
                  <label className="field"><span>Available on wheel</span><select value={draft.enabled ? 'yes' : 'no'} onChange={(event) => setStockDrafts((current) => ({ ...current, [prize.id]: { ...draft, enabled: event.target.value === 'yes' } }))}><option value="yes">Enabled</option><option value="no">Disabled</option></select></label>
                  <div className="reward-prize-actions">
                    <button className="ghost" type="button" disabled={busyPrizeId === prize.id} onClick={() => void saveStock(prize.id)}>Save stock</button>
                    {!isEditing && <button className="ghost" type="button" onClick={() => startRename(prize)}>Rename</button>}
                    <button className="danger-button" type="button" disabled={busyPrizeId === prize.id} onClick={() => void deletePrize(prize)}>Delete</button>
                  </div>
                </div>
              })}
            </div>
          })}
        </div>
      </section>
    </section>
  )
}

function FulfillmentPanel({ session }: { session: Session }) {
  const [month, setMonth] = useState(previousMonth())
  const [rows, setRows] = useState<FulfillmentRow[]>([])
  const [filter, setFilter] = useState<'outstanding' | 'all' | 'received'>('outstanding')
  const [search, setSearch] = useState('')
  const [savingKey, setSavingKey] = useState('')
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<MessageKind>('info')
  const [loading, setLoading] = useState(true)

  useEffect(() => { void loadData() }, [month])

  function showMessage(text: string, kind: MessageKind = 'info') { setMessage(text); setMessageKind(kind) }

  async function loadData() {
    setLoading(true); setMessage('')
    const { data, error } = await supabase.from('reward_prize_fulfillment')
      .select('source, win_id, child_id, first_name, last_name, month_start, prize_name, category_name, tier_name, reason, won_at, received_at, received_by')
      .eq('month_start', monthStart(month)).order('first_name').order('last_name').order('won_at')
    setRows((data ?? []) as FulfillmentRow[])
    if (error) showMessage(error.message, 'error')
    setLoading(false)
  }

  const summary = useMemo(() => {
    const outstanding = rows.filter((row) => !row.received_at).length
    return { total: rows.length, outstanding, received: rows.length - outstanding, children: new Set(rows.map((row) => row.child_id)).size }
  }, [rows])

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (filter === 'outstanding' && row.received_at) return false
      if (filter === 'received' && !row.received_at) return false
      if (!needle) return true
      return [row.first_name, row.last_name, row.prize_name, row.category_name, row.tier_name, row.reason].filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  }, [rows, filter, search])

  const grouped = useMemo(() => {
    const map = new Map<number, { id: number; name: string; rows: FulfillmentRow[] }>()
    for (const row of visibleRows) {
      const name = row.first_name + (row.last_name ? ' ' + row.last_name : '')
      const current = map.get(row.child_id) ?? { id: row.child_id, name, rows: [] }
      current.rows.push(row); map.set(row.child_id, current)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [visibleRows])

  async function updateRows(targets: FulfillmentRow[], received: boolean) {
    if (!targets.length || savingKey) return
    const key = targets.length === 1 ? targets[0].source + '-' + targets[0].win_id : 'child-' + targets[0].child_id
    setSavingKey(key)
    const timestamp = received ? new Date().toISOString() : null
    const monthlyIds = targets.filter((row) => row.source === 'monthly').map((row) => row.win_id)
    const freeIds = targets.filter((row) => row.source === 'free').map((row) => row.win_id)
    const requests: PromiseLike<any>[] = []
    if (monthlyIds.length) requests.push(supabase.from('prize_wins').update({ received_at: timestamp, received_by: received ? session.user.id : null }).in('id', monthlyIds).select('id'))
    if (freeIds.length) requests.push(supabase.from('free_prize_wins').update({ received_at: timestamp, received_by: received ? session.user.id : null }).in('id', freeIds).select('id'))
    const results = await Promise.all(requests)
    setSavingKey('')
    const error = results.find((result) => result.error)?.error
    const changed = results.reduce((sum, result) => sum + (result.data?.length ?? 0), 0)
    if (error) return showMessage(error.message, 'error')
    if (changed !== targets.length) return showMessage('Not every prize was updated. Refresh and try again.', 'error')
    showMessage(received ? 'Prize handoff recorded.' : 'Prize returned to the outstanding list.', 'success')
    await loadData()
  }

  function dateLabel(value: string) { return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }

  return (
    <section className="rewards-panel">
      <div className="fulfillment-page">
        <section className="fulfillment-hero">
          <div><span className="fulfillment-kicker">Reward handoff</span><h1>Prize Fulfillment</h1><p>See what children won and check prizes off when they receive them.</p></div>
          <div className="fulfillment-month-control"><label>Reward month</label><input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} /></div>
        </section>
        {message && <div className={'notice fulfillment-notice ' + messageKind}>{message}</div>}
        <section className="fulfillment-summary">
          <article><small>{monthLabel(month)}</small><strong>{summary.total}</strong><span>Total prizes won</span></article>
          <article className={summary.outstanding ? 'attention' : ''}><small>Still to give out</small><strong>{summary.outstanding}</strong><span>Outstanding prizes</span></article>
          <article><small>Completed</small><strong>{summary.received}</strong><span>Marked received</span></article>
          <article><small>Children</small><strong>{summary.children}</strong><span>Prize recipients</span></article>
        </section>
        <section className="card fulfillment-controls">
          <div className="fulfillment-filters">
            <button className={filter === 'outstanding' ? 'active' : ''} onClick={() => setFilter('outstanding')}>Needs delivery <span>{summary.outstanding}</span></button>
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All <span>{summary.total}</span></button>
            <button className={filter === 'received' ? 'active' : ''} onClick={() => setFilter('received')}>Received <span>{summary.received}</span></button>
          </div>
          <label className="fulfillment-search"><span className="sr-only">Search prizes</span><input type="search" placeholder="Search child or prize…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        </section>
        <section className="fulfillment-list">
          {!loading && grouped.length === 0 && <div className="card fulfillment-empty"><span>🎁</span><h2>{rows.length === 0 ? 'No prizes were recorded for ' + monthLabel(month) : 'Nothing matches this view'}</h2><p>{rows.length === 0 ? 'Prize wins will appear here automatically after the wheel is used.' : 'Try another filter or search term.'}</p></div>}
          {grouped.map((group) => {
            const outstanding = group.rows.filter((row) => !row.received_at)
            return <article className="card fulfillment-child" key={group.id}>
              <header><div><span className="fulfillment-avatar">🎁</span><span><h2>{group.name}</h2><small>{group.rows.length} prize{group.rows.length === 1 ? '' : 's'}{outstanding.length ? ' • ' + outstanding.length + ' still to give' : ' • all received'}</small></span></div>{outstanding.length > 1 && <button className="primary" type="button" disabled={Boolean(savingKey)} onClick={() => void updateRows(outstanding, true)}>Mark all received</button>}</header>
              <div className="fulfillment-prizes">{group.rows.map((row) => {
                const key = row.source + '-' + row.win_id
                return <div className={'fulfillment-prize-row ' + (row.received_at ? 'received' : 'outstanding')} key={key}>
                  <button className="fulfillment-check" type="button" disabled={Boolean(savingKey)} onClick={() => void updateRows([row], !row.received_at)}><span>{row.received_at ? '✓' : ''}</span></button>
                  <div className="fulfillment-prize-info"><strong>{row.prize_name}</strong><span><em>{row.source === 'free' ? 'Free Spin' : 'Monthly Wheel'}</em><small>{row.category_name} • {row.tier_name}</small>{row.reason && <small>Reason: {row.reason}</small>}</span></div>
                  <div className="fulfillment-prize-status">{row.received_at ? <><strong>Received</strong><small>{dateLabel(row.received_at)}</small></> : <><strong>Needs delivery</strong><small>Won {dateLabel(row.won_at)}</small></>}</div>
                </div>
              })}</div>
            </article>
          })}
        </section>
      </div>
    </section>
  )
}
