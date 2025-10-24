# Backend API Documentation

This directory contains the API documentation for the Crypto Watcher Trading Bot Backend.

---

## 📚 API Specification

| Document | Description | Use Case |
|----------|-------------|----------|
| **[openapi.json](./openapi.json)** | OpenAPI 3.0 specification (JSON) | API clients, code generation, Postman import |
| **[openapi.yaml](./openapi.yaml)** | OpenAPI 3.0 specification (YAML) | Human-readable, documentation |

---

## 🚀 Quick Links

### Interactive API Documentation

When the backend is running, you can access the interactive Swagger UI:

**Swagger UI**: http://localhost:3733/api/docs

The Swagger UI provides:
- ✅ Complete API endpoint reference
- ✅ Request/response schemas
- ✅ Try-it-out functionality
- ✅ Authentication testing
- ✅ Real-time validation

---

## 🛠️ General API Information

### Base URL

```
Development: http://localhost:3733
Production: https://api.your-org.com
```

### Authentication

All endpoints (except OAuth and public health checks) require JWT authentication:

```typescript
headers: {
  'Authorization': 'Bearer <access_token>'
}
```

**Access Token**: 15-minute expiration (from `/auth/login` or `/auth/register`)
**Refresh Token**: 7-day expiration (HTTP-only cookie)

### Rate Limiting

- **Global**: 60 requests per minute per IP
- **Authenticated**: Higher limits per user (see Swagger docs)

### Response Format

All responses follow this structure:

```typescript
// Success
{
  data: any,
  summary?: any
}

// Error
{
  statusCode: number,
  message: string,
  errors?: string[]
}
```

### Timestamps

- All timestamps are in **UTC** (ISO 8601 format)
- Example: `"2025-10-23T14:30:00Z"`
- Convert to user timezone in frontend

---

## 📖 API Endpoints Overview

### Authentication (`/auth`)

- `POST /auth/register` - Create new account
- `POST /auth/login` - Login with email/password
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout and invalidate tokens
- `GET /auth/me` - Get current user profile
- `PATCH /auth/me` - Update user profile

**Google OAuth**:
- `GET /auth/google` - Initiate Google OAuth flow
- `GET /auth/google/callback` - OAuth callback handler

**2FA (Two-Factor Authentication)**:
- `POST /auth/2fa/setup` - Generate TOTP secret + QR code
- `POST /auth/2fa/enable` - Enable 2FA with code verification
- `POST /auth/2fa/disable` - Disable 2FA
- `GET /auth/2fa/status` - Get 2FA status
- `POST /auth/2fa/verify` - Verify 2FA code during login

**Password Management**:
- `POST /auth/password/forgot` - Request password reset
- `POST /auth/password/reset` - Reset password with token
- `POST /auth/password/set` - Set password for OAuth users

**Email Verification**:
- `POST /auth/email/send-verification` - Send verification email
- `POST /auth/email/verify` - Verify email with code

### Trading Accounts (`/trading-accounts`)

- `GET /trading-accounts` - List all trading accounts
- `POST /trading-accounts` - Create new trading account
- `GET /trading-accounts/:id` - Get account details
- `PATCH /trading-accounts/:id` - Update account
- `DELETE /trading-accounts/:id` - Delete account (soft delete)

### Strategies (`/strategies`)

- `GET /strategies` - List all strategies
- `POST /strategies` - Create new strategy
- `GET /strategies/:id` - Get strategy details
- `PATCH /strategies/:id` - Update strategy
- `DELETE /strategies/:id` - Delete strategy
- `POST /strategies/:id/activate` - Activate strategy
- `POST /strategies/:id/deactivate` - Deactivate strategy

### Backtest (`/backtest`)

- `POST /backtest` - Create and queue backtest task
- `GET /backtest` - List user's backtest results
- `GET /backtest/:id` - Get backtest result details
- `DELETE /backtest/:id` - Delete backtest result
- `GET /backtest/tasks/:taskId/progress` - Get task progress (HTTP polling)
- `GET /backtest/progress/all` - Get all tasks progress

**WebSocket** (Real-time Progress):
- Namespace: `ws://localhost:3733/backtest-progress`
- Events: `subscribe`, `unsubscribe`, `get_progress`, `progress`, `all_tasks`, `error`
- **Authentication**: HTTP-only cookies (same as REST API) - user must be logged in

### Portfolios (`/portfolios`)

- `GET /portfolios` - List portfolios
- `POST /portfolios` - Create portfolio
- `GET /portfolios/:id` - Get portfolio details
- `GET /portfolios/:id/performance` - Get time-series performance data

### Positions (`/positions`)

- `GET /positions` - List positions
- `POST /positions` - Create position (manual)
- `GET /positions/:id` - Get position details
- `PATCH /positions/:id` - Update position
- `DELETE /positions/:id` - Delete position

