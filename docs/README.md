# Backend API Documentation

This directory contains comprehensive documentation for the Crypto Watcher Trading Bot API.

---

## 📚 Documentation Index

### Backtest Progress Tracking Feature (NEW - 2025-10-23) ✅ PRODUCTION READY

| Document | Description | Audience |
|----------|-------------|----------|
| **[Production Ready Summary](./PRODUCTION_READY_SUMMARY.md)** | ✅ **START HERE** - Final status, all fixes applied, deployment checklist | Everyone |
| **[Frontend Integration Guide](./FRONTEND_INTEGRATION_GUIDE.md)** | Complete WebSocket + HTTP integration guide with React examples | Frontend developers |
| **[Progress Tracking Summary](./PROGRESS_TRACKING_SUMMARY.md)** | Quick reference with data structures and common issues | Frontend/Backend developers |
| **[Security Audit Report](./SECURITY_AUDIT_REPORT.md)** | Comprehensive security audit with all issues found and fixed | Backend developers, Security team |
| **[Final Audit Report](./FINAL_AUDIT_REPORT.md)** | Long-term stability audit with scalability analysis | Backend developers, DevOps |

### Portfolio Performance Feature (2025-10-23)

| Document | Description | Audience |
|----------|-------------|----------|
| **[Portfolio Performance API](./PORTFOLIO_PERFORMANCE_API.md)** | Complete API documentation with examples, use cases, and integration guide | Frontend developers, API consumers |
| **[Quick Reference](./PORTFOLIO_PERFORMANCE_QUICK_REFERENCE.md)** | TL;DR version with code snippets and common patterns | Developers who want quick answers |
| **[Changelog](./CHANGELOG_PORTFOLIO_PERFORMANCE.md)** | Implementation details, bug fixes, and technical changes | Backend developers, DevOps |

### API Specification

| Document | Description | Use Case |
|----------|-------------|----------|
| **[openapi.json](./openapi.json)** | OpenAPI 3.0 specification (JSON) | API clients, code generation |
| **[openapi.yaml](./openapi.yaml)** | OpenAPI 3.0 specification (YAML) | Human-readable, Postman import |

---

## 🚀 Quick Links

### For Frontend Developers

#### Implementing Progress Tracking?
1. Read the [Progress Tracking Summary](./PROGRESS_TRACKING_SUMMARY.md) (5 min read)
2. Install `socket.io-client`
3. Copy React hooks and components from [Frontend Integration Guide](./FRONTEND_INTEGRATION_GUIDE.md)
4. Test in browser console

#### Working with Portfolio Performance?
1. Read the [Quick Reference](./PORTFOLIO_PERFORMANCE_QUICK_REFERENCE.md) (5 min read)
2. Copy the TypeScript types and API client code
3. See integration examples for your framework

