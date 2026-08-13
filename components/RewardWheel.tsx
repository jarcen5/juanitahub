'use client'

type WheelPrize = {
  id: number
  name: string
  weight: number
}

type Props = {
  prizes: WheelPrize[]
  rotation: number
  spinning: boolean
  resultName?: string | null
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

export default function RewardWheel({ prizes, rotation, spinning, resultName }: Props) {
  const totalWeight = prizes.reduce((sum, prize) => sum + Math.max(0, Number(prize.weight || 0)), 0)
  let cursor = 0

  const segments = prizes.map((prize, index) => {
    const portion = totalWeight > 0 ? Number(prize.weight) / totalWeight : 1 / Math.max(prizes.length, 1)
    const startAngle = cursor
    const endAngle = index === prizes.length - 1 ? 360 : cursor + portion * 360
    cursor = endAngle
    const middle = (startAngle + endAngle) / 2
    const labelPoint = polar(160, 160, 96, middle)
    return { prize, startAngle, endAngle, middle, labelPoint, index }
  })

  if (prizes.length === 0) {
    return <div className="reward-wheel-empty">No in-stock prizes are configured for this wheel yet.</div>
  }

  return (
    <div className="reward-wheel-stage" aria-live="polite">
      <div className="reward-wheel-pointer" aria-hidden="true">▼</div>
      <div
        className={`reward-wheel-rotator ${spinning ? 'is-spinning' : ''}`}
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <svg className="reward-wheel-svg" viewBox="0 0 320 320" role="img" aria-label="Available behavior reward prizes">
          {segments.map(({ prize, startAngle, endAngle, middle, labelPoint, index }) => (
            <g key={prize.id}>
              <path
                d={arcPath(startAngle, endAngle)}
                className={`reward-wheel-slice reward-slice-${(index % 6) + 1}`}
              />
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${middle} ${labelPoint.x} ${labelPoint.y})`}
                className="reward-wheel-label"
              >
                {prize.name.length > 15 ? `${prize.name.slice(0, 13)}…` : prize.name}
              </text>
            </g>
          ))}
          <circle cx="160" cy="160" r="34" className="reward-wheel-hub" />
          <text x="160" y="160" textAnchor="middle" dominantBaseline="middle" className="reward-wheel-hub-label">REWARD</text>
        </svg>
      </div>
      {resultName && !spinning && <div className="reward-result-banner">Won: <strong>{resultName}</strong></div>}
    </div>
  )
}
