import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  RESTAURANT_COOKIE, SELLER_COOKIE,
  verifyRestaurantToken, verifySellerToken,
} from '@/lib/session'

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  try {
    if (pathname.startsWith('/seller')) {
      const token = req.cookies.get(SELLER_COOKIE)?.value
      if (!token || !(await verifySellerToken(token))) {
        return NextResponse.redirect(new URL('/seller-login', req.url))
      }
    }

    if (pathname.startsWith('/dashboard')) {
      const token = req.cookies.get(RESTAURANT_COOKIE)?.value
      if (!token || !(await verifyRestaurantToken(token))) {
        return NextResponse.redirect(new URL('/restaurant-login', req.url))
      }
    }
  } catch {
    // Fail secure: if SESSION_SECRET is missing or token parse fails, block access
    if (pathname.startsWith('/seller'))    return NextResponse.redirect(new URL('/seller-login',     req.url))
    if (pathname.startsWith('/dashboard')) return NextResponse.redirect(new URL('/restaurant-login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/seller/:path*', '/dashboard/:path*'],
}
