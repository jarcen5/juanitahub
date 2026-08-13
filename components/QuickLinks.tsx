'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function QuickLinks() {
  const pathname = usePathname()
  const [active, setActive] = useState(false)

  useEffect(() => {
    let mounted = true
    async function checkAccess() {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) {
        if (mounted) setActive(false)
        return
      }
      const { data } = await supabase.from('staff_profiles').select('active').eq('user_id', userId).maybeSingle()
      if (mounted) setActive(Boolean(data?.active))
    }
    void checkAccess()
    const { data: listener } = supabase.auth.onAuthStateChange(() => void checkAccess())
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (!active || pathname.startsWith('/rewards')) return null

  return (
    <a
      href="/rewards"
      style={{
        position: 'fixed',
        left: 18,
        bottom: 18,
        zIndex: 50,
        background: '#3157d5',
        color: 'white',
        textDecoration: 'none',
        borderRadius: 999,
        padding: '11px 15px',
        fontWeight: 750,
        fontSize: 14,
        boxShadow: '0 8px 24px rgba(16,24,40,.2)',
      }}
    >
      Reward Center
    </a>
  )
}
