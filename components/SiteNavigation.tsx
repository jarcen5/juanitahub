'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DailyCardNotes from '@/components/DailyCardNotes'

type AccessState = {
  active: boolean
  role: 'staff' | 'admin' | null
}

export default function SiteNavigation() {
  const pathname = usePathname()
  const [access, setAccess] = useState<AccessState>({ active: false, role: null })

  useEffect(() => {
    let mounted = true

    async function loadAccess() {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id

      if (!userId) {
        if (mounted) setAccess({ active: false, role: null })
        return
      }

      const { data } = await supabase
        .from('staff_profiles')
        .select('active, role')
        .eq('user_id', userId)
        .maybeSingle()

      if (mounted) {
        setAccess({
          active: Boolean(data?.active),
          role: data?.role === 'admin' || data?.role === 'staff' ? data.role : null,
        })
      }
    }

    void loadAccess()
    const { data: listener } = supabase.auth.onAuthStateChange(() => void loadAccess())

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (!access.active) return null

  const links = [
    { href: '/', label: 'Dashboard', adminOnly: false },
    { href: '/missed-cards', label: 'Missed Cards', adminOnly: false },
    { href: '/rewards', label: 'Reward Center', adminOnly: false },
    { href: '/rewards/free', label: 'Free Spins', adminOnly: false },
    { href: '/rewards/test', label: 'Test Mode', adminOnly: false },
    { href: '/rewards/manage', label: 'Prize Management', adminOnly: true },
    { href: '/staff', label: 'Staff Management', adminOnly: true },
  ]

  function isCurrent(href: string) {
    if (href === '/') return pathname === '/'
    return pathname === href
  }

  return (
    <>
      <nav
        aria-label="Juanita Hub site navigation"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 18px',
          overflowX: 'auto',
          background: '#111827',
          borderBottom: '1px solid rgba(255,255,255,.12)',
          boxShadow: '0 2px 12px rgba(16,24,40,.14)',
        }}
      >
        <Link
          href="/"
          style={{
            flex: '0 0 auto',
            color: 'white',
            textDecoration: 'none',
            fontWeight: 850,
            fontSize: 18,
            marginRight: 8,
          }}
        >
          Juanita Hub
        </Link>

        {links
          .filter((link) => !link.adminOnly || access.role === 'admin')
          .map((link) => {
            const current = isCurrent(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? 'page' : undefined}
                style={{
                  flex: '0 0 auto',
                  color: current ? '#111827' : '#f8fafc',
                  background: current ? 'white' : 'transparent',
                  border: '1px solid rgba(255,255,255,.2)',
                  borderRadius: 999,
                  padding: '8px 12px',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {link.label}
              </Link>
            )
          })}
      </nav>
      <DailyCardNotes />
    </>
  )
}
