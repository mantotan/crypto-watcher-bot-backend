# crypto-watcher-bot-backend

NestJS + PostgreSQL API for a crypto trading bot. The accompanying dashboard frontend is in the sibling repo [`mantotan/crypto-watcher-bot-frontend`](https://github.com/mantotan/crypto-watcher-bot-frontend).

## What's interesting

- **Auth refactored into 8 focused services** under [`src/auth/`](src/auth/) — `auth-core` (login/register/lockout), `email-verification`, `password-reset`, `password-management` (for OAuth-only accounts), `oauth` (Google + CSRF), `two-factor-auth` + `two-factor` (TOTP setup + backup codes), `user-profile`. Splitting the concerns kept each service under 250 lines and made testing tractable.
- **AES-256-GCM encryption** for sensitive data — exchange API keys, 2FA TOTP secrets, backup-code hashes. [`encryption.util.ts`](src/common/utils/encryption.util.ts).
- **JWT in HTTP-only cookies with SameSite=Strict** — 15-minute access, 7-day refresh, hard invalidation on password / 2FA changes. Account lockout: 5 fails → 15-min cooldown.
- **Backtest pipeline** — NestJS pushes to a Redis queue, an out-of-process Python worker (see "What's not in here" below) processes it, results return through the same DB. Real-time progress via a **WebSocket Gateway pattern-subscribing to Redis Pub/Sub** so users see live `progress_percentage` + `current_step` updates without polling.
- **Hedging constraints enforced at the DB layer** — `@@unique([account_id, strategy_id, symbol, side, is_active])` with an `allow_hedging` boolean controlling whether opposite-side positions on the same symbol coexist. Same model used for live trading and backtesting.

## Tech stack

- NestJS 11 + TypeScript
- PostgreSQL via Prisma 6 (typed ORM, soft deletes, timezone-aware timestamps)
- Redis (queue + Pub/Sub for the progress stream; 2 clients — commands + subscriber)
- Passport-JWT, Passport-Google-OAuth20
- Socket.IO via `@nestjs/platform-socket.io` and `@nestjs/websockets`
- bcrypt (passwords, backup codes), otpauth (TOTP)
- Scalar UI for the OpenAPI explorer at `/api/docs`

## Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL (or Docker)
- Docker & Docker Compose (optional)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/mantotan/crypto-watcher-bot-backend.git
cd crypto-watcher-bot-backend
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Environment setup

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Then edit `.env` and update the values:

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/crypto_watcher?schema=public"

# JWT Configuration
JWT_ACCESS_SECRET="your-super-secret-access-key-change-this-in-production"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-change-this-in-production"
JWT_REFRESH_EXPIRES_IN="7d"

# Encryption (AES-256-GCM for API keys, 2FA secrets)
ENCRYPTION_KEY="<64 hex chars — generate with: openssl rand -hex 32>"
```

See [`.env.example`](.env.example) for all variables.

**⚠️ Important**: Change the JWT secrets in production! Generate secure secrets using:
```bash
openssl rand -base64 32
```

### 4. Generate Prisma Client

```bash
pnpm prisma:generate
```

## Running the Application

### Development Mode

```bash
pnpm run start:dev
```

The API will be available at:
- **API**: http://localhost:3733
- **API Docs**: http://localhost:3733/api/docs

### Production Mode

```bash
# Build the application
pnpm run build

# Start production server
pnpm run start:prod
```

### Debug Mode

```bash
pnpm run start:debug
```

## Docker Deployment

### Prerequisites

Create the Docker network (if not already created):

```bash
docker network create crypto_watcher_network
```

### Build and Run

```bash
# Build Docker image
pnpm run docker:build

# Start containers
pnpm run docker:up

# View logs
pnpm run docker:logs

# Stop containers
pnpm run docker:down
```

### Docker Compose

```bash
# Start in detached mode
docker compose -f docker/docker-compose.yml up -d

# View logs
docker compose -f docker/docker-compose.yml logs -f

# Stop containers
docker compose -f docker/docker-compose.yml down
```

The containerized API will be available at:
- **API**: http://localhost:3733
- **API Docs**: http://localhost:3733/api/docs

## API Endpoints

### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/register` | Register new user | No |
| POST | `/auth/login` | Login with credentials | No |
| POST | `/auth/refresh` | Refresh access token | No |
| GET | `/auth/me` | Get current user profile | Yes |

### Example Requests

#### Register

```bash
curl -X POST http://localhost:3733/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe"
  }'
```

#### Login

```bash
curl -X POST http://localhost:3733/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

#### Get Profile

```bash
curl -X GET http://localhost:3733/auth/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

#### Refresh Token

```bash
curl -X POST http://localhost:3733/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

## Database Management

### Prisma Commands

```bash
# Generate Prisma Client
pnpm prisma:generate

# Run migrations (if needed)
npx prisma migrate dev

# Open Prisma Studio (Database GUI)
npx prisma studio

# Format Prisma schema
npx prisma format
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies |
| `pnpm run start` | Start application |
| `pnpm run start:dev` | Start in development mode with watch |
| `pnpm run start:debug` | Start in debug mode |
| `pnpm run start:prod` | Start production build |
| `pnpm run build` | Build for production |
| `pnpm prisma:generate` | Generate Prisma Client |
| `pnpm run docker:build` | Build Docker image |
| `pnpm run docker:up` | Start Docker containers |
| `pnpm run docker:down` | Stop Docker containers |
| `pnpm run docker:logs` | View Docker logs |

## Project Structure

```
crypto-watcher-bot-backend/
├── .deploy/                   # Deployment documentation
│   ├── CICD_ARCHITECTURE.md  # CI/CD architecture docs
│   └── DEPLOYMENT_SETUP.md   # Deployment setup guide
├── docker/                    # Docker configurations
│   ├── Dockerfile            # Development Dockerfile
│   ├── Dockerfile.production # Production Dockerfile
│   ├── docker-compose.yml    # Development compose
│   └── docker-compose.production.yml  # Production compose
├── prisma/
│   └── schema.prisma          # Database schema
├── scripts/
│   └── wait-for-db.sh        # Database initialization script
├── src/
│   ├── auth/                  # Authentication module
│   │   ├── dto/              # Data transfer objects
│   │   ├── guards/           # Auth guards
│   │   ├── strategies/       # Passport strategies
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   ├── config/               # Configuration files
│   │   └── swagger.config.ts # OpenAPI configuration
│   ├── prisma/               # Prisma module
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   ├── app.module.ts         # Root module
│   └── main.ts               # Application entry point
├── .env                       # Environment variables
├── .dockerignore             # Docker ignore file
├── package.json              # Project dependencies
├── pnpm-lock.yaml           # pnpm lock file
├── tsconfig.json            # TypeScript configuration
└── README.md                # This file
```

## Database Schema

The application uses the following main models:

- **User** - User accounts with authentication
- **TradingAccount** - Exchange API credentials (encrypted)
- **Strategy** - Trading strategy configurations
- **Order** - Order tracking and execution
- **Position** - Position tracking
- **CryptoSignal** - Trading signals
- **OrderUpdate** - Order status updates
- **TradeExecution** - Trade execution records
- **OrderLog** - Order activity logs

See `prisma/schema.prisma` for the complete schema.

## Security Features

- Password hashing with bcrypt (10 rounds)
- JWT access tokens (15m expiry, HTTP-only cookies, SameSite=Strict)
- JWT refresh tokens (7d expiry, HTTP-only cookies)
- Account lockout: 5 failed login attempts → 15-minute cooldown
- AES-256-GCM encryption for exchange API keys, 2FA TOTP secrets, backup-code hashes
- 2FA TOTP with rate limiting on verification attempts
- Request validation via class-validator DTOs
- Global rate limiting (60 requests/minute via ThrottlerGuard)
- CORS configured per `FRONTEND_URL`
- JWT invalidation on password / 2FA changes

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_ACCESS_SECRET` | Secret for access tokens | Required |
| `JWT_ACCESS_EXPIRES_IN` | Access token expiry | `15m` |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens | Required |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | `7d` |
| `FRONTEND_URL` | Frontend origin for CORS | `http://localhost:3006` |
| `COOKIE_DOMAIN` | Cookie domain for auth (optional) | Empty (browser default) |
| `ENCRYPTION_KEY` | AES-256 key for sensitive data | Required (64 hex chars) |

## API Documentation

Interactive API documentation is available at `/api/docs` when the server is running.

The documentation includes:
- All available endpoints
- Request/response schemas
- Authentication requirements
- Try-it-out functionality
- Example requests

## Network Configuration

This application is designed to run in the `crypto_watcher_network` Docker network to communicate with other services (database, signal processor, etc.).

**Network Details:**
- Network name: `crypto_watcher_network`
- Type: External (bridge)
- Container name: `crypto_watcher_api`

## Troubleshooting

### Port 3733 already in use

```bash
# Find process using port 3733
lsof -i :3733

# Kill the process
kill -9 <PID>
```

### Prisma Client not generated

```bash
pnpm prisma:generate
```

### Docker network not found

```bash
docker network create crypto_watcher_network
```

### Database connection issues

- Verify `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Check network connectivity in Docker

## What's not in here

This repo is the **API layer only** of a larger system. To run end-to-end it depends on three sibling services that are kept private:

- **A trade-execution worker** — a Python process that reads the Redis backtest queue, runs the actual pattern-detection + simulated-trade logic, and writes results back to PostgreSQL. The NestJS API in this repo only enqueues backtest tasks and surfaces progress; it doesn't run the strategies itself.
- **A chart-data service** — exposes historical OHLCV data through a GraphQL endpoint. The API in this repo proxies through it for the dashboard's chart components.
- **A backtest service** — the Python pattern-detection engine the trade worker uses.

The Prisma schema lives in this repo but is managed (migrations) by the trade worker — this repo only runs `prisma generate` against it.

What this means concretely: `pnpm run start:dev` will boot the API, but most endpoints that touch backtest results or chart data will return errors until you have your own implementations of the sibling services. The auth, account management, strategy CRUD, and OpenAPI explorer all work standalone.

This is published as an engineering portfolio artifact, not a runnable end-to-end product. If you want to study the auth refactor, the WebSocket Gateway, or the Prisma schema design, this repo is enough.

## License

MIT — see [`LICENSE`](LICENSE).
