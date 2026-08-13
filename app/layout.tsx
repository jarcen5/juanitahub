import type { Metadata } from 'next'
import AdminShortcut from '@/components/AdminShortcut'
import QuickLinks from '@/components/QuickLinks'
import RewardTestShortcut from '@/components/RewardTestShortcut'
import './globals.css'

export const metadata: Metadata = {
  title: 'Juanita Hub',
  description: 'Behavior tracking and monthly rewards dashboard for JSCLC staff.'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <QuickLinks />
        <RewardTestShortcut />
        <AdminShortcut />
      </body>
    </html>
  )
}
