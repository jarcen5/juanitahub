import type { Metadata } from 'next'
import SiteNavigation from '@/components/SiteNavigation'
import './globals.css'

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
