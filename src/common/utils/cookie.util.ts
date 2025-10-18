import { Response } from 'express';

/**
 * Get cookie domain based on environment configuration
 * - Development: Uses 'localhost' to work across different ports
 * - Production: Uses COOKIE_DOMAIN env var (e.g., '.example.com' for subdomain sharing)
 */
function getCookieDomain(): string | undefined {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    return 'localhost';
  }

  // In production, use COOKIE_DOMAIN if set, otherwise undefined (browser default)
  const cookieDomain = process.env.COOKIE_DOMAIN;
  return cookieDomain || undefined;
}

/**
 * Set authentication tokens as HTTP-only cookies
 * SECURITY: Tokens are never accessible via JavaScript (XSS protection)
 */
export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieDomain = getCookieDomain();

  // Access Token Cookie - Less restrictive for general API access
  res.cookie('accessToken', accessToken, {
    httpOnly: true, // Cannot be accessed via JavaScript
    secure: isProduction, // HTTPS only in production
    sameSite: 'lax', // Allow cross-site GET requests (OAuth redirects)
    domain: cookieDomain, // Configurable domain for multi-subdomain support
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
  });

  // Refresh Token Cookie - More restrictive for sensitive operations
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true, // Cannot be accessed via JavaScript
    secure: isProduction, // HTTPS only in production
    sameSite: 'strict', // Never sent on cross-site requests (CSRF protection)
    domain: cookieDomain, // Configurable domain for multi-subdomain support
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

/**
 * Clear authentication cookies on logout
 */
export function clearAuthCookies(res: Response): void {
  const cookieDomain = getCookieDomain();

  res.clearCookie('accessToken', {
    domain: cookieDomain,
    path: '/',
  });

  res.clearCookie('refreshToken', {
    domain: cookieDomain,
    path: '/',
  });
}
