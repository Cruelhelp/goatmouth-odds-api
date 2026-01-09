/**
 * Markets Routes
 *
 * Defines API routes for market odds and betting
 */

const express = require('express');
const router = express.Router();
const oddsController = require('../controllers/odds.controller');
const bettingController = require('../controllers/betting.controller');
const oddsMultiplierController = require('../controllers/oddsMultiplier.controller');
const { authenticateUser } = require('../middleware/auth.middleware');

// Public routes (no authentication required)

/**
 * GET /api/markets/:id/odds
 * Get current odds for a market
 */
router.get('/:id/odds', oddsController.getMarketOdds);

/**
 * POST /api/markets/:id/quote
 * Get a quote for a bet without executing it
 */
router.post('/:id/quote', oddsController.getBetQuote);

// Protected routes (authentication required)

/**
 * POST /api/markets/:id/bet
 * Place a bet on a market
 * Requires: Bearer token in Authorization header
 */
router.post('/:id/bet', authenticateUser, bettingController.placeBet);

// Odds-based betting routes (sports betting style)

/**
 * GET /api/markets/:id/odds-multiplier
 * Get current odds as multipliers (1.85x, 10.5x, etc.)
 * Returns traditional betting odds instead of share prices
 */
router.get('/:id/odds-multiplier', oddsMultiplierController.getMarketOddsMultiplier);

/**
 * POST /api/markets/:id/quote-odds
 * Get bet quote with odds multiplier format
 * Shows payout and profit instead of shares
 */
router.post('/:id/quote-odds', oddsMultiplierController.getBetQuoteWithOdds);

/**
 * POST /api/markets/:id/bet-odds
 * Place bet with odds multiplier (sports betting style)
 * Requires: Bearer token in Authorization header
 */
router.post('/:id/bet-odds', authenticateUser, oddsMultiplierController.placeBetWithOdds);

module.exports = router;
