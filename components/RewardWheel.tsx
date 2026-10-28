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
  const [winnerDismissed, setWinnerDismissed] = useState(false)
  const [heldPrizes, setHeldPrizes] = useState<WheelPrize[] | null>(null)
  const spinWasActive = useRef(false)
  const audioRef = useRef<AudioContext | null>(null)
  const previousSpinRef = useRef(false)
  const lastTickAt = useRef(0)

  function audioContext() {
    if (!soundEnabled || typeof window === 'undefined') return null
    try {
      const context = audioRef.current ?? new AudioContext()
      audioRef.current = context
      if (context.state === 'suspended') void context.resume()
      return context
    } catch {
      // Muted or unsupported browsers can still use every wheel feature.
      return null
    }
  }

  // A soft ratchet-like click (short filtered percussion), not an electronic beep.
  function playWheelClick() {
    const context = audioContext()
    if (!context) return
    const duration = 0.048
    const count = Math.ceil(context.sampleRate * duration)
    const buffer = context.createBuffer(1, count, context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < count; i++) {
      const progress = i / count
      const decay = Math.pow(1 - progress, 5)
      samples[i] = (Math.random() * 2 - 1) * decay
    }
    const source = context.createBufferSource()
    source.buffer = buffer
    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1500
    filter.Q.value = 0.8
    const gain = context.createGain()
    gain.gain.value = 0.09
    source.connect(filter)
    filter.connect(gain)
    gain.connect(context.destination)
    source.start()
    source.stop(context.currentTime + duration)
  }

  // Original bell-like fanfare; no third-party or unlicensed audio assets.
  function playWinningChime() {
    const context = audioContext()
    if (!context) return
    const notes = [
      { frequency: 523.25, delay: 0, length: 0.25 },
      { frequency: 659.25, delay: 0.14, length: 0.27 },
      { frequency: 783.99, delay: 0.28, length: 0.3 },
      { frequency: 1046.5, delay: 0.43, length: 0.75 },
    ]
    for (const note of notes) {
      const start = context.currentTime + note.delay
      for (const harmonic of [1, 2.01]) {
        const tone = context.createOscillator()
        const gain = context.createGain()
        tone.type = 'sine'
        tone.frequency.setValueAtTime(note.frequency * harmonic, start)
        gain.gain.setValueAtTime(0.001, start)
        gain.gain.exponentialRampToValueAtTime(harmonic === 1 ? 0.065 : 0.012, start + 0.012)
        gain.gain.exponentialRampToValueAtTime(0.001, start + note.length)
        tone.connect(gain)
        gain.connect(context.destination)
        tone.start(start)
        tone.stop(start + note.length + 0.01)
      }
    }
  }

  useEffect(() => {
    if (spinning) {
      setWinnerDismissed(false)
      setCelebrating(false)
      previousSpinRef.current = true
      if (!soundEnabled) return
      const startedAt = performance.now()
      lastTickAt.current = -110
      const timer = window.setInterval(() => {
        const elapsed = performance.now() - startedAt
        const slowDown = Math.min(elapsed / 4100, 1)
        const interval = 85 + 320 * Math.pow(slowDown, 2.4)
        if (elapsed - lastTickAt.current >= interval) {
          lastTickAt.current = elapsed
          playWheelClick()
        }
      }, 28)
      return () => window.clearInterval(timer)
    }
    if (previousSpinRef.current && resultName) {
      previousSpinRef.current = false
      setCelebrating(true)
      playWinningChime()
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

  // Preserve the visible set of prizes until a winning announcement is dismissed.
  // A real spin may use the last item in stock, removing it from the new live list.
  useEffect(() => {
    if (spinning && !spinWasActive.current) setHeldPrizes(prizes.map((prize) => ({ ...prize })))
    else if (!spinning && !resultName) setHeldPrizes(null)
    spinWasActive.current = spinning
  }, [spinning, resultName, prizes])

  const displayPrizes = heldPrizes ?? prizes

  const totalWeight = useMemo(
    () => displayPrizes.reduce((sum, prize) => sum + Math.max(0, Number(prize.weight || 0)), 0),
    [displayPrizes],
  )

  const segments = useMemo(() => {
    let cursor = 0
    return displayPrizes.map((prize, index) => {
      // Keep the visual wedges evenly spaced like the reference. Actual odds remain
      // controlled by the weighted draw and are displayed separately in the legend.
      const portion = 1 / Math.max(displayPrizes.length, 1)
      const startAngle = cursor
      const endAngle = index === displayPrizes.length - 1 ? 360 : cursor + portion * 360
      cursor = endAngle
      const middle = (startAngle + endAngle) / 2
      const labelPoint = polar(160, 160, 98, middle)
      const chance = totalWeight > 0 ? (Number(prize.weight) / totalWeight) * 100 : 100 / Math.max(displayPrizes.length, 1)
      return { prize, startAngle, endAngle, middle, labelPoint, index, chance }
    })
  }, [displayPrizes, totalWeight])

  // Prize selection and odds are unchanged; this identifies only the winning visual segment.
  const winningIndex = resultName
    ? segments.findIndex(({ prize }) => prize.name.trim().toLocaleLowerCase() === resultName.trim().toLocaleLowerCase())
    : -1
  const showWinner = !spinning && !winnerDismissed && winningIndex >= 0
  const winningPrize = showWinner ? segments[winningIndex] : null
  const winningColor = winningPrize ? ['#5f80cd', '#d9635b', '#5db577', '#f4c95e'][winningPrize.index % 4] : '#5db577'

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

  if (displayPrizes.length === 0) {
    return <div className="reward-wheel-empty">No in-stock prizes are configured for this wheel yet.</div>
  }

  return (
    <div ref={presentationRef} className={`reward-wheel-presentation reward-wheel-reference ${fullscreen ? 'is-fullscreen' : ''}`}>
      <div className="reward-wheel-presentation-bar">
        <div><strong>{title}</strong><small>{displayPrizes.length} available prize{displayPrizes.length === 1 ? '' : 's'}</small></div>
        <div className="reward-wheel-toolbar"><button className="ghost reward-sound-button" type="button" aria-pressed={soundEnabled} onClick={() => setSoundEnabled((enabled) => !enabled)}>{soundEnabled ? "🔊 Sound on" : "🔇 Sound off"}</button><button className="ghost reward-fullscreen-button" type="button" onClick={() => void toggleFullscreen()}>
          {fullscreen ? 'Exit full screen' : '⛶ Full screen'}
        </button></div>
      </div>

      <div className="reward-wheel-layout">
        <div className="reward-wheel-stage">
          {celebrating && <div className="reward-wheel-confetti" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ left: ((i * 41) % 100) + '%', animationDelay: ((i % 9) * 0.09) + 's', animationDuration: (1.7 + (i % 5) * 0.22) + 's', backgroundColor: ['#4d9ddd', '#f6bc4f', '#eb6991', '#6bbf8c', '#9f80db'][i % 5] }} />)}</div>}
          <div
            className={`reward-wheel-rotator ${spinning ? 'is-spinning' : ''} ${showWinner ? 'has-winner' : ''}`}
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <svg className="reward-wheel-svg" viewBox="0 0 320 320" role="img" aria-label={title}>
              {segments.map(({ prize, startAngle, endAngle, middle, labelPoint, index }) => {
                const text = readableLabel(prize.name)
                const fontSize = text.length > 18 ? 8 : text.length > 12 ? 9 : 10.5
                return (
                  <g key={prize.id} className={`reward-wheel-segment ${showWinner ? (index === winningIndex ? 'is-winner' : 'is-muted') : ''}`}>
                    <path
                      d={arcPath(startAngle, endAngle)}
                      className={`reward-wheel-slice reward-slice-${(index % 4) + 1}`}
                    />
                    <text
                        x={labelPoint.x}
                        y={labelPoint.y}
                        transform={`rotate(${middle + 90} ${labelPoint.x} ${labelPoint.y})`}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={{ fontSize }}
                        className="reward-wheel-label"
                      >
                        {text}
                      </text>
                  </g>
                )
              })}
              <circle cx="160" cy="160" r="143" fill="none" stroke="#fff" strokeWidth="10" strokeOpacity=".28" pointerEvents="none" />

            </svg>
          </div>
          <div className="reward-wheel-center-hub">
            {actionLabel && onAction ? (
              <button type="button" className="reward-wheel-center-spin" disabled={actionDisabled || spinning || showWinner} onClick={triggerAction} aria-label={actionLabel}>
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
        {showWinner && winningPrize && (
          <div className="reward-wheel-win-popup" role="status" aria-label={`Prize won: ${winningPrize.prize.name}`}>
            <div className="reward-wheel-win-title" style={{ backgroundColor: winningColor }}>
              <span className="reward-wheel-win-sparkle" aria-hidden="true">✦</span>
              <strong>{winningPrize.prize.name}</strong>
            </div>
            <button className="reward-wheel-win-close" type="button" onClick={() => { setWinnerDismissed(true); setHeldPrizes(null) }}>
              Close
            </button>
          </div>
          )}
        </div>
      </div>
    </div>
  )
}
