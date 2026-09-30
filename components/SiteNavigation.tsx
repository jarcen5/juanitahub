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
  icon: string
  description: string
  items: NavItem[]
}

type WorkspaceLink = {
  href?: string
  label: string
  adminOnly?: boolean
  comingSoon?: boolean
}

type WorkspaceDefinition = {
  label: string
  icon: string
  routes: string[]
  links: WorkspaceLink[]
}

const workspaceDefinitions: WorkspaceDefinition[] = [
  {
    label: 'Students',
    icon: '👥',
    routes: ['/children', '/attendance', '/card-tracking', '/missed-cards', '/households'],
    links: [
      { href: '/children', label: 'Directory' },
      { href: '/attendance', label: 'Attendance' },
      { href: '/card-tracking', label: 'Behavior' },
      { href: '/missed-cards', label: 'Missed Cards' },
      { href: '/households', label: 'Households' },
      { href: '/learning', label: 'Learning' },
    ],
  },
  {
    label: 'Learning',
    icon: '📘',
    routes: ['/learning'],
    links: [
      { href: '/learning', label: 'Learning Hub' },
    ],
  },
  {
    label: 'Programs',
    icon: '🗓️',
    routes: ['/programs', '/calendar', '/registrations'],
    links: [
      { href: '/programs', label: 'Programs' },
      { href: '/calendar', label: 'Calendar' },
      { href: '/registrations', label: 'Registration', adminOnly: true },
    ],
  },
  {
    label: 'Rewards',
    icon: '🎁',
    routes: ['/rewards'],
    links: [
      { href: '/rewards#monthly', label: 'Monthly Spins' },
      { href: '/rewards#free', label: 'Free Spin' },
      { href: '/rewards#test', label: 'Test Wheel' },
      { href: '/rewards#setup', label: 'Prize Setup', adminOnly: true },
      { href: '/rewards#fulfillment', label: 'Fulfillment' },
    ],
  },
  {
    label: 'Operations',
    icon: '🛠️',
    routes: ['/tasks', '/inventory', '/purchasing'],
    links: [
      { href: '/tasks', label: 'Tasks' },
      { href: '/inventory', label: 'Inventory' },
      { href: '/purchasing', label: 'Purchasing', adminOnly: true },
    ],
  },
  {
    label: 'Reports',
    icon: '📊',
    routes: ['/reports'],
    links: [
      { href: '/reports/attendance', label: 'Attendance' },
      { href: '/reports/progress', label: 'Student Progress' },
    ],
  },
  {
    label: 'Staff',
    icon: '🧑‍💼',
    routes: ['/team', '/staff'],
    links: [
      { href: '/team', label: 'Team & Schedule' },
      { href: '/staff', label: 'Account Access', adminOnly: true },
      { href: '/staff/lab-devices', label: 'Lab Devices', adminOnly: true },
    ],
  },
]

const navGroups: NavGroup[] = [
  {
    label: 'Students',
    icon: '👥',
    description: 'Profiles, attendance, behavior, and families',
    items: [
      { href: '/children', label: 'Student Directory', description: 'Profiles, registrations, birthdays, school, grade, and protected information.' },
      { href: '/attendance', label: 'Attendance', description: 'Daily child and community sign-ins with saved records.' },
      { href: '/card-tracking', label: 'Behavior Cards', description: 'Daily behavior cards, statuses, summaries, and child history.' },
      { href: '/missed-cards', label: 'Missed Cards', description: 'Backfill a card or status from a previous day.' },
      { href: '/households', label: 'Households', description: 'Group siblings and maintain shared family contacts.' },
    ],
  },
  {
    label: 'Learning',
    icon: '📘',
    description: 'Weekly assignments and academic progress',
    items: [
      { href: '/learning', label: 'Learning Hub', description: 'Weekly assignments, reading, staff notes, and the growing academic toolkit.' },
    ],
  },
  {
    label: 'Programs',
    icon: '🗓️',
    description: 'Programs, enrollment, registration, and calendar',
    items: [
      { href: '/programs', label: 'Programs & Enrollments', description: 'Create programs, choose registration paths, and manage participant rosters.' },
      { href: '/calendar', label: 'Center Calendar', description: 'Activities, trips, meetings, closures, and special events.' },
      { href: '/registrations', label: 'Registration Center', description: 'Publish forms, create renewal links, and review family submissions.', adminOnly: true },
    ],
  },
  {
    label: 'Rewards',
    icon: '🎁',
    description: 'Points, spins, prizes, and fulfillment',
    items: [
      { href: '/rewards', label: 'Reward Center', description: 'Monthly spins, free spins, real-wheel testing, prize setup, chances, and fulfillment in one workspace.' },
    ],
  },
  {
    label: 'Operations',
    icon: '🛠️',
    description: 'Daily tasks, supplies, and purchasing',
    items: [
      { href: '/tasks', label: 'Task Center', description: 'Assigned work, personal to-dos, and live items that still need attention.' },
      { href: '/inventory', label: 'Inventory', description: 'Supplies, equipment, locations, stock levels, and movement history.' },
      { href: '/purchasing', label: 'Budgets & Purchasing', description: 'Budgets, approvals, orders, receiving, and spending history.', adminOnly: true },
    ],
  },
  {
    label: 'Reports',
    icon: '📊',
    description: 'Progress, attendance, and center reporting',
    items: [
      { href: '/reports/attendance', label: 'Attendance Reports', description: 'Monthly sign-in totals, averages, and CSV exports.' },
      { href: '/reports/progress', label: 'Student Progress Reports', description: 'Learning progress, skill results, staff feedback, and printable student reports.' },
    ],
  },
  {
    label: 'Staff',
    icon: '🧑‍💼',
    description: 'Team schedules and account access',
    items: [
      { href: '/team', label: 'Team & Scheduling', description: 'Staff, interns, volunteers, weekly schedules, and program assignments.' },
      { href: '/staff', label: 'Account Access', description: 'Approve Juanita Hub accounts and manage staff login access.', adminOnly: true },
      { href: '/staff/lab-devices', label: 'Lab Devices', description: 'Manage activated Student Learning computers and revoke access.', adminOnly: true },
    ],
  },
]

