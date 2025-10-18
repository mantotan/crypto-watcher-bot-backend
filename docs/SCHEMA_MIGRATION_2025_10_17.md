# Schema Migration - October 17, 2025

## 🎯 Overview

This document describes the database schema changes for enhanced Paper Trading PnL tracking and the required frontend updates.

---

## 📊 Architecture Changes

### **Data Flow Model**

```
┌─────────────────────────────────────────────────────────────┐
│                     TRADING FLOW                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Signal Created → Position Opens                            │
│                      ↓                                       │
│              PaperPosition (Active)                          │
│              • is_active = true                              │
│              • Real-time P&L updates                         │
│              • Managed by trade service                      │
│                      ↓                                       │
│              Position Closes                                 │
│              (SL/TP hit or manual)                          │
│                      ↓                                       │
│              PaperTrade (History)                           │
│              • Complete PnL metrics                         │
│              • Trade analytics                              │
│              • Permanent record                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘

SERVICE OWNERSHIP:
┌──────────────────────────┬─────────────────────────────────┐
│ Backend (Read-Only)      │ Trade Service (Read-Write)      │
├──────────────────────────┼─────────────────────────────────┤
│ • GET PaperPosition      │ • CREATE/UPDATE PaperPosition   │
│ • GET PaperTrade         │ • DELETE PaperPosition          │
│ • GET Portfolio          │ • CREATE PaperTrade             │
│                          │ • UPDATE Portfolio              │
└──────────────────────────┴─────────────────────────────────┘
```

---

## 🚨 Breaking Changes

### **1. API Endpoint Removed**

#### ❌ **POST /positions/:id/close** (DELETED)

**Before:**
```typescript
POST /positions/:id/close
Body: { mode: "PAPER", reason?: "manual" }
```

**Now:**
- Endpoint no longer exists
- Position closing is handled exclusively by the trade service
- Frontend should remove "Close Position" button for paper positions

**Migration Path:**
- Remove all API calls to `/positions/:id/close`
- Positions will auto-close when SL/TP is hit (managed by trade service)
- Manual close functionality will be added to trade service in the future

---

### **2. Database Field Removed**

#### ❌ **PaperPosition.realized_pnl** (DELETED)

**Reason:**
- `realized_pnl` moved to `PaperTrade` table (for closed positions only)
- Active positions only track `unrealized_pnl`

**Impact:**
- Any code referencing `position.realized_pnl` will fail
- Use `trade.net_pnl` from PaperTrade for closed trades

---

### **3. Portfolio Manual Adjustments Restricted**

#### ⚠️ **PATCH /portfolios/:id** (MODIFIED)

**Before:**
```typescript
PATCH /portfolios/:id
Body: { deposit?: 1000, withdrawal?: 500 }
// Worked for both REAL and PAPER portfolios
```

**Now:**
```typescript
PATCH /portfolios/:id
Body: { deposit?: 1000, withdrawal?: 500 }
// ✅ Works ONLY for PAPER portfolios
// ❌ Returns 400 for REAL portfolios
```

**Error Response (REAL portfolios):**
```json
{
  "statusCode": 400,
  "message": "Cannot manually adjust REAL portfolio balance. REAL portfolios are managed by the exchange and trading service."
}
```

---

## ✅ New Features

### **1. New Table: PaperTrade**

Complete historical record of closed paper trades.

