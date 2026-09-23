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
import './programs-households.css'
import './registration-admin.css'
import './reward-fulfillment.css'
import './task-center.css'

export const metadata: Metadata = {
  title: 'Juanita Hub',
  description: 'Community center operations, attendance, behavior, rewards, and reporting for JSCLC staff.'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteNavigation />
        {children}
      </body>
    </html>
  )
}
