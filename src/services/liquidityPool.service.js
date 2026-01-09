/**
 * Liquidity Pool Service
 *
 * Manages liquidity pools for prediction markets.
 * Handles pool initialization, validation, and state management.
 */

const oddsCalculation = require('./oddsCalculation.service');

class LiquidityPoolService {
  constructor() {
    // Default pool size from environment or 1000
    this.DEFAULT_POOL_SIZE = parseFloat(process.env.DEFAULT_POOL_SIZE) || 1000;

    // Minimum pool size to prevent tiny pools
    this.MIN_POOL_SIZE = 100;

    // Maximum pool size to prevent excessive capital lockup
    this.MAX_POOL_SIZE = 100000;

    console.log(`Liquidity pool service initialized with default size: ${this.DEFAULT_POOL_SIZE}`);
  }

  /**
   * Initialize a symmetric pool (50/50 split)
   * Used for markets with no initial price bias
   *
   * @param {number} poolSize - Size for each side (default: 1000)
   * @returns {object} { yesPool, noPool, k }
   */
  initializeSymmetricPool(poolSize = this.DEFAULT_POOL_SIZE) {
    this.validatePoolSize(poolSize);

    const yesPool = poolSize;
    const noPool = poolSize;
    const k = oddsCalculation.calculateLiquidityConstant(yesPool, noPool);

    return {
      yesPool,
      noPool,
      liquidityConstant: k,
      initialPoolSize: poolSize,
      initialYesPrice: 0.5,
      initialNoPrice: 0.5
    };
  }

  /**
   * Initialize an asymmetric pool with custom starting price
   * Used for markets with a known initial probability
   *
   * Example: 70% YES probability
   *   totalLiquidity = 2000
   *   noPool = 2000 × 0.70 = 1400 (YES price = noPool / total)
   *   yesPool = 2000 × 0.30 = 600
   *   k = 1400 × 600 = 840,000
   *
   * @param {number} totalLiquidity - Total tokens across both pools
   * @param {number} targetYesPrice - Desired YES price (0-1)
   * @returns {object} { yesPool, noPool, k }
   */
  initializeAsymmetricPool(totalLiquidity, targetYesPrice) {
    if (targetYesPrice <= 0 || targetYesPrice >= 1) {
      throw new Error('Target YES price must be between 0 and 1');
    }

    this.validatePoolSize(totalLiquidity / 2); // Validate half of total

    // YES price = noPool / (yesPool + noPool)
    // Therefore: noPool = targetYesPrice × totalLiquidity
    const noPool = totalLiquidity * targetYesPrice;
    const yesPool = totalLiquidity - noPool;

    const k = oddsCalculation.calculateLiquidityConstant(yesPool, noPool);

    // Verify prices match target
    const actualYesPrice = oddsCalculation.calculateYesPrice(yesPool, noPool);
    const priceDifference = Math.abs(actualYesPrice - targetYesPrice);

    if (priceDifference > 0.001) {
      console.warn(`Price mismatch: target ${targetYesPrice}, actual ${actualYesPrice}`);
    }

    return {
      yesPool,
      noPool,
      liquidityConstant: k,
      initialPoolSize: totalLiquidity / 2,
      initialYesPrice: targetYesPrice,
      initialNoPrice: 1 - targetYesPrice
    };
  }

  /**
   * Calculate optimal pool size based on expected volume
   *
   * Rule of thumb:
   * - Pool should be 10x expected max single bet
   * - Pool should be 2x expected daily volume
   *
   * @param {number} expectedDailyVolume - Expected trading volume per day
   * @param {number} expectedMaxBet - Expected maximum single bet
   * @returns {number} Recommended pool size
   */
  calculateOptimalPoolSize(expectedDailyVolume, expectedMaxBet) {
    const volumeBasedSize = expectedDailyVolume * 2;
    const betBasedSize = expectedMaxBet * 10;

    // Use the larger of the two
    const optimalSize = Math.max(volumeBasedSize, betBasedSize);

    // Clamp to min/max range
    return Math.max(
      this.MIN_POOL_SIZE,
      Math.min(this.MAX_POOL_SIZE, optimalSize)
    );
  }