**Schema:**
```typescript
interface PaperTrade {
  // Identifiers
  id: string;
  account_id: string;
  strategy_id: string;
  signal_id?: string;

  // Trade basics
  symbol: string;              // "BTCUSDT"
  timeframe: string;           // "4h", "1h", "15m"
  side: "LONG" | "SHORT";
  size: Decimal;               // Position size in crypto

  // Entry details
  entry_datetime: DateTime;
  entry_price: Decimal;
  entry_value: Decimal;        // Total USD value
  entry_commission: Decimal;   // Entry fee

  // Exit targets
  stop_loss: Decimal;
  take_profit: Decimal;

  // Exit details
  exit_datetime: DateTime;
  exit_price: Decimal;
  exit_reason: string;         // "stop_loss" | "take_profit" | "manual" | "expired"
  exit_commission: Decimal;    // Exit fee

  // Risk management
  leverage: Decimal;
  margin_used: Decimal;
  reward_risk_ratio: Decimal;
  stop_loss_distance_percent: Decimal;
  take_profit_distance_percent: Decimal;

  // PnL tracking
  gross_pnl: Decimal;          // PnL before fees
  total_fees: Decimal;         // Entry + exit fees
  net_pnl: Decimal;            // PnL after fees (FINAL)
  roi_percentage: Decimal;     // Return on investment %

  // Trade duration
  bars_held?: number;          // Number of candles
  duration_seconds?: number;   // Total time held

  // Portfolio impact
  portfolio_balance_before: Decimal;
  portfolio_balance_after: Decimal;

  created_at: DateTime;
}
```

**API Endpoint (Coming Soon):**
```typescript
GET /strategies/:id/trades?mode=PAPER&limit=50&cursor=xxx
```

---

### **2. Enhanced PaperPosition Fields**

New fields added to active positions:

| Field | Type | Description |
|-------|------|-------------|
| `entry_datetime` | DateTime | When position was opened (default: created_at) |
| `entry_value` | Decimal | Total USD value of position (**REQUIRED**) |
| `entry_commission` | Decimal | Simulated entry fee (default: 0) |
| `stop_loss` | Decimal | Stop loss price (**REQUIRED**) |
| `take_profit` | Decimal | Take profit price (**REQUIRED**) |
| `timeframe` | String | Signal timeframe: "4h", "1h", etc. (**REQUIRED**) |
| `signal_id` | String? | Link to originating signal (optional) |
| `reward_risk_ratio` | Decimal? | R/R ratio (optional) |
| `stop_loss_distance_percent` | Decimal? | Risk % (optional) |

**Example Response:**
```json
{
  "id": "cm1234567890",
  "symbol": "BTCUSDT",
  "side": "LONG",
  "size": "0.05",
  "entry_price": "65000.00",
  "entry_value": "3250.00",
  "entry_commission": "3.25",
  "stop_loss": "64000.00",
  "take_profit": "68000.00",
  "timeframe": "4h",
  "signal_id": "sig_abc123",
  "reward_risk_ratio": "3.00",
  "stop_loss_distance_percent": "1.54",
  "mark_price": "65500.00",
  "unrealized_pnl": "25.00",
  "is_active": true,
  "created_at": "2025-10-17T10:00:00Z"
}
```

---

### **3. Position Chart Data Uses Actual Timeframe**

**Before:**
```typescript
// Hardcoded timeframe
GET /positions/:id/chart-data?mode=PAPER
// Always fetched 4h candles regardless of actual position timeframe
```

**Now:**
```typescript
// Uses position.timeframe field
GET /positions/:id/chart-data?mode=PAPER
// Fetches candles matching the position's actual timeframe (4h, 1h, etc.)
```

---

## 📋 Frontend Migration Checklist

### **Immediate Actions Required**

- [ ] **Remove Position Close Button**
  - Delete "Close Position" button from position detail page
  - Remove all API calls to `POST /positions/:id/close`
  - Add informational message: "Positions auto-close when SL/TP is hit"

- [ ] **Update Position Detail Display**
  - Add display for new fields:
    - Stop Loss / Take Profit prices
    - Timeframe badge (4h, 1h, etc.)
    - Reward/Risk Ratio
    - Entry Value & Commission
    - Risk Distance %

- [ ] **Add Trade History Tab**
  - Create new tab/section for closed trades
  - Fetch from `PaperTrade` table (endpoint TBD)
  - Display columns: Entry/Exit datetime, Symbol, Side, Net PnL, ROI%, Exit Reason

