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
      { label: 'Learning', comingSoon: true },
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
      { label: 'Student Progress', comingSoon: true },
    ],
  },
  {
    label: 'Staff',
    icon: '🧑‍💼',
    routes: ['/team', '/staff'],
    links: [
      { href: '/team', label: 'Team & Schedule' },
      { href: '/staff', label: 'Account Access', adminOnly: true },
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
      { label: 'Learning Hub', description: 'Assignments, typing, reading, writing, grammar, and printable work.', comingSoon: true },
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
      { label: 'Student Progress Reports', description: 'Learning and academic progress reports will live here.', comingSoon: true },
    ],
  },
  {
    label: 'Staff',
    icon: '🧑‍💼',
    description: 'Team schedules and account access',
    items: [
      { href: '/team', label: 'Team & Scheduling', description: 'Staff, interns, volunteers, weekly schedules, and program assignments.' },
      { href: '/staff', label: 'Account Access', description: 'Approve Juanita Hub accounts and manage staff login access.', adminOnly: true },
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
      setOpenGroup(null)
      setMobileOpen(false)
      return
    }

    const currentGroup = navGroups.find((group) => currentItemHref(visibleItems(group)) !== null)
    if (currentGroup) setOpenGroup(currentGroup.label)
    setMobileOpen(false)
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
    pathname.startsWith('/register') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/forgot-password')
  ) {
    return null
  }

  if (!access.active) return null

  function toggleGroup(label: string) {
    setOpenGroup((current) => current === label ? null : label)
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

        <aside id="juanita-navigation-drawer" className={`jh-sidebar ${mobileOpen ? 'open' : ''}`}>
          <div className="jh-sidebar-header">
            <Link className="jh-brand" href="/" onClick={closeMobile} aria-label="Juanita Hub home">
              <span className="jh-brand-mark" aria-hidden="true">JH</span>
              <span><strong>Juanita Hub</strong><small>Community Center</small></span>
            </Link>
            <button className="jh-sidebar-close" type="button" onClick={closeMobile} aria-label="Close navigation">×</button>
          </div>

          <div className="jh-sidebar-body">
            <Link
              className={`jh-home-link ${pathname === '/' ? 'active' : ''}`}
              href="/"
              aria-current={pathname === '/' ? 'page' : undefined}
              onClick={closeMobile}
            >
              <span className="jh-section-icon" aria-hidden="true">⌂</span>
              <span><strong>Home</strong><small>Today’s dashboard and quick actions</small></span>
            </Link>

            <div className="jh-section-list">
              {navGroups.map((group) => {
                const items = visibleItems(group)
                if (items.length === 0) return null

                const activeHref = currentItemHref(items)
                const active = activeHref !== null
                const isOpen = openGroup === group.label
                const sectionId = `jh-section-${group.label.toLowerCase().replace(/\s+/g, '-')}`

                return (
                  <section className={`jh-nav-section ${active ? 'active' : ''} ${isOpen ? 'open' : ''}`} key={group.label}>
                    <button
                      type="button"
                      className="jh-section-trigger"
                      aria-expanded={isOpen}
                      aria-controls={sectionId}
                      onClick={() => toggleGroup(group.label)}
                    >
                      <span className="jh-section-icon" aria-hidden="true">{group.icon}</span>
                      <span className="jh-section-copy"><strong>{group.label}</strong><small>{group.description}</small></span>
                      <span className="jh-section-chevron" aria-hidden="true">⌄</span>
                    </button>

                    {isOpen && (
                      <div className="jh-section-items" id={sectionId}>
                        {items.map((item) => {
                          if (item.comingSoon || !item.href) {
                            return (
                              <div className="jh-nav-item disabled" key={item.label}>
                                <span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span>
                                <span className="jh-coming-soon">Soon</span>
                              </div>
                            )
                          }

                          const current = activeHref === item.href
                          return (
                            <Link
                              className={`jh-nav-item ${current ? 'active' : ''}`}
                              href={item.href}
                              key={item.href}
                              aria-current={current ? 'page' : undefined}
                              onClick={closeMobile}
                            >
                              <span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span>
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          </div>

          <div className="jh-sidebar-footer">
            <Link className="jh-kiosk-link" href="/kiosk" onClick={closeMobile}>
              <span aria-hidden="true">☺</span>
              <span><strong>Launch Sign-In Kiosk</strong><small>Open the child and visitor sign-in screen</small></span>
            </Link>
            <div className="jh-role-row">
              <span className="jh-role-dot" aria-hidden="true" />
              <span>Signed in as <strong>{access.role === 'admin' ? 'Admin' : 'Staff'}</strong></span>
            </div>
          </div>
        </aside>
      </nav>

      {mobileOpen && <button className="jh-nav-overlay" type="button" onClick={closeMobile} aria-label="Close navigation" />}

      {workspace && (
        <nav className="jh-workspace-bar" aria-label={workspace.label + ' workspace sections'}>
          <div className="jh-workspace-title"><span aria-hidden="true">{workspace.icon}</span><strong>{workspace.label}</strong></div>
          <div className="jh-workspace-links">
            {workspaceLinks.map((item) => {
              if (!item.href || item.comingSoon) return <span className="jh-workspace-link disabled" key={item.label}>{item.label}<small>Soon</small></span>
              const active = pathname === item.href || pathname.startsWith(item.href + '/')
              return <Link className={`jh-workspace-link ${active ? 'active' : ''}`} href={item.href} key={item.href} aria-current={active ? 'page' : undefined}>{item.label}</Link>
            })}
          </div>
        </nav>
      )}

      <DailyCardNotes />
    </>
  )
}
