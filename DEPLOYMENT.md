# GoatMouth Odds API - Render Deployment Guide

This guide focuses on deploying the odds API to Render.

## Prerequisites

- Supabase project with migrations applied
- Render account
- GoatMouth frontend deployed (https://goatmouth.com)

## 1) Database Migrations

Run these SQL files from `../GoatMouth-main/sql/` in Supabase:
- `01-add-liquidity-pools.sql`
- `02-create-price-history.sql`
- `03-add-pool-snapshot-to-bets.sql`

Verify:
```sql
SELECT id, title, yes_pool, no_pool, pool_initialized
FROM markets
LIMIT 5;

SELECT * FROM price_history LIMIT 1;
```

## 2) Render Service Setup

1. Render Dashboard ? New ? Web Service
2. Connect this repository
3. Build Command: `npm install`
4. Start Command: `npm start`

## 3) Render Environment Variables

Set these in Render:

Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

Recommended:
- `NODE_ENV=production`
- `FRONTEND_URL=https://goatmouth.com`
- `HOUSE_MARGIN=0.02`
- `DEFAULT_POOL_SIZE=1000`

Note: Render injects `PORT` automatically. This app uses `process.env.PORT`.

## 4) Frontend Configuration

Set the odds API URL in the frontend:
```html
<script>
  window.ODDS_API_URL = 'https://YOUR-RENDER-SERVICE.onrender.com';
</script>
```

## 5) Health Check

Once deployed:
```
GET https://YOUR-RENDER-SERVICE.onrender.com/health
```

Expected:
```json
{
  "status": "ok",
  "timestamp": "...",
  "uptime": 123.456,
  "environment": "production"
}
```

## Troubleshooting

- **CORS errors**: confirm `FRONTEND_URL=https://goatmouth.com`
- **DB errors**: verify `SUPABASE_URL` + service role key
- **Pools not initialized**: set pools on active markets

```sql
UPDATE markets
SET yes_pool = 1000, no_pool = 1000,
    liquidity_constant = 1000000,
    pool_initialized = TRUE
WHERE status = 'active';
```
