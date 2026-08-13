'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

type CategorySlug = 'candy' | 'toys' | 'food'
type TestPrize = {
  id: number
  category: CategorySlug
  name: string
  tier: 'Normal' | 'Premium' | 'Special'
  weight: number
  stock: number
}
type TestWin = {
  spinNumber: number
  category: CategorySlug
  prize: string
  tier: string
}

const colors = ['#5b8def', '#28a745', '#e8b923', '#ef7d23', '#d64545', '#8b5cf6']

const initialPrizes: TestPrize[] = [
  { id: 1, category: 'candy', name: 'Gummy Pack', tier: 'Normal', weight: 6, stock: 5 },
  { id: 2, category: 'candy', name: 'Full-Size Candy', tier: 'Premium', weight: 3, stock: 4 },
  { id: 3, category: 'candy', name: 'Special Candy', tier: 'Special', weight: 1, stock: 2 },
  { id: 4, category: 'toys', name: 'Small Toy', tier: 'Normal', weight: 6, stock: 5 },
  { id: 5, category: 'toys', name: 'Premium Toy', tier: 'Premium', weight: 3, stock: 4 },
  { id: 6, category: 'toys', name: 'Special Toy', tier: 'Special', weight: 1, stock: 2 },
  { id: 7, category: 'food', name: 'Snack', tier: 'Normal', weight: 6, stock: 5 },
  { id: 8, category: 'food', name: 'Premium Snack', tier: 'Premium', weight: 3, stock: 4 },
  { id: 9, category: 'food', name: 'Special Food', tier: 'Special', weight: 1, stock: 2 },
]

const categories: { slug: CategorySlug; name: string; icon: string }[] = [
  { slug: 'candy', name: 'Candy', icon: '🍬' },
  { slug: 'toys', name: 'Toys', icon: '🧸' },
  { slug: 'food', name: 'Food', icon: '🍕' },
]

function weightedPick(prizes: TestPrize[]) {
  const total = prizes.reduce((sum, prize) => sum + prize.weight, 0)
  let target = Math.random() * total
  for (const prize of prizes) {
    target -= prize.weight
    if (target <= 0) return prize
  }
  return prizes[prizes.length - 1]
}

