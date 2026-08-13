'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function RewardSetupOpener() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname.startsWith('/rewards')) return
    const details = document.getElementById('reward-setup') as HTMLDetailsElement | null
    if (details) details.open = true
  }, [pathname])

  return null
}
