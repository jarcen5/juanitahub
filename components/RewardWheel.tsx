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

function labelLines(name: string) {
  if (name.length <= 13) return [name]
  const words = name.split(' ')
  if (words.length === 1) return [`${name.slice(0, 11)}…`]

  const lines = ['', '']
  for (const word of words) {
    if (!lines[0] || (lines[0] + ' ' + word).trim().length <= 13) {
      lines[0] = (lines[0] + ' ' + word).trim()
    } else {
      lines[1] = (lines[1] + ' ' + word).trim()
    }
  }
  if (lines[1].length > 13) lines[1] = `${lines[1].slice(0, 11)}…`
  return lines.filter(Boolean)
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
      const labelPoint = polar(160, 160, 101, middle)
      const chance = totalWeight > 0 ? (Number(prize.weight) / totalWeight) * 100 : 100 / Math.max(prizes.length, 1)
      return { prize, startAngle, endAngle, labelPoint, index, chance }
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
    <div ref={presentationRef} className={`reward-wheel-presentation ${fullscreen ? 'is-fullscreen' : ''}`}>
      <div className="reward-wheel-presentation-bar">
        <div><strong>{title}</strong><small>{prizes.length} available prize{prizes.length === 1 ? '' : 's'}</small></div>
        <button className="ghost reward-fullscreen-button" type="button" onClick={() => void toggleFullscreen()}>
          {fullscreen ? 'Exit full screen' : '⛶ Full screen'}
        </button>
      </div>

      <div className="reward-wheel-layout">
        <div className="reward-wheel-stage" aria-live="polite">
          <div className="reward-wheel-pointer" aria-hidden="true">▼</div>
          <div
            className={`reward-wheel-rotator ${spinning ? 'is-spinning' : ''}`}
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <svg className="reward-wheel-svg" viewBox="0 0 320 320" role="img" aria-label={title}>
              {segments.map(({ prize, startAngle, endAngle, labelPoint, index, chance }) => {
                const lines = labelLines(prize.name)
                return (
                  <g key={prize.id}>
                    <path
                      d={arcPath(startAngle, endAngle)}
                      className={`reward-wheel-slice reward-slice-${(index % 8) + 1}`}
                    />
                    {chance >= 3 && (
                      <text
                        x={labelPoint.x}
                        y={labelPoint.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="reward-wheel-label"
                      >
                        {lines.map((line, lineIndex) => (
                          <tspan
                            x={labelPoint.x}
                            dy={lineIndex === 0 && lines.length > 1 ? '-0.45em' : lineIndex === 0 ? '0' : '1.05em'}
                            key={line}
                          >
                            {line}
                          </tspan>
                        ))}
                      </text>
                    )}
                  </g>
                )
              })}
              <circle cx="160" cy="160" r="36" className="reward-wheel-hub" />
              <text x="160" y="156" textAnchor="middle" dominantBaseline="middle" className="reward-wheel-hub-label">{centerLabel}</text>
              <text x="160" y="174" textAnchor="middle" dominantBaseline="middle" className="reward-wheel-hub-sub">SPIN</text>
            </svg>
          </div>
          {resultName && !spinning && <div className="reward-result-banner">🎉 Won: <strong>{resultName}</strong></div>}
        </div>

        <aside className="reward-wheel-legend" aria-label="Wheel prize chances">
          <h3>Wheel chances</h3>
          {segments.map(({ prize, index, chance }) => (
            <div className="reward-wheel-legend-row" key={prize.id}>
              <span className={`reward-wheel-dot reward-dot-${(index % 8) + 1}`} aria-hidden="true" />
              <span><strong>{prize.name}</strong>{prize.detail && <small>{prize.detail}</small>}</span>
              <b>{chance.toFixed(chance >= 10 ? 0 : 1)}%</b>
            </div>
          ))}
        </aside>
      </div>

      {actionLabel && onAction && (
        <div className="reward-wheel-action">
          <button className="primary" type="button" disabled={actionDisabled} onClick={onAction}>{actionLabel}</button>
        </div>
      )}
    </div>
  )
}
