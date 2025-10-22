# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS-based API backend for a crypto trading signal bot with automated order execution capabilities. The system handles authentication, trading account management, strategy execution (real and paper trading), backtesting, and portfolio tracking. It integrates with external services including PostgreSQL database, Redis queue for backtest jobs, and a GraphQL chart data service for historical candle data.

## Core Architecture

### Multi-Layer System Design

1. **API Layer** (`src/main.ts`, `src/app.module.ts`)
   - NestJS REST API with Swagger/Scalar documentation
   - Global rate limiting (60 req/min via ThrottlerGuard)
   - HTTP-only cookie authentication with JWT (access + refresh tokens)
   - CORS configured for frontend (configurable via `FRONTEND_URL`)
   - Request validation via class-validator DTOs

2. **Authentication System** (`src/auth/`)
   - JWT-based auth with dual token strategy (access: 15m, refresh: 7d)
   - Password hashing with bcrypt (10 rounds)
   - OAuth support (Google via Passport)
   - Email verification with 6-digit codes
   - Password reset with secure tokens
   - Two-factor authentication (TOTP) with backup codes
   - Account lockout after failed login attempts (5 attempts → 30 min lockout)
   - Security features tracked in JWT payload: `password_changed_at`, `two_factor_enabled_at`

3. **Trading System** (`src/trading-account/`, `src/strategy/`, `src/position/`, `src/portfolio/`)
   - **TradingAccount**: Stores encrypted exchange API keys (AES-256-GCM encryption)
   - **Strategy**: Defines trading rules, risk parameters, and signal filters
   - **Position**: Real-time tracking of open positions (real or paper)
   - **Portfolio**: Separate P&L tracking for REAL and PAPER modes per strategy
   - Signal filtering: patterns, symbols, timeframes, risk/reward ratios
   - Position sizing: percentage or USD-based, benchmarked to balance/SL/TP
   - Leverage support up to 125x with configurable maker/taker fees

4. **Backtest System** (`src/backtest/`)
   - **BacktestStrategy**: Template for pattern-based strategies
   - **BacktestTask**: Queue jobs submitted to Redis for Python backtest worker
   - **BacktestResult**: Portfolio summary with performance metrics
   - **BacktestTrade**: Individual trade records with pattern data (JSONB)
   - Redis queue integration: Tasks pushed to `backtest:queue`, workers pull and process
   - Results stored in PostgreSQL for querying and visualization
   - Supports multiple symbols/timeframes in a single backtest run

5. **Data Services**
   - **PrismaService** (`src/prisma/`): PostgreSQL ORM for all database operations
   - **RedisService** (`src/redis/`): Redis client for backtest queue management
   - **GraphQLService** (`src/graphql/`): Fetches historical candle data from external chart service
   - **EmailService** (`src/email/`): Sends verification emails via Lark/Feishu SMTP

6. **Data Flow for Signal Processing**
   - Signal arrives → Strategy validates against filters (patterns, symbols, timeframes, risk ratio)
   - If rejected → Store in `RejectedSignal` with reason
   - If accepted → Calculate position size → Create paper position (`PaperPosition`) or real order (`Order`)
   - Price monitoring → Update unrealized P&L on active positions
   - Exit trigger (SL/TP/manual) → Close position → Move to `PaperTrade` history

### Database Schema Key Points

- **Encryption**: Trading account API keys and 2FA TOTP secrets use AES-256-GCM encryption (`ENCRYPTION_KEY` env var)
- **Soft Deletes**: Strategies and backtest strategies use `deleted_at` timestamp for soft deletion
- **Unique Constraints**: Active positions are unique per (account, strategy, symbol, side, is_active)
- **Time-series**: All timestamps use `@db.Timestamptz` (timezone-aware) for accurate historical queries
- **JSONB Flexibility**: Pattern data in `BacktestTrade` stored as JSON for multiple pattern types
- **Cascade Deletes**: User deletion cascades to accounts, strategies, orders, positions
- **Foreign Key Strategy**: Orders/positions link to strategies with `SetNull` to preserve history

## Common Development Commands

### Build and Run
```bash
# Install dependencies
pnpm install

# Generate Prisma Client (REQUIRED after schema changes)
pnpm prisma:generate

# Development with hot reload
pnpm run start:dev

# Production build and run
pnpm run build
pnpm run start:prod

# Debug mode (enables --debug flag)
pnpm run start:debug
```

### Database Management
```bash
# Generate Prisma Client (run after pulling schema changes)
pnpm prisma:generate

# Create and apply migration (after schema.prisma changes)
npx prisma migrate dev --name your_migration_name

# Apply migrations in production
npx prisma migrate deploy

# Open Prisma Studio (database GUI)
npx prisma studio

# Format schema.prisma
npx prisma format

# Validate schema
npx prisma validate
```

### API Documentation
```bash
# Export OpenAPI spec to docs/ folder
pnpm run openapi:export

# Access interactive API docs (when server is running)
# http://localhost:3733/api/docs
```

### Docker Commands
```bash
# Build Docker image
pnpm run docker:build

# Start containers (PostgreSQL + API)
pnpm run docker:up

# View logs
pnpm run docker:logs

# Stop containers
pnpm run docker:down

# Create external network (if not exists)
docker network create crypto_watcher_network
```