### Orders (`/orders`)

- `GET /orders` - List orders
- `POST /orders` - Create order
- `GET /orders/:id` - Get order details
- `DELETE /orders/:id` - Cancel order

---

## 🔐 Security Features

### Authentication & Authorization

- ✅ JWT-based authentication (access + refresh tokens)
- ✅ HTTP-only cookies for refresh tokens
- ✅ CSRF protection for OAuth flows
- ✅ Password hashing with bcrypt (10 rounds)
- ✅ Account lockout after 5 failed login attempts (15 min)
- ✅ Email verification for new accounts
- ✅ 2FA support with TOTP (Google Authenticator)

### Data Protection

- ✅ API keys encrypted with AES-256-GCM
- ✅ 2FA secrets encrypted with AES-256-GCM
- ✅ Soft deletes (data marked deleted, not removed)
- ✅ User data isolated (cannot access other users' data)

### Rate Limiting & CORS

- ✅ Global rate limiting (60 req/min per IP)
- ✅ CORS configured for allowed origins
- ✅ Request validation with class-validator

---

## 📋 Response Examples

### Success Response

```json
{
  "data": {
    "id": "clxxx123",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### Error Response

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    "email must be a valid email address",
    "password must be at least 8 characters"
  ]
}
```

### Paginated Response

```json
{
  "data": [
    { "id": "1", "name": "Item 1" },
    { "id": "2", "name": "Item 2" }
  ],
  "summary": {
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

---

## 🧪 Testing the API

### Using Swagger UI (Recommended)

1. Start the backend: `pnpm run start:dev`
2. Open: http://localhost:3733/api/docs
3. Click "Authorize" button
4. Enter your JWT access token
5. Try out endpoints directly in the browser

### Using curl

```bash
# Register
curl -X POST http://localhost:3733/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'

# Login
curl -X POST http://localhost:3733/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Use access token
TOKEN="your_access_token_here"

curl -X GET http://localhost:3733/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Using Postman

1. Import OpenAPI spec: `docs/openapi.json`
2. Set environment variable `{{baseUrl}}` = `http://localhost:3733`
3. Set authorization: Bearer Token with `{{accessToken}}`

---

## 🔄 Generating OpenAPI Spec

To regenerate the OpenAPI specification after API changes:

```bash
pnpm run openapi:export
```

This will update both `openapi.json` and `openapi.yaml`.

---

## 📝 Development Workflow

### Making API Changes

1. Update controller/service code
2. Update DTOs (Data Transfer Objects)
3. Add/update Swagger decorators (`@ApiOperation`, `@ApiResponse`, etc.)
4. Test locally with Swagger UI
5. Run `pnpm run openapi:export` to update spec
6. Commit changes

### Adding New Endpoints

1. Create/update controller method
2. Add Swagger decorators:
   ```typescript
   @ApiOperation({ summary: 'Create new resource' })
   @ApiResponse({ status: 201, description: 'Resource created' })
   @ApiResponse({ status: 400, description: 'Validation failed' })
   @Post()
   async create(@Body() dto: CreateDto) {
     // ...
   }
   ```
3. Export OpenAPI spec
4. Test in Swagger UI

---

## 🤝 Frontend Integration

### REST API

Use the OpenAPI spec with code generators:

```bash
# Generate TypeScript client
npx @openapitools/openapi-generator-cli generate \
  -i docs/openapi.json \
  -g typescript-fetch \
  -o src/api/generated
```

### WebSocket (Backtest Progress)

For real-time backtest progress tracking:

```typescript
import io from 'socket.io-client';

// User must be logged in first (REST API sets HTTP-only cookies)
const socket = io('http://localhost:3733/backtest-progress', {
  withCredentials: true,  // Required: sends HTTP-only cookies for auth
  transports: ['websocket']
});

socket.on('progress', (data) => {
  console.log(`Progress: ${data.progress_percentage}%`);
});

socket.emit('subscribe', taskId);
```

**Authentication**: HTTP-only cookies (same as REST API) - user must be logged in via `/auth/login`
**Events**: See Swagger UI for complete WebSocket API

---

## 🆘 Support

### Documentation Issues

- **Missing information?** Check Swagger UI: http://localhost:3733/api/docs
- **Found an error?** Submit an issue or PR
- **Need clarification?** Contact backend team

### API Issues

- **Authentication errors**: Check JWT token validity and expiration
- **Rate limiting**: Reduce request frequency or contact team for higher limits
- **CORS errors**: Verify `FRONTEND_URL` environment variable

---

## 📞 Contact

**Repository**: `crypto-watcher-bot-backend`
**API Docs**: http://localhost:3733/api/docs (when running)
**Backend Team**: Contact via team chat or GitHub issues

---

**Last Updated**: 2025-10-23
