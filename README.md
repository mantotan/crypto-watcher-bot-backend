# Crypto Watcher Bot Backend

API for crypto trading signal bot with automated order execution. Built with NestJS, Prisma, and PostgreSQL.

## Features

- 🔐 **JWT Authentication** - Access & refresh token implementation
- 📚 **API Documentation** - Interactive Scalar UI for testing endpoints
- 🚀 **Rate Limiting** - Built-in throttling (10 requests/minute)
- 🔒 **Password Security** - Bcrypt hashing with 10 rounds
- ✅ **Request Validation** - Class-validator for DTO validation
- 🐳 **Docker Ready** - Multi-stage build with Docker Compose
- 🗄️ **Database** - PostgreSQL with Prisma ORM

## Tech Stack

- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: Passport JWT
- **Package Manager**: pnpm
- **Documentation**: OpenAPI (Swagger) with Scalar UI

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
DATABASE_URL="postgresql://postgres:password@crypto_watcher_trade_db:5432/crypto_watcher_trade?schema=public"

# JWT Configuration
JWT_ACCESS_SECRET="your-super-secret-access-key-change-this-in-production"
JWT_ACCESS_EXPIRES_IN="24h"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-change-this-in-production"
JWT_REFRESH_EXPIRES_IN="7d"
```

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

- ✅ Password hashing with bcrypt (10 rounds)
- ✅ JWT access tokens (24h expiry)
- ✅ JWT refresh tokens (7d expiry)
- ✅ Request validation and sanitization
- ✅ Rate limiting (10 requests/minute)
- ✅ CORS enabled (configurable)
- ✅ Encrypted API keys in database

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_ACCESS_SECRET` | Secret for access tokens | Required |
| `JWT_ACCESS_EXPIRES_IN` | Access token expiry | `24h` |
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

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

ISC

## Author

Crypto Watcher Team

## Support

For issues and questions:
- GitHub Issues: https://github.com/mantotan/crypto-watcher-bot-backend/issues
