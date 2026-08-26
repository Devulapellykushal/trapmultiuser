/**
 * Next.js Middleware for Route Protection
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Routes that don't require authentication (marketing + auth)
const publicRoutes = ['/', '/login', '/signup', '/forgot-password', '/reset-password'];

/** Dashboard segments that live under `/admin/*` (legacy `/foo` → `/admin/foo`). */
const ADMIN_LEGACY_PREFIXES = [
  'inventory',
  'invoices',
  'reports',
  'customers',
  'settings',
  'warehouses',
  'stores',
  'users',
  'analytics',
  'credit-sales',
  'debit-credit-notes',
  'purchase-orders',
] as const;

// Check if the path is a public route
function isPublicRoute(pathname: string): boolean {
  if (pathname === '/') return true;
  return publicRoutes.some((route) => route !== '/' && pathname.startsWith(route));
}

// Check if the path is a static asset
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') // Files with extensions (images, etc.)
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  if (pathname === '/next' || pathname.startsWith('/next/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const adminBase = '/admin';
  if (
    !pathname.startsWith(adminBase) &&
    pathname !== '/' &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/signup') &&
    !pathname.startsWith('/forgot-password') &&
    !pathname.startsWith('/reset-password') &&
    !pathname.startsWith('/pos') &&
    !pathname.startsWith('/design-system')
  ) {
    const firstSegment = pathname.split('/').filter(Boolean)[0];
    if (
      firstSegment &&
      ADMIN_LEGACY_PREFIXES.includes(
        firstSegment as (typeof ADMIN_LEGACY_PREFIXES)[number],
      )
    ) {
      const url = request.nextUrl.clone();
      url.pathname = `${adminBase}${pathname}`;
      return NextResponse.redirect(url);
    }
  }

  // Allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for auth token in cookies or localStorage proxy header
  // Note: We can't access localStorage in middleware, so we use a cookie
  const token = request.cookies.get('Quake_access_token')?.value;

  // For client-side auth check, we'll handle this in the layout
  // Middleware just ensures the route can be accessed
  // The actual auth check happens client-side via useAuth

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