## Key Environment Variables

Critical variables that MUST be configured:

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: Generate with `openssl rand -base64 32`
- `ENCRYPTION_KEY`: 64-character hex string for AES-256 encryption (generate with `openssl rand -hex 32`)
- `REDIS_HOST` / `REDIS_PORT`: Redis server for backtest queue (default: localhost:6333)
- `GRAPHQL_CHART_SERVICE_URL`: External chart data service URL (default: http://localhost:8000/graphql)
- `FRONTEND_URL`: CORS origin for frontend (default: http://localhost:3000)
- `COOKIE_DOMAIN`: Optional cookie domain for subdomain sharing (use `.yourdomain.com` with leading dot)

See `.env.example` for complete list with descriptions.

## Code Organization Patterns

### Module Structure
Each feature follows NestJS module pattern:
```
feature/
├── feature.module.ts       # Module definition with imports/providers
├── feature.controller.ts   # REST endpoints with Swagger decorators
├── feature.service.ts      # Business logic
└── dto/                    # Data Transfer Objects with class-validator
    ├── create-feature.dto.ts
    └── update-feature.dto.ts
```

### Authentication Guards
- `@UseGuards(JwtAuthGuard)`: Requires valid JWT access token
- `@Public()`: Skip authentication (use decorator from auth module)
- JWT payload extracted via `@Request()` or custom decorator `@GetUser()`

### Common Utilities
- **Encryption**: `encrypt(plaintext)` / `decrypt(ciphertext)` in `src/common/utils/encryption.util.ts`
- **Cookies**: `setAuthCookies(res, tokens)` / `clearAuthCookies(res)` in `src/common/utils/cookie.util.ts`
- **Validation**: Use class-validator decorators in DTOs (`@IsEmail()`, `@IsNotEmpty()`, etc.)

### Error Handling Conventions
- Throw NestJS exceptions (`ConflictException`, `UnauthorizedException`, `BadRequestException`, `ForbiddenException`)
- Use descriptive error messages that client can display to users
- Security-sensitive errors (login) use timing-attack prevention (always bcrypt compare)

## Working with Prisma

### After Schema Changes
1. Edit `prisma/schema.prisma`
2. Run `npx prisma format` to format
3. Run `npx prisma migrate dev --name descriptive_name` to create migration
4. Prisma Client regenerates automatically
5. Commit both `schema.prisma` and migration files

### Query Patterns
```typescript
// Include relations
await this.prisma.user.findUnique({
  where: { id: userId },
  include: { trading_accounts: true },
});

// Select specific fields
await this.prisma.user.findUnique({
  where: { id: userId },
  select: { id: true, email: true, name: true },
});

// Soft delete pattern
await this.prisma.strategy.update({
  where: { id },
  data: { deleted_at: new Date() },
});

// Pagination with cursor
await this.prisma.order.findMany({
  take: 20,
  skip: 1,
  cursor: { id: lastOrderId },
});
```

## Testing Strategy

Currently no automated tests are configured. When adding tests:
- Use `@nestjs/testing` for unit tests
- Use supertest for integration tests
- Mock PrismaService using Prisma's recommended patterns
- Test authentication flows with JWT token generation

## Backtest System Integration

### Submitting Backtest Jobs
1. User creates `BacktestTask` via POST `/backtest` endpoint
2. Backend validates parameters and saves task to database
3. Backend pushes job to Redis queue `backtest:queue` with task ID
4. External Python worker pulls job, runs backtest, writes results to PostgreSQL
5. Worker updates task status: QUEUED → RUNNING → COMPLETED/FAILED
6. Frontend polls GET `/backtest/:id` to check status and retrieve results

### Result Structure
- `BacktestResult`: One summary record per task
- `BacktestTrade[]`: Individual trades with full pattern data in JSONB
- Query trades by result_id with filters on symbol/timeframe for drill-down analysis

## Security Considerations

- **API Keys**: Always encrypted in database using `ENCRYPTION_KEY`
- **Passwords**: Bcrypt hashed with 10 rounds, never logged or returned in responses
- **JWT Secrets**: Must be rotated in production, different for access/refresh
- **Rate Limiting**: Global throttling applied via ThrottlerGuard (can be overridden per route)
- **CORS**: Strictly validates origin against `FRONTEND_URL`
- **Cookies**: HTTP-only, SameSite=Strict (configurable), secure in production
- **Account Lockout**: 5 failed attempts → 30 min lockout
- **2FA**: TOTP secrets encrypted, backup codes hashed like passwords

## Network and Deployment

- Default port: `3733` (configurable via `PORT` env var)
- Docker network: `crypto_watcher_network` (external bridge network)
- Container name: `crypto_watcher_api`
- Database container: `crypto_watcher_trade_db`
- Multi-stage Docker builds for production (see `docker/Dockerfile.production`)

## Debugging Tips

- Check Prisma Client generation: `npx prisma generate`
- Verify database connection: `npx prisma db pull` (fetches schema from DB)
- Redis connection logs in console on startup
- GraphQL service errors logged with retry attempts (3 retries with exponential backoff)
- Use `pnpm run start:debug` for Node.js debugger attachment
- Swagger UI for manual API testing: http://localhost:3733/api/docs
