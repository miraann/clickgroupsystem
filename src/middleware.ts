import { NextResponse, type NextRequest } from 'next/server'
import {
  verifyRestaurantToken, RESTAURANT_COOKIE,
  verifySellerToken, SELLER_COOKIE,
} from '@/lib/session'

/**
 * Server-side gate for the authenticated areas. This blocks navigation to the
 * dashboard / seller panel without a valid signed cookie. It is NOT sufficient
 * on its own — data access must also be protected by Supabase RLS (see the
 * production RLS migration). Client-side <AuthGuard> components remain, but for
 * UX (spinners / redirects) only.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/dashboard')) {
    const token = req.cookies.get(RESTAURANT_COOKIE)?.value
    if (!token || !(await verifyRestaurantToken(token))) {
      const url = req.nextUrl.clone()
      url.pathname = '/restaurant-login'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  if (pathname.startsWith('/seller') && pathname !== '/seller-login') {
    const token = req.cookies.get(SELLER_COOKIE)?.value
    if (!token || !(await verifySellerToken(token))) {
      const url = req.nextUrl.clone()
      url.pathname = '/seller-login'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/seller/:path*'],
}
