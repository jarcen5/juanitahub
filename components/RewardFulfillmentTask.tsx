'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

function previousMonthStart() {
  const now = new Date()
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const year = previous.getFullYear()
  const month = String(previous.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}

function previousMonthLabel() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString(undefined, { month: 'long' })
}

export default function RewardFulfillmentTask() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    async function loadCount() {
      const { count: outstanding, error } = await supabase
        .from('reward_prize_fulfillment')
        .select('win_id', { count: 'exact', head: true })
        .eq('month_start', previousMonthStart())
        .is('received_at', null)

      if (mounted) setCount(error ? null : (outstanding ?? 0))
    }

    void loadCount()
    return () => { mounted = false }
  }, [])

  if (count === null) return null

  if (count > 0) {
    return (
      <Link href="/rewards/fulfillment">
        <strong>🎁 {count} {previousMonthLabel()} prize{count === 1 ? '' : 's'} still need{count === 1 ? 's' : ''} to be given out</strong>
        <small>Open Prize Fulfillment →</small>
      </Link>
    )
  }

  return (
    <div className="home-all-clear">
      <strong>✓ Previous month’s prizes are complete</strong>
      <small>All {previousMonthLabel()} prize wins are marked received.</small>
    </div>
  )
}
