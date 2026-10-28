'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export type WheelPrize = {
  id: number
  name: string
  weight: number
  detail?: string
}

type Props = {
  prizes: WheelPrize[]
  rotation: number
  spinning: boolean
  resultName?: string | null
  centerLabel?: string
  title?: string
  actionLabel?: string
  actionDisabled?: boolean
  onAction?: () => void
}

function polar(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  }
}

function arcPath(startAngle: number, endAngle: number) {
  const start = polar(160, 160, 148, endAngle)
  const end = polar(160, 160, 148, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1
  return `M 160 160 L ${start.x} ${start.y} A 148 148 0 ${largeArc} 0 ${end.x} ${end.y} Z`
}

function readableLabel(name: string) {
  const text = name.trim()
  return text.length > 23 ? text.slice(0, 22).trimEnd() + '…' : text
}

export default function RewardWheel({
  prizes,
  rotation,
  spinning,
  resultName,
  centerLabel = 'REWARD',
  title = 'Reward wheel',
  actionLabel,
  actionDisabled = false,
  onAction,
}: Props) {
  const presentationRef = useRef<HTMLDivElement | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [celebrating, setCelebrating] = useState(false)
  const audioRef = useRef<AudioContext | null>(null)
  const previousSpinRef = useRef(false)
  const lastTickAt = useRef(0)

  function playTone(frequency: number, duration: number, delay = 0, volume = 0.035) {
    if (!soundEnabled) return
    try {
      const context = audioRef.current ?? new AudioContext()
      audioRef.current = context
      if (context.state === 'suspended') void context.resume()
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = context.currentTime + delay
      oscillator.type = duration <= 0.09 ? 'triangle' : 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(0.001, start)
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + duration + 0.01)
    } catch {
      // Audio is optional: browsers without support can spin silently.
    }
  }

  useEffect(() => {
    if (spinning) {
      setCelebrating(false)
      previousSpinRef.current = true
      if (!soundEnabled) return
      const startedAt = performance.now()
      const timer = window.setInterval(() => {
        const elapsed = performance.now() - startedAt
        const interval = elapsed < 2000 ? 130 : elapsed < 3300 ? 220 : 370
        if (elapsed - lastTickAt.current >= interval) {
          lastTickAt.current = elapsed
          playTone(410 + (Math.round(elapsed / 130) % 3) * 80, 0.045, 0, 0.026)
        }
      }, 35)
      return () => window.clearInterval(timer)
    }
    if (previousSpinRef.current && resultName) {
      previousSpinRef.current = false
      setCelebrating(true)
      playTone(523, 0.19, 0, 0.06)
      playTone(659, 0.19, 0.13, 0.06)
      playTone(784, 0.22, 0.25, 0.07)
      playTone(1047, 0.5, 0.39, 0.055)
      const timeout = window.setTimeout(() => setCelebrating(false), 2600)
      return () => window.clearTimeout(timeout)
    }
    if (!resultName) previousSpinRef.current = false
  }, [spinning, resultName, soundEnabled])

  useEffect(() => () => { if (audioRef.current) void audioRef.current.close() }, [])

  function triggerAction() {
    if (soundEnabled && !audioRef.current) {
      try { audioRef.current = new AudioContext() } catch { /* silent fallback */ }
    }
    onAction?.()
  }

  const totalWeight = useMemo(
    () => prizes.reduce((sum, prize) => sum + Math.max(0, Number(prize.weight || 0)), 0),
    [prizes],
  )

  const segments = useMemo(() => {
    let cursor = 0
    return prizes.map((prize, index) => {
      const portion = totalWeight > 0 ? Number(prize.weight) / totalWeight : 1 / Math.max(prizes.length, 1)
      const startAngle = cursor
      const endAngle = index === prizes.length - 1 ? 360 : cursor + portion * 360
      cursor = endAngle
      const middle = (startAngle + endAngle) / 2
      const labelPoint = polar(160, 160, 98, middle)
      const chance = totalWeight > 0 ? (Number(prize.weight) / totalWeight) * 100 : 100 / Math.max(prizes.length, 1)
      return { prize, startAngle, endAngle, middle, labelPoint, index, chance }
    })
  }, [prizes, totalWeight])

  useEffect(() => {
    function handleFullscreenChange() {
      setFullscreen(document.fullscreenElement === presentationRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  async function toggleFullscreen() {
    if (!presentationRef.current) return
    if (document.fullscreenElement === presentationRef.current) {
      await document.exitFullscreen()
      return
    }
    await presentationRef.current.requestFullscreen()
  }

  if (prizes.length === 0) {
    return <div className="reward-wheel-empty">No in-stock prizes are configured for this wheel yet.</div>
  }

  return (
    <div ref={presentationRef} className={`reward-wheel-presentation reward-wheel-reference ${fullscreen ? 'is-fullscreen' : ''}`}>
      <div className="reward-wheel-presentation-bar">
        <div><strong>{title}</strong><small>{prizes.length} available prize{prizes.length === 1 ? '' : 's'}</small></div>
        <div className="reward-wheel-toolbar"><button className="ghost reward-sound-button" type="button" aria-pressed={soundEnabled} onClick={() => setSoundEnabled((enabled) => !enabled)}>{soundEnabled ? "🔊 Sound on" : "🔇 Sound off"}</button><button className="ghost reward-fullscreen-button" type="button" onClick={() => void toggleFullscreen()}>
          {fullscreen ? 'Exit full screen' : '⛶ Full screen'}
        </button></div>
      </div>

      <div className="reward-wheel-layout">
        <div className="reward-wheel-stage" aria-live="polite">
          {celebrating && <div className="reward-wheel-confetti" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ left: ((i * 41) % 100) + '%', animationDelay: ((i % 9) * 0.09) + 's', animationDuration: (1.7 + (i % 5) * 0.22) + 's', backgroundColor: ['#4d9ddd', '#f6bc4f', '#eb6991', '#6bbf8c', '#9f80db'][i % 5] }} />)}</div>}
          <div
            className={`reward-wheel-rotator ${spinning ? 'is-spinning' : ''}`}
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <svg className="reward-wheel-svg" viewBox="0 0 320 320" role="img" aria-label={title}>
              {segments.map(({ prize, startAngle, endAngle, middle, labelPoint, index, chance }) => {
                const text = readableLabel(prize.name)
                const fontSize = text.length > 18 ? 8 : text.length > 12 ? 9 : 10.5
                return (
                  <g key={prize.id}>
                    <path
                      d={arcPath(startAngle, endAngle)}
                      className={`reward-wheel-slice reward-slice-${(index % 4) + 1}`}
                    />
                    {chance >= 2.3 && (
                      <text
                        x={labelPoint.x}
                        y={labelPoint.y}
                        transform={`rotate(${middle + 90} ${labelPoint.x} ${labelPoint.y})`}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={fontSize}
                        className="reward-wheel-label"
                      >
                        {text}
                      </text>
                    )}
                  </g>
                )
              })}
              <circle cx="160" cy="160" r="143" fill="none" stroke="#fff" strokeWidth="10" strokeOpacity=".28" pointerEvents="none" />

            </svg>
          </div>
          <div className="reward-wheel-center-hub">
            {actionLabel && onAction ? (
              <button type="button" className="reward-wheel-center-spin" disabled={actionDisabled || spinning} onClick={triggerAction} aria-label={actionLabel}>
                <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
                  <path d="M60 3 L92 48 C108 70 107 96 89 109 C72 121 48 121 31 109 C13 97 12 71 28 48 Z" fill="currentColor" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
                </svg>
                <strong>{spinning ? '•••' : 'Spin'}</strong>
              </button>
            ) : (
              <div className="reward-wheel-center-static">
                <svg viewBox="0 0 120 120" aria-hidden="true"><path d="M60 3 L92 48 C108 70 107 96 89 109 C72 121 48 121 31 109 C13 97 12 71 28 48 Z" fill="currentColor" stroke="#fff" strokeWidth="5" strokeLinejoin="round" /></svg>
                <strong>{centerLabel}</strong>
              </div>
            )}
          </div>
        </div>

        <aside className="reward-wheel-legend" aria-label="Wheel prize chances">
          <h3>Wheel chances</h3>
          {segments.map(({ prize, index, chance }) => (
            <div className="reward-wheel-legend-row" key={prize.id}>
              <span className={`reward-wheel-dot reward-dot-${(index % 4) + 1}`} aria-hidden="true" />
              <span><strong>{prize.name}</strong>{prize.detail && <small>{prize.detail}</small>}</span>
              <b>{chance.toFixed(chance >= 10 ? 0 : 1)}%</b>
            </div>
          ))}
        </aside>
      </div>
      {resultName && !spinning && <div className="reward-wheel-result-footer" role="status">🎉 <strong>{resultName}</strong> <span>Congratulations!</span></div>}
    </div>
  )
}
