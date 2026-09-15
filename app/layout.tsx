import type { Metadata } from 'next'
import SiteNavigation from '@/components/SiteNavigation'
import './globals.css'
import './redesign.css'
import './attendance.css'
import './kiosk-polish.css'
import './nav-fixes.css'
import './dashboard-home.css'
import './kiosk.css'
import './kiosk-board.css'
import './auth-recovery.css'

export const metadata: Metadata = {
  title: 'Juanita Hub',
  description: 'Behavior tracking and monthly rewards dashboard for JSCLC staff.'
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
