# Backend API Documentation

This directory contains comprehensive documentation for the Crypto Watcher Trading Bot API.

---

## 📚 Documentation Index

### Portfolio Performance Feature (NEW - 2025-10-23)

| Document | Description | Audience |
|----------|-------------|----------|
| **[Portfolio Performance API](./PORTFOLIO_PERFORMANCE_API.md)** | Complete API documentation with examples, use cases, and integration guide | Frontend developers, API consumers |
| **[Quick Reference](./PORTFOLIO_PERFORMANCE_QUICK_REFERENCE.md)** | TL;DR version with code snippets and common patterns | Developers who want quick answers |
| **[Changelog](./CHANGELOG_PORTFOLIO_PERFORMANCE.md)** | Implementation details, bug fixes, and technical changes | Backend developers, DevOps |

---

## 🚀 Quick Links

### For Frontend Developers

**New to the API?** Start here:
1. Read the [Quick Reference](./PORTFOLIO_PERFORMANCE_QUICK_REFERENCE.md) (5 min read)
2. Copy the TypeScript types and API client code
3. See integration examples for your framework

**Need details?** Check the [Full API Documentation](./PORTFOLIO_PERFORMANCE_API.md):
- Complete parameter descriptions
- All response fields explained
- Error handling guide
- Performance optimization tips

### For Backend Developers

**Reviewing the implementation?** See the [Changelog](./CHANGELOG_PORTFOLIO_PERFORMANCE.md):
- Files changed and code diffs
- Bug fixes applied
- Performance characteristics
- Testing checklist

---

## 🎯 Feature Overview: Portfolio Performance

### What It Does

Provides time-series performance data for trading strategy portfolios by querying hourly snapshots from the database and aggregating them based on user-specified timeframes.

### Key Endpoints

```
GET /portfolios/:id/performance?timeframe=1W&granularity=DAILY
```

### Use Cases

1. **Performance Charts** - Display equity curve over time
2. **Summary Statistics** - Show ROI, total return, win rate
3. **Historical Analysis** - Compare performance across different periods
4. **Portfolio Comparison** - Track PAPER vs REAL portfolios

### Quick Example

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
- ✅ Added Portfolio Performance API documentation
- ✅ Created quick reference guide
- ✅ Added implementation changelog
- ✅ Created this documentation index

---

**Last Updated:** 2025-10-23
