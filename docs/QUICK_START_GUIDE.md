# Quick Start Guide - Trading Endpoints

## 🚀 Getting Started

### 1. Start the Development Server

```bash
pnpm start:dev
```

Server will start at: `http://localhost:3000`
Swagger docs available at: `http://localhost:3000/api/docs`

---

## 📖 API Usage Flow

### Step 1: Authentication

All endpoints require JWT authentication. First, register/login:

```bash
# Register
POST /auth/register
{
  "email": "trader@example.com",
  "password": "SecurePass123!",
  "name": "Trader"
}

# Login (sets HTTP-only cookies)
POST /auth/login
{
  "email": "trader@example.com",
  "password": "SecurePass123!"
}
```

Cookies are automatically included in subsequent requests.

---

### Step 2: Create a Trading Account

```bash
POST /trading-accounts
{
  "name": "My Binance Account",
  "exchange": "binance",
  "api_key": "your_binance_api_key",
  "api_secret": "your_binance_api_secret",
  "initial_balance": 10000  # Optional - for paper trading
}

# Response
{
  "id": "clxy123...",
  "name": "My Binance Account",
  "exchange": "binance",
  "created_at": "2025-10-17T10:00:00Z",
  "encrypted_at": "2025-10-17T10:00:00Z"
}
```

**Test Connection:**
```bash
POST /trading-accounts/:id/test-connection

# Response
{
  "success": true,
  "message": "Connection successful",
  "balance": 10000
}
```

---

### Step 3: Create a Trading Strategy

```bash
POST /strategies
{
  "name": "Conservative Double Bottom",
  "description": "Low-risk double bottom strategy",
  "trading_account_id": "clxy123...",
  "trade_size_type": "PERCENTAGE",
  "trade_size_amount": 5.0,
  "trade_size_benchmark": "SL",
  "min_risk_ratio": 1.5,
  "max_risk_ratio": 10.0,
  "allowed_signals": ["double_bottom"],
  "allowed_symbols": ["BTCUSDT", "ETHUSDT"],
  "mode": "PAPER",  # Start with paper trading
  "is_live": false,
  "is_public": false,
  "initial_capital": 10000
}

# Response includes strategy + created portfolio
{
  "id": "clxy456...",
  "name": "Conservative Double Bottom",
  "mode": "PAPER",
  "is_live": false,
  "portfolios": [
    {
      "id": "clxy789...",
      "type": "PAPER",
      "balance": 10000,
      "available_balance": 10000,
      "initial_balance": 10000,
      ...
    }
  ],
  ...
}
```

---

### Step 4: Manage Your Portfolio

**Get Portfolios for a Strategy:**
```bash
GET /strategies/:strategyId/portfolios

# Response
{
  "real": null,  # No REAL portfolio yet
  "paper": {
    "id": "clxy789...",
    "type": "PAPER",
    "balance": 10000,
    "unrealized_pnl": 0,
    "realized_pnl": 0,
    "win_rate": 0,
    "total_trades": 0,
    ...
  }
}
```

**Add Funds to Portfolio:**
```bash
PATCH /portfolios/:id
{
  "deposit": 5000
}

# Response - updated balance
{
  "balance": 15000,
  "available_balance": 15000,
  "total_deposits": 5000,
  ...
}
```

**View Performance:**
```bash
GET /portfolios/:id/performance?timeframe=1M

# Response
{
  "data": [
    {
      "timestamp": "2025-09-17T10:00:00Z",
      "balance": 10000,
      "equity": 10000,
      "unrealized_pnl": 0,
      "realized_pnl": 0
    },
    {
      "timestamp": "2025-10-17T10:00:00Z",
      "balance": 15000,
      "equity": 15200,
      "unrealized_pnl": 200,
      "realized_pnl": 5000
    }
  ]
}
```

---

### Step 5: Start Live Trading

**Update Strategy to Live:**
```bash
PATCH /strategies/:id
{
  "is_live": true  # Start trading!
}
```

**Switch to REAL Mode:**
```bash
# First, create a REAL portfolio manually (future enhancement)
# Then switch mode:
PATCH /strategies/:id
{
  "mode": "REAL",  # Switch from PAPER to REAL
  "is_live": false  # Must stop before switching
}
```

---

### Step 6: Monitor Positions

**List Positions for Strategy:**
```bash
GET /strategies/:strategyId/positions?mode=PAPER&status=OPEN&limit=20

# Response
{
  "data": [
    {
      "id": "clxy999...",
      "symbol": "BTCUSDT",
      "side": "long",
      "size": 0.1,
      "entry_price": 42000,
      "mark_price": 42500,
      "unrealized_pnl": 50,
      "is_active": true,
      ...
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 20,
    "nextCursor": null,
    "hasMore": false
  },
  "summary": {
    "total_positions": 1,
    "open_positions": 1,
    "total_unrealized_pnl": 50
  }
}
```

