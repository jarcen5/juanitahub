'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AdminShortcut() {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let mounted = true

    async function checkAdmin() {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) {
        if (mounted) setIsAdmin(false)
        return
      }

      const { data } = await supabase
        .from('staff_profiles')
        .select('role, active')
        .eq('user_id', userId)
        .maybeSingle()

      if (mounted) setIsAdmin(Boolean(data?.active && data?.role === 'admin'))
    }

    void checkAdmin()

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void checkAdmin()
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (!isAdmin) return null

  const onStaffPage = pathname.startsWith('/staff')

  return (
    <a
      href={onStaffPage ? '/' : '/staff'}
      style={{
        position: 'fixed',
        right: 18,
        bottom: 18,
        zIndex: 50,
        background: '#172033',
        color: 'white',
        textDecoration: 'none',
        borderRadius: 999,
        padding: '11px 15px',
        fontWeight: 750,
        fontSize: 14,
        boxShadow: '0 8px 24px rgba(16,24,40,.2)',
      }}
    >
      {onStaffPage ? '← Back to Juanita Hub' : 'Staff management'}
    </a>
  )
}
