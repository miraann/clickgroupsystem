import { NextResponse, type NextRequest } from 'next/server'

// Auth guards are disabled until login flow is built.
// Re-enable by restoring Supabase session checks here.
export function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/seller/:path*', '/dashboard/:path*'],
}
