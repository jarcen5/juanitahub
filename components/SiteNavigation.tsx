'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DailyCardNotes from '@/components/DailyCardNotes'

type AccessState = {
  active: boolean
  role: 'staff' | 'admin' | null
}

type NavItem = {
  href?: string
  label: string
  description?: string
  adminOnly?: boolean
  comingSoon?: boolean
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      {
        href: '/calendar',
        label: 'Calendar',
        description: 'Center activities, trips, meetings, closures, and special events.',
      },
      {
        href: '/attendance',
        label: 'Attendance',
        description: 'Daily child and community sign-ins with saved records.',
      },
      {
        href: '/programs',
        label: 'Programs & Enrollments',
        description: 'Create programs, choose registration paths, and manage participant rosters.',
      },
      {
        href: '/card-tracking',
        label: 'Card Tracking',
        description: 'Daily behavior cards, statuses, summaries, and child history.',
      },
      {
        href: '/missed-cards',
        label: 'Missed Cards',
        description: 'Backfill a card or status from a previous day.',
      },
      {
        href: '/reports/attendance',
        label: 'Attendance Reports',
        description: 'Monthly sign-in totals, averages, and CSV exports.',
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        href: '/children',
        label: 'Children & Registrations',
        description: 'Search child profiles, registrations, birthdays, school, grade, and protected information.',
      },
      {
        href: '/households',
        label: 'Households',
        description: 'Group siblings and maintain shared family contacts without duplicating child profiles.',
      },
    ],
  },
  {
    label: 'Rewards',
    items: [
      {
        href: '/rewards',
        label: 'Reward Center',
        description: 'Use monthly earned spins and shared prize inventory.',
      },
      {
        href: '/rewards/free',
        label: 'Free Spins',
        description: 'Award a bonus spin without using monthly spins.',
      },
      {
        href: '/rewards/test',
        label: 'Test Mode',
        description: 'Practice the wheel without changing real records.',
      },
      {
        href: '/rewards/manage',
        label: 'Prize Management',
        description: 'Rename, review, or remove prize items.',
        adminOnly: true,
      },
    ],
  },
  {
    label: 'Admin',
    items: [
      {
        href: '/staff',
        label: 'Staff Management',
        description: 'Approve accounts and manage staff access.',
        adminOnly: true,
      },
    ],
  },
]

export default function SiteNavigation() {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement | null>(null)
  const [access, setAccess] = useState<AccessState>({ active: false, role: null })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)

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

  function closeMenus() {
    setOpenGroup(null)
    setMobileOpen(false)
  }

  useEffect(() => {
    closeMenus()
  }, [pathname])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenGroup(null)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenGroup(null)
        setMobileOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  if (pathname.startsWith('/kiosk') || pathname.startsWith('/reset-password') || pathname.startsWith('/forgot-password')) return null
  if (!access.active) return null

  function routeMatches(href?: string) {
    if (!href) return false
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  function visibleItems(group: NavGroup) {
    return group.items.filter((item) => !item.adminOnly || access.role === 'admin')
  }

  function currentItemHref(items: NavItem[]) {
    return items
      .filter((item) => item.href && routeMatches(item.href))
      .map((item) => item.href as string)
      .sort((a, b) => b.length - a.length)[0] ?? null
  }

  function groupIsCurrent(group: NavGroup) {
    return currentItemHref(group.items) !== null
  }

  function toggleGroup(label: string) {
    setOpenGroup((current) => current === label ? null : label)
  }

  return (
    <>
      <nav ref={navRef} className="site-nav" aria-label="Juanita Hub site navigation">
        <div className="site-nav-inner">
          <Link className="site-nav-brand" href="/" aria-label="Juanita Hub dashboard" onClick={closeMenus}>
            <span className="site-nav-mark" aria-hidden="true">JH</span>
            <span>
              <strong>Juanita Hub</strong>
              <small>Community Center Operations</small>
            </span>
          </Link>

          <button
            className="site-nav-toggle"
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="juanita-site-menu"
            onClick={() => {
              setOpenGroup(null)
              setMobileOpen((open) => !open)
            }}
          >
            <span className="site-nav-toggle-lines" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>{mobileOpen ? 'Close' : 'Menu'}</span>
          </button>

          <div id="juanita-site-menu" className={`site-nav-menu ${mobileOpen ? 'open' : ''}`}>
            <Link href="/" className={`site-nav-link ${pathname === '/' ? 'active' : ''}`} aria-current={pathname === '/' ? 'page' : undefined} onClick={closeMenus}>
              Dashboard
            </Link>

            {navGroups.map((group) => {
              const items = visibleItems(group)
              if (items.length === 0) return null
              const active = groupIsCurrent({ ...group, items })
              const activeHref = currentItemHref(items)
              const isOpen = openGroup === group.label
              const groupId = `nav-group-${group.label.toLowerCase().replace(/\s+/g, '-')}`

              return (
                <div className={`site-nav-group ${active ? 'active' : ''} ${isOpen ? 'open' : ''}`} key={group.label}>
                  <button type="button" className="site-nav-group-trigger" aria-expanded={isOpen} aria-controls={groupId} onClick={() => toggleGroup(group.label)}>
                    <span>{group.label}</span>
                    <span className="site-nav-chevron" aria-hidden="true">⌄</span>
                  </button>

                  {isOpen && (
                    <div className="site-nav-dropdown" id={groupId}>
                      {items.map((item) => {
                        if (item.comingSoon || !item.href) {
                          return (
                            <div className="site-nav-dropdown-item coming-soon" key={item.label}>
                              <span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span>
                              <span className="site-nav-soon">Coming soon</span>
                            </div>
                          )
                        }

                        const current = activeHref === item.href
                        return (
                          <Link className={`site-nav-dropdown-item ${current ? 'active' : ''}`} href={item.href} key={item.href} aria-current={current ? 'page' : undefined} onClick={closeMenus}>
                            <span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            <span className="site-nav-role" title="Current Juanita Hub role">{access.role === 'admin' ? 'Admin' : 'Staff'}</span>
          </div>
        </div>
      </nav>
      <DailyCardNotes />
    </>
  )
}
