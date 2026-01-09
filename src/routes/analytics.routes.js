/**
 * Analytics Routes
 * Market analytics and ML configuration endpoints
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');

/**
 * GET /api/analytics/markets
 * Get market analytics and statistics
 */
router.get('/markets', async (req, res, next) => {
  try {
    // Fetch all markets with stats
    const { data: markets, error } = await supabase
      .from('markets')
      .select('*')
      .order('total_volume', { ascending: false });

    if (error) throw error;

    // Calculate aggregated stats
    const totalMarkets = markets.length;
    const activeMarkets = markets.filter(m => m.status === 'active').length;
    const closedMarkets = markets.filter(m => m.status === 'closed').length;
    const resolvedMarkets = markets.filter(m => m.status === 'resolved').length;

    // Calculate total volume
    const totalVolume = markets.reduce((sum, m) => sum + (m.total_volume || 0), 0);

    // Calculate average prices
    const avgYesPrice = markets.reduce((sum, m) => sum + m.yes_price, 0) / markets.length;
    const avgNoPrice = markets.reduce((sum, m) => sum + m.no_price, 0) / markets.length;

    // Get total bettors
    const totalBettors = markets.reduce((sum, m) => sum + (m.bettor_count || 0), 0);

    // Top markets by volume
    const topByVolume = markets.slice(0, 10).map(m => ({
      id: m.id,
      title: m.title,
      category: m.category,
      volume: m.total_volume,
      bettorCount: m.bettor_count,
      yesPrice: m.yes_price,
      noPrice: m.no_price
    }));

    res.json({
      success: true,
      data: {
        summary: {
          totalMarkets,
          activeMarkets,
          closedMarkets,
          resolvedMarkets,
          totalVolume,
          avgYesPrice,
          avgNoPrice,
          totalBettors
        },
        topMarkets: topByVolume,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/market/:id
 * Get detailed analytics for a specific market
 */
router.get('/market/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch market
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('*')
      .eq('id', id)
      .single();

    if (marketError) throw marketError;
    if (!market) {
      return res.status(404).json({
        success: false,
        error: 'Market not found'
      });
    }

    // Fetch bets for this market
    const { data: bets, error: betsError } = await supabase
      .from('bets')
      .select('*')
      .eq('market_id', id);

    if (betsError) throw betsError;

    // Calculate bet distribution
    const yesBets = bets.filter(b => b.outcome === 'yes');
    const noBets = bets.filter(b => b.outcome === 'no');

    const yesVolume = yesBets.reduce((sum, b) => sum + b.amount, 0);
    const noVolume = noBets.reduce((sum, b) => sum + b.amount, 0);

    res.json({
      success: true,
      data: {
        market,
        bets: {
          total: bets.length,
          yes: yesBets.length,
          no: noBets.length,
          yesVolume,
          noVolume
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/config
 * Get ML configuration
 */
router.get('/config', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('odds_guidance_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;

    res.json({
      success: true,
      data: data || {
        houseMargin: 0.02,
        poolSize: 1000,
        volatility: 1.0,
        minLiquidity: 100
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/analytics/config
 * Update ML configuration
 */
router.post('/config', async (req, res, next) => {
  try {
    const config = req.body;

    // Validate config
    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid configuration'
      });
    }

    // Save to database
    const { data, error } = await supabase
      .from('odds_guidance_config')
      .upsert({
        id: 1,
        config,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data,
      message: 'Configuration updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/analytics/health-check
 * Log a health check
 */
router.post('/health-check', async (req, res, next) => {
  try {
    const { status, responseTime } = req.body;

    const { data, error } = await supabase
      .from('odds_api_health_checks')
      .insert({
        status: status || 'ok',
        response_time: responseTime || 0,
        checked_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
