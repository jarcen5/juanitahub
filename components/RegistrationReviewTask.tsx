'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function RegistrationReviewTask() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) {
        if (mounted) setCount(null)
        return
      }

      const { data: profile } = await supabase.from('staff_profiles').select('role,active').eq('user_id', userId).maybeSingle()
      if (!profile?.active || profile.role !== 'admin') {
        if (mounted) setCount(null)
        return
      }

      const { count: pending, error } = await supabase
        .from('registration_submissions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['submitted', 'needs_review'])

      if (mounted) setCount(error ? null : (pending ?? 0))
    }
    void load()
    return () => { mounted = false }
  }, [])

  if (count === null) return null
  if (count === 0) return <div className="home-all-clear"><strong>✓ Registrations are caught up</strong><small>No submissions are waiting for admin review.</small></div>

  return (
    <Link href="/registrations">
      <strong>📝 {count} registration {count === 1 ? 'submission needs' : 'submissions need'} review</strong>
      <small>Open Registration Center →</small>
    </Link>
  )
}