  /**
   * Calculate pool utilization percentage
   * Shows how much liquidity has been used
   *
   * @param {number} currentYesPool - Current YES pool
   * @param {number} currentNoPool - Current NO pool
   * @param {number} initialPoolSize - Original pool size per side
   * @returns {object} Utilization metrics
   */
  calculateUtilization(currentYesPool, currentNoPool, initialPoolSize) {
    const initialYesPool = initialPoolSize;
    const initialNoPool = initialPoolSize;

    const yesUtilization = Math.abs(currentYesPool - initialYesPool) / initialYesPool;
    const noUtilization = Math.abs(currentNoPool - initialNoPool) / initialNoPool;

    const avgUtilization = (yesUtilization + noUtilization) / 2;

    return {
      yesUtilization,
      noUtilization,
      avgUtilization,
      yesUtilizationPercentage: `${(yesUtilization * 100).toFixed(2)}%`,
      noUtilizationPercentage: `${(noUtilization * 100).toFixed(2)}%`,
      avgUtilizationPercentage: `${(avgUtilization * 100).toFixed(2)}%`
    };
  }

  /**
   * Check if pool has sufficient liquidity for a bet
   *
   * @param {number} betAmount - Amount to bet
   * @param {number} outputPool - Pool tokens will be drawn from
   * @param {number} maxUtilization - Maximum allowed utilization (default: 0.9 = 90%)
   * @returns {boolean} True if sufficient liquidity
   */
  hasSufficientLiquidity(betAmount, outputPool, maxUtilization = 0.9) {
    // Estimate tokens that would be received (simplified)
    // Full calculation would need k, but this is a safety check
    const estimatedTokens = betAmount * 0.9; // Conservative estimate

    // Check if estimated tokens exceed max utilization
    const utilization = estimatedTokens / outputPool;

    return utilization <= maxUtilization;
  }

  /**
   * Validate pool size is within acceptable range
   *
   * @param {number} poolSize - Pool size to validate
   * @returns {boolean} True if valid
   * @throws {Error} If pool size is out of range
   */
  validatePoolSize(poolSize) {
    if (poolSize < this.MIN_POOL_SIZE) {
      throw new Error(
        `Pool size ${poolSize} too small. Minimum: ${this.MIN_POOL_SIZE}`
      );
    }

    if (poolSize > this.MAX_POOL_SIZE) {
      throw new Error(
        `Pool size ${poolSize} too large. Maximum: ${this.MAX_POOL_SIZE}`
      );
    }

    return true;
  }

  /**
   * Validate pool state matches constant product
   *
   * @param {number} yesPool - YES pool size
   * @param {number} noPool - NO pool size
   * @param {number} k - Expected constant
   * @returns {boolean} True if valid
   */
  validatePoolState(yesPool, noPool, k) {
    return oddsCalculation.validatePoolState(yesPool, noPool, k);
  }

  /**
   * Get pool health metrics
   * Identifies potential issues with pool state
   *
   * @param {number} yesPool - Current YES pool
   * @param {number} noPool - Current NO pool
   * @param {number} initialPoolSize - Original pool size
   * @returns {object} Health metrics and warnings
   */
  getPoolHealth(yesPool, noPool, initialPoolSize) {
    const warnings = [];
    const utilization = this.calculateUtilization(yesPool, noPool, initialPoolSize);

    // Check for high utilization (> 80%)
    if (utilization.avgUtilization > 0.8) {
      warnings.push({
        level: 'warning',
        message: 'High pool utilization - consider adding liquidity'
      });
    }

    // Check for very high utilization (> 95%)
    if (utilization.avgUtilization > 0.95) {
      warnings.push({
        level: 'critical',
        message: 'Critical pool utilization - large bets may fail'
      });
    }

    // Check for imbalanced pools (ratio > 10:1)
    const ratio = Math.max(yesPool / noPool, noPool / yesPool);
    if (ratio > 10) {
      warnings.push({
        level: 'info',
        message: 'Pool heavily skewed - prices may be extreme'
      });
    }

    // Check for very small pools
    if (yesPool < this.MIN_POOL_SIZE || noPool < this.MIN_POOL_SIZE) {
      warnings.push({
        level: 'critical',
        message: 'Pool size critically low'
      });
    }

    return {
      healthy: warnings.length === 0,
      utilization,
      ratio: {
        yesToNo: yesPool / noPool,
        noToYes: noPool / yesPool
      },
      warnings
    };
  }

  /**
   * Get pool configuration
   *
   * @returns {object} Pool settings
   */
  getPoolSettings() {
    return {
      defaultPoolSize: this.DEFAULT_POOL_SIZE,
      minPoolSize: this.MIN_POOL_SIZE,
      maxPoolSize: this.MAX_POOL_SIZE
    };
  }
}

// Export singleton instance
module.exports = new LiquidityPoolService();
