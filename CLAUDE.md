# CLAUDE.md

Claude Code guidance for this NestJS-based crypto trading bot API backend. Handles authentication, trading accounts, strategies (real/paper), backtesting, and portfolio tracking. Integrates with PostgreSQL, Redis, and GraphQL chart service.

## Architecture

**API Layer** (`src/main.ts`, `src/app.module.ts`)
- NestJS REST API + Swagger docs, global rate limiting (60/min), HTTP-only JWT cookies (access: 15m, refresh: 7d)

**Auth System** (`src/auth/`) - Refactored into focused services:
- `auth-core.service.ts`: Login, register, token generation, account lockout (5 attempts → 15min)
- `email-verification.service.ts`: 6-digit code generation/validation
- `password-reset.service.ts`: Forgot password flow
- `password-management.service.ts`: Set password for OAuth users
- `oauth.service.ts`: Google OAuth, account linking/unlinking, CSRF protection
- `two-factor-auth.service.ts`: 2FA setup/enable/disable/login verification
- `two-factor.service.ts`: TOTP utilities, backup codes, rate limiting
- `user-profile.service.ts`: Profile updates (name, timezone)
- Security: bcrypt (10 rounds), AES-256-GCM encryption, JWT invalidation on password/2FA changes

**Trading System** (`src/trading-account/`, `src/strategy/`, `src/position/`, `src/portfolio/`)
- Encrypted API keys (AES-256-GCM), signal filtering, position sizing, leverage up to 125x, separate real/paper P&L tracking

**Backtest System** (`src/backtest/`)
- Redis queue → Python worker → PostgreSQL results, supports multi-symbol/timeframe runs

**Data Services**
- PrismaService: PostgreSQL ORM | RedisService: Queue mgmt | GraphQLService: Chart data | EmailService: Lark/Feishu SMTP

**Database Schema**
- Encryption: AES-256-GCM for API keys & 2FA secrets | Soft deletes: `deleted_at` | Timestamps: timezone-aware
- Constraints: Unique active positions per (account, strategy, symbol, side) | JSONB for pattern data
- Cascades: User deletion → accounts, strategies, orders, positions | FK to strategies: `SetNull` (preserve history)

## Development Commands

```bash
# Setup & Build
pnpm install                           # Install deps
pnpm prisma:generate                   # Generate Prisma Client (REQUIRED after schema changes)
pnpm run start:dev                     # Dev with hot reload
pnpm run build                         # Production build
pnpm run start:debug                   # Debug mode

# Database (Prisma)
npx prisma migrate dev --name <name>   # Create migration
npx prisma migrate deploy              # Apply migrations (prod)
npx prisma studio                      # Database GUI
npx prisma format                      # Format schema
npx prisma validate                    # Validate schema

# API Docs
pnpm run openapi:export                # Export OpenAPI spec
# http://localhost:3733/api/docs       # Interactive API docs (when running)

# Docker
pnpm run docker:build                  # Build image
pnpm run docker:up                     # Start containers
pnpm run docker:logs                   # View logs
pnpm run docker:down                   # Stop containers
docker network create crypto_watcher_network  # Create network (once)
```

## Environment Variables

**Required:**
- `DATABASE_URL`, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (`openssl rand -base64 32`)
- `ENCRYPTION_KEY` (64-char hex: `openssl rand -hex 32`)
- `REDIS_HOST`/`REDIS_PORT`, `GRAPHQL_CHART_SERVICE_URL`, `FRONTEND_URL`, `COOKIE_DOMAIN` (optional)

See `.env.example` for all variables.

## Code Patterns

**Module:** `module.ts` (imports/providers) → `controller.ts` (REST + Swagger) → `service.ts` (logic) → `dto/` (validation)

**Auth Guards:** `@UseGuards(JwtAuthGuard)` requires JWT | `@Public()` skips auth | Extract via `@Request()` or `@GetUser()`

**Utils:** `encrypt()`/`decrypt()` in `encryption.util.ts` | `setAuthCookies()`/`clearAuthCookies()` in `cookie.util.ts` | DTOs use class-validator

**Errors:** Throw NestJS exceptions with descriptive messages | Timing-attack prevention on auth (always bcrypt compare)

## Prisma

**Schema Changes:** Edit `schema.prisma` → `npx prisma format` → `npx prisma migrate dev --name <desc>` → Commit schema + migrations

**Query Examples:**
```typescript
// Relations: include: { trading_accounts: true }
// Select fields: select: { id: true, email: true }
// Soft delete: data: { deleted_at: new Date() }
// Pagination: take: 20, skip: 1, cursor: { id: lastId }
```

## Backtest Flow

POST `/backtest` → Validate → Save to DB → Push to Redis `backtest:queue` → Python worker processes → Write results → Update status (QUEUED → RUNNING → COMPLETED/FAILED) → Poll GET `/backtest/:id` for results

**Results:** `BacktestResult` (summary) + `BacktestTrade[]` (JSONB pattern data) | Query by result_id with symbol/timeframe filters

## Security

API Keys: AES-256-GCM encrypted | Passwords: bcrypt 10 rounds | JWT: Rotate secrets, invalidate on password/2FA changes
Rate Limit: 60/min global (ThrottlerGuard) | CORS: Validates `FRONTEND_URL` | Cookies: HTTP-only, SameSite=Strict, secure in prod
Account Lockout: 5 fails → 15min | 2FA: TOTP encrypted, backup codes hashed

## Deployment

Port: `3733` | Docker: network `crypto_watcher_network`, containers `crypto_watcher_api` + `crypto_watcher_trade_db`
Multi-stage builds: `docker/Dockerfile.production`

## Debugging

`npx prisma generate` (client) | `npx prisma db pull` (verify DB) | Redis/GraphQL errors in console | `pnpm run start:debug` (debugger)
Swagger UI: http://localhost:3733/api/docs