export default function RewardTestPage() {
  const [remainingSpins, setRemainingSpins] = useState(3)
  const [category, setCategory] = useState<CategorySlug>('candy')
  const [prizes, setPrizes] = useState<TestPrize[]>(initialPrizes)
  const [wins, setWins] = useState<TestWin[]>([])
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const available = useMemo(
    () => prizes.filter((prize) => prize.category === category && prize.stock > 0),
    [prizes, category],
  )

  const gradient = useMemo(() => {
    if (!available.length) return '#f2f4f7'
    const total = available.reduce((sum, prize) => sum + prize.weight, 0)
    let cursor = 0
    const stops: string[] = []
    available.forEach((prize, index) => {
      const start = cursor
      cursor += (prize.weight / total) * 100
      stops.push(`${colors[index % colors.length]} ${start}% ${cursor}%`)
    })
    return `conic-gradient(${stops.join(', ')})`
  }, [available])

  function spin() {
    if (spinning || remainingSpins <= 0 || available.length === 0) return
    const chosen = weightedPick(available)
    setSpinning(true)
    setResult(null)
    setRotation((current) => current + 1440 + Math.floor(Math.random() * 330))

    window.setTimeout(() => {
      const spinNumber = 4 - remainingSpins
      setPrizes((current) => current.map((prize) => prize.id === chosen.id ? { ...prize, stock: prize.stock - 1 } : prize))
      setWins((current) => [...current, { spinNumber, category, prize: chosen.name, tier: chosen.tier }])
      setRemainingSpins((current) => current - 1)
      setResult(chosen.name)
      setSpinning(false)
    }, 2200)
  }

  function reset() {
    setRemainingSpins(3)
    setCategory('candy')
    setPrizes(initialPrizes)
    setWins([])
    setRotation(0)
    setResult(null)
    setSpinning(false)
  }

  const selectedCategory = categories.find((item) => item.slug === category)!

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Reward Test Mode</small></div>
        <div className="toolbar">
          <Link className="ghost" style={{ textDecoration: 'none' }} href="/rewards">Back to Reward Center</Link>
        </div>
      </header>

      <main className="main">
        <div className="notice" style={{ marginBottom: 16 }}>
          <strong>TEST MODE:</strong> Nothing on this page changes real children, points, spins, prize history, or inventory.
        </div>

        <div className="hero">
          <div>
            <h1>Test Student</h1>
            <p className="subtle">Use this sandbox to test tier unlocking, weighted choices, stock deduction, and the three reward categories.</p>
          </div>
          <button className="ghost" onClick={reset}>Reset test</button>
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(270px, 320px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          <aside className="card">
            <h2>Test Student</h2>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              {[
                ['Earned', 3],
                ['Used', 3 - remainingSpins],
                ['Remaining', remainingSpins],
              ].map(([label, value]) => (
                <div key={String(label)} style={{ background: '#f8fafc', border: '1px solid #e4e7ec', borderRadius: 10, padding: 9, textAlign: 'center' }}>
                  <span className="subtle" style={{ display: 'block', fontSize: 11 }}>{label}</span>
                  <strong style={{ fontSize: 20 }}>{value}</strong>
                </div>
              ))}
            </div>

            <div className="notice success" style={{ textAlign: 'center' }}>
              <strong>Special tier unlocked ⭐</strong><br />
              <span className="subtle">It stays unlocked even after spins are used.</span>
            </div>

            <h3>Choose category</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {categories.map((item) => (
                <button
                  key={item.slug}
                  className={category === item.slug ? 'primary' : 'ghost'}
                  style={{ padding: '10px 5px' }}
                  onClick={() => {
                    setCategory(item.slug)
                    setResult(null)
                  }}
                >
                  {item.icon}<br />{item.name}
                </button>
              ))}
            </div>
          </aside>

          <section className="card">
            <div className="section-heading">
              <div>
                <h2>{selectedCategory.name} test wheel</h2>
                <p className="subtle">Normal items have weight 6, Premium weight 3, and Special weight 1.</p>
              </div>
              <span className="badge">{available.length} in stock</span>
            </div>

            <div style={{ position: 'relative', width: 'min(460px, 92%)', aspectRatio: '1', margin: '22px auto' }}>
              <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', zIndex: 2, fontSize: 34 }}>▼</div>
              <div style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: gradient,
                border: '8px solid white',
                boxShadow: '0 4px 18px rgba(16,24,40,.16)',
                transform: `rotate(${rotation}deg)`,
                transition: 'transform 2s cubic-bezier(.12,.72,.15,1)',
                display: 'grid',
                placeItems: 'center',
              }}>
                <div style={{ width: 82, height: 82, borderRadius: '50%', background: '#111827', color: 'white', display: 'grid', placeItems: 'center', border: '5px solid white', fontWeight: 800 }}>TEST</div>
              </div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
              {available.map((prize, index) => (
                <div key={prize.id} style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid #e4e7ec', borderRadius: 9, padding: 8 }}>
                  <span style={{ width: 13, height: 13, borderRadius: 99, background: colors[index % colors.length], flex: '0 0 auto' }} />
                  <span>
                    <strong>{prize.name}</strong><br />
                    <span className="subtle" style={{ fontSize: 12 }}>{prize.tier} • weight {prize.weight} • stock {prize.stock}</span>
                  </span>
                </div>
              ))}
            </div>

            {result && !spinning && <div className="notice success" style={{ textAlign: 'center', fontSize: 18 }}>🎉 <strong>Test Student won {result}!</strong></div>}

            <button
              className="primary"
              style={{ display: 'block', width: 'min(520px, 100%)', margin: '0 auto', padding: 14, fontSize: 17 }}
              disabled={spinning || remainingSpins <= 0 || available.length === 0}
              onClick={spin}
            >
              {spinning ? 'Spinning…' : remainingSpins > 0 ? `SPIN • ${remainingSpins} remaining` : 'Test complete'}
            </button>
          </section>
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <h2>Test reward history</h2>
          <p className="subtle">This history exists only in this browser tab and resets when you press Reset test or reload the page.</p>
          {wins.length === 0 ? (
            <div className="empty">No test rewards yet.</div>
          ) : wins.map((win) => (
            <div className="summary-row" key={win.spinNumber}>
              <span><strong>Spin {win.spinNumber}: {win.prize}</strong><br /><span className="subtle">{categories.find((item) => item.slug === win.category)?.name} • {win.tier}</span></span>
              <span className="badge">Test</span>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
