# Google OAuth Setup Guide

## Overview

This application uses Google OAuth for:
1. **Login** - Users can sign in with their Google account
2. **Account Linking** - Logged-in users can link their Google account to their existing account

Both flows use a **single callback URL** and differentiate between login and linking using the `state` parameter.

## Google Cloud Console Setup

### 1. Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or select an existing one)
3. Enable the **Google+ API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Select **Web application** as the application type

### 2. Configure Authorized Redirect URIs

Add **only ONE** callback URL:

**Development:**
```
http://localhost:3733/auth/google/callback
```

**Production:**
```
https://yourdomain.com/auth/google/callback
```

**⚠️ Important**: Do NOT add separate URLs for linking (like `/auth/google/link/callback`). The application uses a single callback for both login and linking.

### 3. Update Environment Variables

Copy your credentials to `.env`:

```bash
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3733/auth/google/callback"
```

## How It Works

### Login Flow

1. User visits `/auth/google` (or clicks "Login with Google")
2. Redirected to Google consent screen
3. User grants permission
4. Google redirects to `/auth/google/callback` with authorization code
5. Backend exchanges code for tokens
6. User is logged in and redirected to frontend with JWT in HTTP-only cookies

### Account Linking Flow

1. Logged-in user visits `/auth/google/link` (protected by JWT)
2. Backend generates a **signed state parameter** containing user ID
3. User is redirected to Google consent screen with state parameter
4. User grants permission
5. Google redirects to `/auth/google/callback` (same as login!) with state
6. Backend detects `link_` prefix in state parameter
7. Backend validates signed state and links Google account to existing user
8. User is redirected to settings page with success status

### State Parameter Format

**Login**: No state (or empty)
**Linking**: `link_{userId}:{nonce}:{timestamp}:{signature}`

The signed state ensures:
- CSRF protection
- User authentication during OAuth flow
- Prevents linking to wrong account

## API Endpoints

### For Frontend Implementation

#### 1. Initiate Google Link
```
GET /auth/google/link
Headers: Authorization: Bearer {jwt_token} (or HTTP-only cookie)
Response: 302 Redirect to Google
```

#### 2. Get Linked Accounts
```
GET /auth/accounts/linked
Headers: Authorization: Bearer {jwt_token}
Response: { accounts: [{ provider: 'google', linked_at: '...' }], hasPassword: boolean }
```

#### 3. Unlink Google Account
```
DELETE /auth/account/unlink/google
Headers: Authorization: Bearer {jwt_token}
Response: { message: 'Google account unlinked successfully' }
```

## Troubleshooting

### Error: `redirect_uri_mismatch`

**Cause**: The callback URL in your Google Cloud Console doesn't match the URL in your `.env` file.

**Solution**:
1. Check Google Console → Credentials → Your OAuth Client → Authorized redirect URIs
2. Ensure it exactly matches `GOOGLE_CALLBACK_URL` in your `.env`
3. Common mistakes:
   - Missing `http://` or `https://`
   - Trailing slash (`/auth/google/callback/` vs `/auth/google/callback`)
   - Port number mismatch
   - Multiple callback URLs registered (only need one!)

### Error: Cannot unlink Google account

**Cause**: User has no password set and would be locked out.

**Solution**: Use the `/auth/set-password` endpoint to set a password first.

```
POST /auth/set-password
Headers: Authorization: Bearer {jwt_token}
Body: { "password": "new-secure-password" }
```

## Security Features

1. **Signed State Parameter** - Prevents CSRF attacks during linking
2. **State Expiry** - State tokens expire after 10 minutes
3. **Password Protection** - Cannot unlink OAuth if no password is set
4. **HTTP-Only Cookies** - Tokens stored securely (not accessible to JavaScript)
5. **Email Verification** - OAuth emails are automatically verified (trusted provider)

## Testing

Test the linking flow locally:

1. Register a regular user with email/password
2. Log in and get JWT token
3. Navigate to `/auth/google/link` (will redirect to Google)
4. Grant permission
5. Should redirect back to settings page with success message
6. Check `/auth/accounts/linked` to verify

## Production Deployment

Before deploying:

1. ✅ Update `GOOGLE_CALLBACK_URL` to your production domain
2. ✅ Add production callback URL to Google Console
3. ✅ Set `NODE_ENV=production` to enable HTTPS-only cookies
4. ✅ Update `FRONTEND_URL` to production domain
5. ✅ Use HTTPS for all OAuth flows