**View Position Chart:**
```bash
GET /positions/:id/chart-data?mode=PAPER&candles_before=50&candles_after=50

# Response
{
  "position": { ... },
  "candles": {
    "before": [ ... ],  # 50 candles before entry
    "after": [ ... ],   # 50 candles after entry
    "reference_time": "2025-10-17T10:00:00Z",
    "total_candles": 100
  }
}
```

**Close Position Manually:**
```bash
POST /positions/:id/close
{
  "mode": "PAPER",
  "reason": "Target reached"
}

# Response - closed position with realized P&L
{
  "is_active": false,
  "realized_pnl": 150.50,
  ...
}
```

---

### Step 7: View Dashboard

```bash
GET /dashboard/summary

# Response
{
  "total_strategies": 5,
  "live_strategies": 2,
  "total_portfolios_value": 25000,
  "today_pnl": 350.75,
  "open_positions": 3,
  "strategies_by_performance": [
    {
      "strategy": {
        "id": "clxy456...",
        "name": "Conservative Double Bottom",
        "mode": "PAPER",
        "is_live": true
      },
      "portfolio": {
        "balance": 15000,
        "unrealized_pnl": 200,
        "realized_pnl": 5000,
        "win_rate": 65.5,
        "total_trades": 42
      },
      "performance_7d": 5.2  # 5.2% gain over 7 days
    },
    ...
  ]
}
```

---

## 🌐 Browse Public Strategies

```bash
GET /strategies/public?search=double&sort=performance&limit=10

# Response
{
  "data": [
    {
      "id": "clxy111...",
      "name": "Aggressive Double Top Strategy",
      "mode": "PAPER",
      "is_live": true,
      "portfolios": [
        {
          "win_rate": 72.5,
          "total_trades": 150,
          "sharpe_ratio": 1.8,
          ...
        }
      ],
      "author": "User#3fa8d9e1"  # Anonymized
    },
    ...
  ],
  "pagination": { ... }
}
```

**Copy a Public Strategy:**
```bash
POST /strategies/:id/copy
{
  "trading_account_id": "clxy123...",
  "name": "My Copy of Aggressive Strategy"  # Optional
}

# Creates a new strategy with same configuration
```

---

## 📊 Filtering & Pagination

### List Strategies with Filters
```bash
GET /strategies?trading_account_id=clxy123&mode=PAPER&is_live=true&limit=20&cursor=clxy456

# Available filters:
- trading_account_id: Filter by account
- mode: REAL | PAPER
- is_live: true | false
- limit: 1-100 (default 20)
- cursor: For pagination
```

### List Positions with Filters
```bash
GET /strategies/:id/positions?mode=PAPER&symbol=BTCUSDT&side=long&status=OPEN&limit=20

# Available filters:
- mode: REAL | PAPER (required)
- symbol: e.g., BTCUSDT
- side: long | short
- status: OPEN | CLOSED
- limit: 1-100 (default 20)
- cursor: For pagination
```

---

## ⚠️ Common Errors & Solutions

### 409 Conflict - Duplicate Name
```json
{
  "statusCode": 409,
  "message": "Trading account with this name already exists"
}
```
**Solution:** Use a unique name for the trading account/strategy.

---

### 400 Bad Request - Cannot Change Mode While Live
```json
{
  "statusCode": 400,
  "message": "Cannot change trading mode while strategy is live. Stop the strategy first."
}
```
**Solution:** Set `is_live: false` before changing mode.

---

### 400 Bad Request - Cannot Delete with Open Positions
```json
{
  "statusCode": 400,
  "message": "Cannot delete strategy with open positions. Close all positions first."
}
```
**Solution:** Close all positions before deleting strategy.

---

### 404 Not Found - Strategy Not Found
```json
{
  "statusCode": 404,
  "message": "Strategy not found"
}
```
**Solution:** Verify the strategy ID and that it belongs to the authenticated user.

---

## 🔐 Security Notes

1. **API Keys:** Automatically encrypted before storage
2. **Authentication:** JWT tokens in HTTP-only cookies
3. **User Isolation:** Can only access your own resources
4. **Public Strategies:** User data is anonymized
5. **Rate Limiting:** 60 requests per minute (global default)

---

## 🛠️ Development Tips

### View Swagger Documentation
```bash
# Start server and visit:
http://localhost:3000/api/docs

# Interactive API testing available
```

### Check Database
```bash
# View database in Prisma Studio
npx prisma studio

# Runs at http://localhost:5555
```

### Reset Database (Development Only)
```bash
# Reset and re-seed database
npx prisma migrate reset
```

---

## 📞 Support

- **Swagger Docs:** `http://localhost:3000/api/docs`
- **API Documentation:** `/docs/API_ENDPOINTS_SUMMARY.md`
- **Schema Changes:** Run `npx prisma generate` after schema updates

---

**Happy Trading! 🚀**
