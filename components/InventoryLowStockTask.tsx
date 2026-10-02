'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function InventoryLowStockTask() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      const { count: low, error } = await supabase
        .from('inventory_low_stock_items')
        .select('item_id', { count: 'exact', head: true })

      if (mounted) setCount(error ? null : (low ?? 0))
    }
    void load()
    return () => { mounted = false }
  }, [])

  if (count === null) return null

  if (count === 0) {
    return (
      <div className="home-all-clear">
        <strong>✓ Inventory stock levels look good</strong>
        <small>No active items are at or below their low-stock level.</small>
      </div>
    )
  }

  return (
    <Link href="/inventory">
      <strong>📦 {count} inventory item{count === 1 ? ' is' : 's are'} running low</strong>
      <small>Open Inventory →</small>
    </Link>
  )
}
