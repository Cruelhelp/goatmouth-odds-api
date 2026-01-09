# GoatMouth Odds Calculation API

Dynamic odds calculation service for GoatMouth prediction betting platform using Constant Product Market Maker (CPMM) formula.

## Features

- **Dynamic Odds Calculation** using CPMM (Automated Market Maker)
- **2% House Margin** applied to all bets
- **Liquidity Pools** for each market
- **Real-time Price Updates** via Supabase
- **RESTful API** with authentication
- **Price History** tracking for charts
- **Slippage Calculation** and warnings

## Architecture

```
GoatMouth Frontend (Vanilla JS)
    ↓ HTTP/REST API
Express.js Odds API (Port 3001)
    ├── Routes Layer
    ├── Services Layer (CPMM)
    └── Database Layer (Supabase)
    ↓
Supabase PostgreSQL Database
```

## Installation

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your Supabase credentials
nano .env
```

## Environment Variables

See `.env.example` for required variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Service role key (has full access)
- `HOUSE_MARGIN` - Fee percentage (default: 0.02 = 2%)
- `DEFAULT_POOL_SIZE` - Initial pool size for new markets (default: 1000)

## Running

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

Server will run on `http://localhost:3001`

## API Endpoints

### Public Endpoints

#### GET /api/markets/:id/odds
Get current odds for a market
```json
{
  "yesPrice": 0.547,
  "noPrice": 0.453,
  "yesPool": 909.09,
  "noPool": 1100.00
}
```

#### POST /api/markets/:id/quote
Get bet quote without executing
```json
{
  "outcome": "yes",
  "amount": 100.00
}
→ Returns estimated tokens, slippage, price impact
```

### Protected Endpoints (Require Auth)

#### POST /api/markets/:id/bet
Place a bet (requires JWT token)
```json
{
  "outcome": "yes",
  "amount": 100.00
}
```

## CPMM Formula

**Constant Product:** `yesPool × noPool = k`

**Price Calculation:**
```javascript
yesPrice = noPool / (yesPool + noPool)
noPrice = yesPool / (yesPool + noPool)
```

**Tokens Received:**
```javascript
tokensOut = outputPool - (k / (inputPool + betAmount))
```

## House Margin

2% fee deducted from each bet:
```javascript
houseFee = betAmount × 0.02
netAmount = betAmount - houseFee
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Deployment (Render)

This repo is set up for Render. A `render.yaml` blueprint is included.

1. Create a new Web Service in Render from this repo
2. Render will use the build and start commands from `render.yaml`
3. Set required environment variables in Render:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`

Recommended:
- `NODE_ENV=production`
- `FRONTEND_URL=https://goatmouth.com`
- `HOUSE_MARGIN=0.02`
- `DEFAULT_POOL_SIZE=1000`

After deploy, verify:
- `GET https://YOUR-RENDER-SERVICE.onrender.com/health`


## Project Structure

```
goatmouth-odds-api/
├── server.js                       # Entry point
├── package.json                    # Dependencies
├── .env                            # Environment variables (not committed)
└── src/
    ├── config/
    │   └── database.js             # Supabase client
    ├── routes/
    │   └── markets.routes.js       # API routes
    ├── controllers/
    │   ├── odds.controller.js      # Odds endpoints
    │   └── betting.controller.js   # Betting endpoints
    ├── services/
    │   ├── oddsCalculation.service.js  # CPMM formulas
    │   ├── betting.service.js      # Bet processing
    │   ├── houseMargin.service.js  # Fee calculation
    │   └── liquidityPool.service.js # Pool management
    └── middleware/
        ├── auth.middleware.js      # JWT verification
        └── errorHandler.middleware.js # Global error handling
```

## Database Schema

See `../GoatMouth-main/sql/` for migrations:
- `01-add-liquidity-pools.sql` - Adds pool columns to markets
- `02-create-price-history.sql` - Price tracking table
- `03-add-pool-snapshot-to-bets.sql` - Bet metadata

## License

MIT