export default function SiteNavigation() {
  const pathname = usePathname()
  const [locationHash, setLocationHash] = useState('')
  const navRef = useRef<HTMLElement | null>(null)
  const [access, setAccess] = useState<AccessState>({ active: false, role: null })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [learningReviewCount, setLearningReviewCount] = useState(0)

  useEffect(() => {
    function syncHash() { setLocationHash(window.location.hash.replace('#', '')) }
    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [pathname])

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

  useEffect(() => {
    if (!access.active) {
      setLearningReviewCount(0)
      return
    }

    let mounted = true
    async function loadReviewCount() {
      const [writing, reading, goals] = await Promise.all([
        supabase.from('learning_writing_submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
        supabase.from('learning_reading_attempts').select('id', { count: 'exact', head: true }).eq('review_status', 'pending'),
        supabase.from('learning_goals').select('id', { count: 'exact', head: true }).eq('status', 'reached'),
      ])
      if (mounted) setLearningReviewCount(Number(writing.count ?? 0) + Number(reading.count ?? 0) + Number(goals.count ?? 0))
    }

    void loadReviewCount()
    const refresh = () => void loadReviewCount()
    window.addEventListener('juanita-learning-review-updated', refresh)
    return () => {
      mounted = false
      window.removeEventListener('juanita-learning-review-updated', refresh)
    }
  }, [access.active, pathname])

  function routeMatches(href?: string) {
    if (!href) return false
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  function visibleItems(group: NavGroup) {
    return group.items.filter((item) => !item.adminOnly || access.role === 'admin')
  }

  const workspace = workspaceDefinitions.find((definition) =>
    definition.routes.some((route) => pathname === route || pathname.startsWith(route + '/')),
  )
  const workspaceLinks = workspace?.links.filter((item) => !item.adminOnly || access.role === 'admin') ?? []

  function currentItemHref(items: NavItem[]) {
    return items
      .filter((item) => item.href && routeMatches(item.href))
      .map((item) => item.href as string)
      .sort((a, b) => b.length - a.length)[0] ?? null
  }

  useEffect(() => {
    if (pathname === '/') {
      setMobileOpen(false)
      setSidebarExpanded(false)
      return
    }

    setMobileOpen(false)
    setSidebarExpanded(false)
    // access.role is intentionally included so admin-only routes can resolve after access loads.
  }, [pathname, access.role])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (mobileOpen && navRef.current && !navRef.current.contains(event.target as Node)) {
        setMobileOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileOpen])

  if (
    pathname.startsWith('/kiosk') ||
    (pathname === '/learn' || pathname.startsWith('/learn/')) ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/forgot-password')
  ) {
    return null
  }

  if (!access.active) return null

  function closeNavigation() {
    setMobileOpen(false)
    setSidebarExpanded(false)
  }

  function closeMobile() {
    setMobileOpen(false)
  }

  return (
    <>
      <nav ref={navRef} className="site-nav" aria-label="Juanita Hub navigation">
        <div className="jh-mobile-bar">
          <Link className="jh-mobile-brand" href="/" onClick={closeMobile} aria-label="Juanita Hub home">
            <span className="jh-brand-mark" aria-hidden="true">JH</span>
            <span><strong>Juanita Hub</strong><small>Staff workspace</small></span>
          </Link>
          <button
            className="jh-menu-button"
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="juanita-navigation-drawer"
            onClick={() => setMobileOpen((open) => !open)}
          >
            <span className="jh-menu-lines" aria-hidden="true"><span /><span /><span /></span>
            <span>{mobileOpen ? 'Close' : 'Menu'}</span>
          </button>
        </div>

        <aside id="juanita-navigation-drawer" className={`jh-sidebar ${sidebarExpanded ? 'expanded' : 'collapsed'} ${mobileOpen ? 'open' : ''}`}>
          <div className="jh-sidebar-header">
            <Link className="jh-brand" href="/" onClick={closeNavigation} aria-label="Juanita Hub home">
              <span className="jh-brand-mark" aria-hidden="true">JH</span>
              <span><strong>Juanita Hub</strong><small>Community Center</small></span>
            </Link>
            <button className="jh-sidebar-expand" type="button" onClick={() => setSidebarExpanded((value) => !value)} aria-label={sidebarExpanded ? 'Minimize navigation' : 'Expand navigation'} title={sidebarExpanded ? 'Minimize navigation' : 'Expand navigation'}>{sidebarExpanded ? '‹' : '›'}</button>
            <button className="jh-sidebar-close" type="button" onClick={closeMobile} aria-label="Close navigation">×</button>
          </div>

          <div className="jh-sidebar-body">
            <Link
              className={`jh-home-link ${pathname === '/' ? 'active' : ''}`}
              href="/"
              aria-current={pathname === '/' ? 'page' : undefined}
              onClick={closeNavigation}
              title="Home"
            >
              <span className="jh-section-icon" aria-hidden="true">⌂</span>
              <span><strong>Home</strong><small>Today’s dashboard and quick actions</small></span>
            </Link>

            <div className="jh-section-list">
              {navGroups.map((group) => {
                const items = visibleItems(group)
                const destination = items.find((item) => item.href)?.href
                if (!destination) return null

                const active = currentItemHref(items) !== null

                return (
                  <section className={`jh-nav-section ${active ? 'active' : ''}`} key={group.label}>
                    <Link
                      className="jh-section-trigger"
                      href={destination}
                      aria-current={active ? 'page' : undefined}
                      onClick={closeNavigation}
                      title={group.label}
                    >
                      <span className="jh-section-icon" aria-hidden="true">{group.icon}</span>
                      <span className="jh-section-copy"><strong>{group.label}{group.label === 'Learning' && learningReviewCount > 0 && <span className="jh-nav-count">{learningReviewCount}</span>}</strong><small>{group.description}</small></span>
                    </Link>
                  </section>
                )
              })}
            </div>
          </div>

          <div className="jh-sidebar-footer">
            <Link className="jh-kiosk-link" href="/kiosk" onClick={closeNavigation} title="Launch Sign-In Kiosk">
              <span aria-hidden="true">☺</span>
              <span><strong>Launch Sign-In Kiosk</strong><small>Open the child and visitor sign-in screen</small></span>
            </Link>
            <Link className="jh-kiosk-link" href="/learn" onClick={closeNavigation} title="Launch Student Learning">
              <span aria-hidden="true">🎓</span>
              <span><strong>Launch Student Learning</strong><small>Open Computer Lab Mode for individual student work</small></span>
            </Link>
            <div className="jh-role-row">
              <span className="jh-role-dot" aria-hidden="true" />
              <span>Signed in as <strong>{access.role === 'admin' ? 'Admin' : 'Staff'}</strong></span>
            </div>
          </div>
        </aside>
      </nav>

      {mobileOpen && <button className="jh-nav-overlay" type="button" onClick={closeMobile} aria-label="Close navigation" />}

      {workspace && workspaceLinks.length > 1 && (
        <nav className="jh-workspace-bar" aria-label={workspace.label + ' workspace sections'}>
          <div className="jh-workspace-title"><span aria-hidden="true">{workspace.icon}</span><strong>{workspace.label}</strong></div>
          <div className="jh-workspace-links">
            {workspaceLinks.map((item) => {
              if (!item.href || item.comingSoon) return <span className="jh-workspace-link disabled" key={item.label}>{item.label}<small>Soon</small></span>
              const hashIndex = item.href.indexOf('#')
              const itemBase = hashIndex >= 0 ? item.href.slice(0, hashIndex) : item.href
              const itemTab = hashIndex >= 0 ? item.href.slice(hashIndex + 1) : null
              const firstHashLink = workspaceLinks.find((link) => link.href?.includes('#'))?.href
              const defaultTab = firstHashLink?.split('#')[1] ?? ''
              const currentTab = locationHash || defaultTab
              const active = itemTab
                ? pathname === itemBase && currentTab === itemTab
                : pathname === item.href || pathname.startsWith(item.href + '/')

              if (itemTab) {
                return (
                  <a
                    className={`jh-workspace-link ${active ? 'active' : ''}`}
                    href={item.href}
                    key={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={(event) => {
                      if (pathname !== itemBase) return
                      event.preventDefault()
                      if (window.location.hash.replace('#', '') !== itemTab) {
                        window.location.hash = itemTab
                      } else {
                        window.dispatchEvent(new HashChangeEvent('hashchange'))
                      }
                      setLocationHash(itemTab)
                    }}
                  >
                    {item.label === 'Review' && learningReviewCount > 0 ? `Review (${learningReviewCount})` : item.label}
                  </a>
                )
              }

              return <Link className={`jh-workspace-link ${active ? 'active' : ''}`} href={item.href} key={item.href} aria-current={active ? 'page' : undefined}>{item.label}</Link>
            })}
          </div>
        </nav>
      )}

      <DailyCardNotes />
    </>
  )
}
