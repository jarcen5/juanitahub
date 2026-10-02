import type { Metadata } from 'next'
import SiteNavigation from '@/components/SiteNavigation'
import './globals.css'
import './redesign.css'
import './attendance.css'
import './attendance-live.css'
import './kiosk-polish.css'
import './nav-fixes.css'
import './dashboard-home.css'
import './kiosk.css'
import './kiosk-board.css'
import './auth-recovery.css'
import './reports.css'
import './calendar.css'
import './children.css'
import './children-expanded.css'
import './child-learning.css'
import './programs-households.css'
import './announcements.css'
import './registration-admin.css'
import './reward-fulfillment.css'
import './rewards-workspace.css'
import './task-center.css'
import './team.css'
import './inventory.css'
import './learning.css'
import './purchasing.css'
import './organization-shell.css'
import './theme.css'

const themeInitScript = "(function(){try{var p=location.pathname;var lightOnly=p.indexOf('/kiosk')===0||p==='/learn'||p.indexOf('/learn/')===0||p.indexOf('/register')===0||p.indexOf('/reset-password')===0||p.indexOf('/forgot-password')===0;var pref=localStorage.getItem('juanita-theme');if(pref!=='light'&&pref!=='dark'&&pref!=='system')pref='system';var dark=!lightOnly&&(pref==='dark'||(pref==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches));var resolved=dark?'dark':'light';document.documentElement.dataset.theme=resolved;document.documentElement.dataset.themePreference=pref;document.documentElement.style.colorScheme=resolved;}catch(e){}})();"

export const metadata: Metadata = {
  title: 'Juanita Hub',
  description: 'Community center operations, attendance, behavior, rewards, and reporting for JSCLC staff.'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body>
        <SiteNavigation />
        {children}
      </body>
    </html>
  )
}
