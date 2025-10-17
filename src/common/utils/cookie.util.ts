import { Response } from 'express';

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

  // Access Token Cookie - Less restrictive for general API access
  res.cookie('accessToken', accessToken, {
    httpOnly: true, // Cannot be accessed via JavaScript
    secure: isProduction, // HTTPS only in production
    sameSite: 'lax', // Allow cross-site GET requests (OAuth redirects)
    domain: isProduction ? undefined : 'localhost', // Share across localhost ports in dev
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
  });

  // Refresh Token Cookie - More restrictive for sensitive operations
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true, // Cannot be accessed via JavaScript
    secure: isProduction, // HTTPS only in production
    sameSite: 'strict', // Never sent on cross-site requests (CSRF protection)
    domain: isProduction ? undefined : 'localhost', // Share across localhost ports in dev
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

/**
 * Clear authentication cookies on logout
 */
export function clearAuthCookies(res: Response): void {
  const isProduction = process.env.NODE_ENV === 'production';

  res.clearCookie('accessToken', {
    domain: isProduction ? undefined : 'localhost',
    path: '/',
  });

  res.clearCookie('refreshToken', {
    domain: isProduction ? undefined : 'localhost',
    path: '/',
  });
}
