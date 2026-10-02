import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const MODE_COOKIE = 'juanita-device-mode'

function isModePath(pathname: string, mode: 'kiosk' | 'learning') {
  const root = mode === 'kiosk' ? '/kiosk' : '/learn'
  return pathname === root || pathname.startsWith(root + '/')
}

export function proxy(request: NextRequest) {
  const mode = request.cookies.get(MODE_COOKIE)?.value

  if (mode !== 'kiosk' && mode !== 'learning') {
    return NextResponse.next()
  }

  if (isModePath(request.nextUrl.pathname, mode)) {
    return NextResponse.next()
  }

  const destination = request.nextUrl.clone()
  destination.pathname = mode === 'kiosk' ? '/kiosk' : '/learn'
  return NextResponse.redirect(destination)
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