- [ ] **Restrict Portfolio Adjustments**
  - Update deposit/withdrawal UI to show PAPER-only restriction
  - Add validation: Disable buttons for REAL portfolios
  - Show tooltip: "Manual adjustments only available for paper portfolios"
  - Handle 400 error gracefully with user-friendly message

- [ ] **Update Position Charts**
  - Chart component now receives correct timeframe automatically
  - Remove any hardcoded timeframe assumptions
  - Verify charts display correct candle intervals

---

## 🔍 API Endpoint Summary

### **Modified Endpoints**

| Endpoint | Change | Status |
|----------|--------|--------|
| `POST /positions/:id/close` | **DELETED** | ❌ Removed |
| `PATCH /portfolios/:id` | PAPER-only restriction | ⚠️ Modified |
| `GET /positions/:id/chart-data` | Uses position.timeframe | ✅ Enhanced |
| `GET /positions/:id` | Returns new fields | ✅ Enhanced |
| `GET /strategies/:id/positions` | Returns new fields | ✅ Enhanced |

### **New Endpoints (Coming Soon)**

| Endpoint | Purpose |
|----------|---------|
| `GET /strategies/:id/trades` | Fetch trade history (PaperTrade) |
| `GET /trades/:id` | Get specific trade details |

---

## 🧪 Testing Recommendations

### **1. Position Display Tests**
```typescript
// Verify new fields are displayed
- Check SL/TP prices shown correctly
- Verify timeframe badge appears
- Confirm R/R ratio calculation
- Test commission display
```

### **2. Portfolio Adjustment Tests**
```typescript
// Test PAPER portfolio
✅ Should allow deposit/withdrawal
✅ Should update balance correctly

// Test REAL portfolio
❌ Should return 400 error
✅ Should show user-friendly error message
```

### **3. Chart Data Tests**
```typescript
// Verify correct timeframe used
- Open position with 4h timeframe → Chart shows 4h candles
- Open position with 1h timeframe → Chart shows 1h candles
```

---

## 💬 Support & Questions

If you encounter any issues during migration:

1. Check the error response for specific details
2. Verify you're using the latest backend version
3. Review this migration guide for proper usage
4. Contact the backend team for clarification

---

## 📝 Change Log

**Version:** 2025-10-17
**Migration:** `20251017065646_add_paper_trade_and_enhance_paper_position`

**Summary:**
- Added `PaperTrade` table for trade history
- Enhanced `PaperPosition` with risk management fields
- Removed `PaperPosition.realized_pnl` field
- Removed `POST /positions/:id/close` endpoint
- Restricted `PATCH /portfolios/:id` to PAPER portfolios only
- Fixed position chart timeframe detection

---

## 🎯 Quick Reference

### **Field Mapping: Old → New**

| Old Field | New Location |
|-----------|--------------|
| `PaperPosition.realized_pnl` | `PaperTrade.net_pnl` (closed trades only) |
| Hardcoded timeframe | `PaperPosition.timeframe` |
| N/A | `PaperPosition.entry_value` |
| N/A | `PaperPosition.stop_loss` |
| N/A | `PaperPosition.take_profit` |
| N/A | `PaperTrade.*` (complete trade record) |

### **Permission Matrix**

| Operation | Backend | Trade Service |
|-----------|---------|---------------|
| Read PaperPosition | ✅ | ✅ |
| Create PaperPosition | ❌ | ✅ |
| Update PaperPosition | ❌ | ✅ |
| Close PaperPosition | ❌ | ✅ |
| Read PaperTrade | ✅ | ✅ |
| Create PaperTrade | ❌ | ✅ |
| Read Portfolio | ✅ | ✅ |
| Update Portfolio (PAPER) | ✅ Manual only | ✅ Auto updates |
| Update Portfolio (REAL) | ❌ | ✅ |

---

*Last Updated: October 17, 2025*
*Version: 1.0.0*
