# HTTP-Only Cookie Authentication Migration Guide

## Overview

The API has migrated from Bearer token authentication to HTTP-only cookie authentication for improved security.

**Security Benefits:**
- ✅ XSS Protection: Cookies cannot be accessed by JavaScript
- ✅ CSRF Protection: SameSite cookie flags prevent cross-site attacks
- ✅ Automatic token management: No manual localStorage handling needed

---

## Breaking Changes

### Backend Changes (Completed)

1. **Authentication Method Changed**
   - ❌ OLD: JWT tokens sent via `Authorization: Bearer <token>` header
   - ✅ NEW: JWT tokens sent automatically via HTTP-only cookies

2. **Token Response Format Changed**
   - ❌ OLD: Tokens returned in response body
   ```json
   {
     "user": {...},
     "accessToken": "eyJhbG...",
     "refreshToken": "eyJhbG..."
   }
   ```
   - ✅ NEW: Tokens set as cookies, not in response body
   ```json
   {
     "user": {...}
   }
   ```

3. **Refresh Endpoint Changed**
   - ❌ OLD: `POST /auth/refresh` with body `{ "refreshToken": "..." }`
   - ✅ NEW: `POST /auth/refresh` with empty body (reads from cookie)

4. **OAuth Redirect Changed**
   - ❌ OLD: Redirects to `/auth/callback?success=true`
   - ✅ NEW: Redirects directly to `/dashboard`

---

## Frontend Migration Steps

### 1. Remove localStorage Token Management

**Remove these patterns:**
```typescript
// ❌ Remove all localStorage token operations
localStorage.setItem('accessToken', token);
localStorage.setItem('refreshToken', refreshToken);
localStorage.getItem('accessToken');
localStorage.removeItem('accessToken');
localStorage.clear();
```

### 2. Update API Client Configuration

**For fetch:**
```typescript
// ✅ Add credentials: 'include' to ALL API calls
fetch('http://localhost:3733/auth/me', {
  credentials: 'include',  // Required!
  headers: {
    'Content-Type': 'application/json',
    // ❌ Remove Authorization header
  }
})
```

**For axios:**
```typescript
// ✅ Set withCredentials globally
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:3733',
  withCredentials: true,  // Required!
});

// ❌ Remove Authorization header interceptor
// Don't add: headers: { Authorization: `Bearer ${token}` }
```

### 3. Update Login Flow

**Before:**
```typescript
// ❌ OLD LOGIN
const response = await fetch('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});

const { user, accessToken, refreshToken } = await response.json();
localStorage.setItem('accessToken', accessToken);
localStorage.setItem('refreshToken', refreshToken);
```

**After:**
```typescript
// ✅ NEW LOGIN
const response = await fetch('/auth/login', {
  method: 'POST',
  credentials: 'include',  // Important!
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

const { user } = await response.json();
// Tokens are now set as HTTP-only cookies automatically
// No localStorage needed!
```

### 4. Update Refresh Token Flow

**Before:**
```typescript
// ❌ OLD REFRESH
const refreshToken = localStorage.getItem('refreshToken');
const response = await fetch('/auth/refresh', {
  method: 'POST',
  body: JSON.stringify({ refreshToken }),
});

const { accessToken } = await response.json();
localStorage.setItem('accessToken', accessToken);
```

**After:**
```typescript
// ✅ NEW REFRESH
const response = await fetch('/auth/refresh', {
  method: 'POST',
  credentials: 'include',  // Cookie sent automatically
});

const { message } = await response.json();
// New cookies set automatically
```

### 5. Update Logout Flow

**Before:**
```typescript
// ❌ OLD LOGOUT
localStorage.removeItem('accessToken');
localStorage.removeItem('refreshToken');
// Redirect to login
```

**After:**
```typescript
// ✅ NEW LOGOUT
await fetch('/auth/logout', {
  method: 'POST',
  credentials: 'include',
});
// Cookies cleared by server
// Redirect to login
```

### 6. Update Protected Route Checks

**Before:**
```typescript
// ❌ OLD AUTH CHECK
const token = localStorage.getItem('accessToken');
if (!token) {
  redirect('/login');
}
```

**After:**
```typescript
// ✅ NEW AUTH CHECK
try {
  const response = await fetch('/auth/me', {
    credentials: 'include',
  });

  if (!response.ok) {
    redirect('/login');
  }

  const user = await response.json();
} catch (error) {
  redirect('/login');
}
```

### 7. Update OAuth Callback Handling

**Before:**
```typescript
// ❌ OLD: Parse tokens from URL callback
// /auth/callback?success=true
useEffect(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('success') === 'true') {
    // Fetch user profile
  }
}, []);
```

**After:**
```typescript
// ✅ NEW: Users redirected directly to dashboard
// No callback page needed - tokens already set as cookies
// User lands on /dashboard with cookies set
```

---

## Testing the Migration

### 1. Test Login Flow
```bash
curl -X POST http://localhost:3733/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' \
  -c cookies.txt  # Save cookies
```

### 2. Test Authenticated Request
```bash
curl -X GET http://localhost:3733/auth/me \
  -b cookies.txt  # Send cookies
```

### 3. Test in Browser DevTools
1. Open DevTools → Application → Cookies
2. Log in via your frontend
3. Verify cookies exist:
   - `accessToken` (HttpOnly, SameSite=Lax)
   - `refreshToken` (HttpOnly, SameSite=Strict)
4. Try accessing `document.cookie` in Console
   - ✅ Tokens should NOT appear (HttpOnly protection)

---

## Environment Variables

Ensure `FRONTEND_URL` is set correctly:

```env
# .env
FRONTEND_URL=http://localhost:3006
```

CORS is now configured to use this environment variable.

### Multi-Subdomain Cookie Sharing

If you need cookies to work across multiple subdomains (e.g., `bot.example.com` and `bot-api.example.com`), configure `COOKIE_DOMAIN`:

```env
# For multi-subdomain setup
# Use parent domain with leading dot to share cookies across subdomains
COOKIE_DOMAIN=.example.com

# For single domain setup
# Leave empty to use browser default (most secure)
COOKIE_DOMAIN=
```

**When to use:**
- ✅ Multi-subdomain architecture (frontend on `bot.domain.com`, API on `bot-api.domain.com`)
- ✅ Need same cookies accessible from different subdomains
- ❌ Single domain setup (leave empty for better security isolation)

---

## Common Issues

### Issue: "Unauthorized" on all protected endpoints
**Cause:** Missing `credentials: 'include'`
**Fix:** Add to ALL API calls

### Issue: Cookies not being set
**Cause:** CORS origin mismatch
**Fix:** Ensure `FRONTEND_URL` matches your frontend origin exactly

### Issue: Cookies not sent with requests
**Cause:** Using different ports (e.g., API on 3733, frontend on 3006)
**Fix:** In development, cookies are domain-locked to `localhost` (works across ports)

### Issue: Swagger/Postman doesn't work
**Cause:** HTTP-only cookies require special handling
**Fix:** Enable "Send cookies" or "Include credentials" in your API client

---

## Rollback Plan

If you need to rollback, the previous Bearer token implementation is still available in git history. However, this would require:
1. Reverting backend changes
2. Re-implementing Authorization header support
3. Updating frontend to use localStorage again

**Not recommended** - the cookie approach is more secure.

---

## Support

For issues or questions:
- Check API documentation: `http://localhost:3733/api/docs`
- Review backend logs for CORS errors
- Verify cookies in browser DevTools
