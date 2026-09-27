'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function PurchasingAttentionTask() {
  const [counts, setCounts] = useState<{ approvals: number; receiving: number } | null>(null)

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) {
        if (mounted) setCounts(null)
        return
      }

      const { data: profile } = await supabase
        .from('staff_profiles')
        .select('role,active')
        .eq('user_id', userId)
        .maybeSingle()

      if (!profile?.active || profile.role !== 'admin') {
        if (mounted) setCounts(null)
        return
      }

      const [approvalResult, orderedResult] = await Promise.all([
        supabase.from('purchase_requests').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_approval'),
        supabase.from('purchase_requests').select('id', { count: 'exact', head: true }).eq('status', 'ordered'),
      ])

      if (!mounted) return
      if (approvalResult.error || orderedResult.error) setCounts(null)
      else setCounts({ approvals: approvalResult.count ?? 0, receiving: orderedResult.count ?? 0 })
    }

    void load()
    return () => { mounted = false }
  }, [])

  if (!counts) return null
  if (counts.approvals === 0 && counts.receiving === 0) {
    return <div className="home-all-clear"><strong>✓ Purchasing workflow is caught up</strong><small>No requests are awaiting approval or receipt.</small></div>
  }

  return (
    <Link href="/purchasing">
      <strong>💳 {counts.approvals > 0 ? `${counts.approvals} purchase ${counts.approvals === 1 ? 'request needs' : 'requests need'} approval` : `${counts.receiving} order${counts.receiving === 1 ? ' is' : 's are'} waiting to be received`}</strong>
      <small>{counts.approvals > 0 && counts.receiving > 0 ? `${counts.receiving} ordered purchase${counts.receiving === 1 ? '' : 's'} also waiting for receipt • ` : ''}Open Budgets & Purchasing →</small>
    </Link>
  )
}