**Need full details?**
- Progress Tracking: [Frontend Integration Guide](./FRONTEND_INTEGRATION_GUIDE.md)
- Portfolio Performance: [Full API Documentation](./PORTFOLIO_PERFORMANCE_API.md)
- All Endpoints: [Interactive Swagger UI](http://localhost:3733/api/docs)

### For Backend Developers

**Reviewing the implementation?** See the [Changelog](./CHANGELOG_PORTFOLIO_PERFORMANCE.md):
- Files changed and code diffs
- Bug fixes applied
- Performance characteristics
- Testing checklist

---

## 🎯 Feature Overviews

### Backtest Progress Tracking (Real-time)

**What It Does**: Provides real-time progress updates (0% → 100%) for backtest tasks via WebSocket or HTTP polling.

**Key Endpoints**:
```
WebSocket: ws://localhost:3733/backtest-progress
HTTP: GET /backtest/tasks/:taskId/progress
HTTP: GET /backtest/progress/all
```

**Use Cases**:
1. **Real-time Progress Bars** - Show live backtest progress
2. **Status Monitoring** - Track multiple backtests simultaneously
3. **Dashboard Views** - Display all active backtests
4. **ETA Display** - Show estimated completion time

**Quick Example**:
```typescript
import io from 'socket.io-client';

const socket = io('http://localhost:3733/backtest-progress');
socket.emit('subscribe', taskId);
socket.on('progress', (data) => {
  console.log(`${data.progress_percentage}% - ${data.current_step}`);
});
```

---

### Portfolio Performance (Time-series)

**What It Does**: Provides time-series performance data for trading strategy portfolios by querying hourly snapshots from the database and aggregating them based on user-specified timeframes.

**Key Endpoints**:
```
GET /portfolios/:id/performance?timeframe=1W&granularity=DAILY
```

**Use Cases**:
1. **Performance Charts** - Display equity curve over time
2. **Summary Statistics** - Show ROI, total return, win rate
3. **Historical Analysis** - Compare performance across different periods
4. **Portfolio Comparison** - Track PAPER vs REAL portfolios

**Quick Example**:
```typescript
// Fetch last week's daily performance
const response = await fetch(
  '/portfolios/clxxx123/performance?timeframe=1W&granularity=DAILY',
  { headers: { Authorization: `Bearer ${token}` } }
);

const { data, summary } = await response.json();

// data = array of daily performance snapshots
// summary = statistics (start/end balance, ROI%, etc.)
```

---

## 📋 Documentation Standards

All API documentation in this directory follows these conventions:

### Structure
- **Quick Start** - Get running in < 5 minutes
- **API Specification** - Parameters, responses, errors
- **Examples** - Real-world use cases with code
- **Integration Guide** - Step-by-step implementation
- **Reference** - Complete field descriptions

### Code Examples
- ✅ Copy-paste ready
- ✅ TypeScript typed
- ✅ Framework-agnostic (with React examples)
- ✅ Production-ready patterns

### Maintenance
- Each document includes "Last Updated" date
- Breaking changes are clearly marked
- Backward compatibility is documented
- Migration guides provided when needed

---

## 🛠️ General API Information

### Base URL
```
Production: https://api.your-org.com
Development: http://localhost:3733
```

### Authentication
All endpoints (except OAuth) require JWT authentication:
```typescript
headers: {
  'Authorization': 'Bearer <access_token>'
}
```

### Rate Limiting
- **Global**: 60 requests per minute per IP
- **Authenticated**: Higher limits per user

### Response Format
All responses follow this structure:
```typescript
// Success
{ data: any, summary?: any }

// Error
{ statusCode: number, message: string, errors?: string[] }
```

### Timestamps
- All timestamps are in **UTC** (ISO 8601 format)
- Convert to user timezone in frontend

---

## 📖 Related Documentation

### Project Root Documentation
- `../CLAUDE.md` - Claude Code guidance for this project
- `../README.md` - Project overview and setup

### API Documentation
- Swagger UI: `http://localhost:3733/api/docs` (when running)
- OpenAPI Spec: Generated via `pnpm run openapi:export`

### Database Documentation
- Schema: `../prisma/schema.prisma`
- Migrations: `../prisma/migrations/`

---

## 🤝 Contributing to Documentation

### Adding New Documentation

1. Create a new `.md` file in this directory
2. Follow the structure of existing docs
3. Add entry to this README index
4. Include "Last Updated" date
5. Provide code examples

### Updating Existing Documentation

1. Update "Last Updated" date
2. Document breaking changes clearly
3. Update code examples if API changed
4. Add migration guide if needed

### Documentation Checklist

- [ ] Clear title and overview
- [ ] Quick start example
- [ ] Complete parameter descriptions
- [ ] Response format with types
- [ ] Error handling guide
- [ ] Integration examples
- [ ] Edge cases documented
- [ ] Performance considerations
- [ ] Testing guidance

---

## 📞 Support

### Questions About Documentation
- **Missing information?** Create an issue or PR
- **Found an error?** Submit a correction
- **Need clarification?** Ask in team chat

### Questions About Implementation
- **Backend issues:** Backend team
- **API design:** API team lead
- **Frontend integration:** Frontend team

---

## 📝 Changelog

### 2025-10-23
- ✅ **Backtest Progress Tracking** - Added real-time WebSocket + HTTP polling
  - Created comprehensive frontend integration guide
  - Added progress tracking quick reference
  - Included React hooks and components
  - Completed comprehensive security audit (2 rounds)
  - Fixed critical authentication vulnerability
  - Implemented connection-level JWT authentication
  - Added ownership caching for performance
  - Documented all security improvements
- ✅ **Portfolio Performance API** - Time-series performance data
  - Added complete API documentation
  - Created quick reference guide
  - Added implementation changelog
- ✅ **Documentation Index** - Created and organized all documentation

---

**Last Updated:** 2025-10-23
