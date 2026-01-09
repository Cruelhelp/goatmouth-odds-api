/**
 * Odds Converter Service
 *
 * Converts CPMM probability-based pricing to traditional sports betting odds
 * Provides familiar betting experience with multipliers instead of shares
 */

class OddsConverterService {
  /**
   * Convert probability (0-1) to decimal odds multiplier
   *
   * Formula: odds = 1 / probability
   *
   * Examples:
   *   probability 0.50 (50%) → 2.0x odds (even money)
   *   probability 0.90 (90%) → 1.11x odds (heavy favorite)
   *   probability 0.10 (10%) → 10.0x odds (big underdog)
   *
   * @param {number} probability - Probability between 0 and 1
   * @returns {number} Decimal odds multiplier
   */
  probabilityToOdds(probability) {
    if (probability <= 0 || probability >= 1) {
      throw new Error('Probability must be between 0 and 1');
    }

    return 1 / probability;
  }

  /**
   * Convert decimal odds back to probability
   *
   * Formula: probability = 1 / odds
   *
   * @param {number} odds - Decimal odds multiplier
   * @returns {number} Probability between 0 and 1
   */
  oddsToProbability(odds) {
    if (odds <= 1) {
      throw new Error('Odds must be greater than 1');
    }

    return 1 / odds;
  }

  /**
   * Calculate payout for a bet at given odds
   *
   * Payout includes original stake + profit
   *
   * @param {number} stake - Amount bet
   * @param {number} odds - Decimal odds multiplier
   * @returns {object} { payout, profit, stake }
   */
  calculatePayout(stake, odds) {
    const payout = stake * odds;
    const profit = payout - stake;

    return {
      stake,
      odds,
      payout,
      profit,
      roi: (profit / stake) * 100 // Return on investment %
    };
  }

  /**
   * Apply house margin to odds (makes odds less favorable)
   *
   * House margin reduces payout by making odds lower
   * Example: 2.0x odds with 5% margin → 1.90x odds
   *
   * @param {number} odds - Fair odds
   * @param {number} marginPercentage - Margin as decimal (e.g., 0.05 for 5%)
   * @returns {number} Odds with margin applied
   */
  applyMarginToOdds(odds, marginPercentage = 0.02) {
    // Convert odds to implied probability
    const probability = 1 / odds;

    // Increase probability by margin (reduces payout)
    const adjustedProbability = probability * (1 + marginPercentage);

    // Ensure probability doesn't exceed 0.99
    const cappedProbability = Math.min(adjustedProbability, 0.99);

    // Convert back to odds
    return 1 / cappedProbability;
  }

  /**
   * Format odds for display
   *
   * @param {number} odds - Decimal odds
   * @param {string} format - 'decimal', 'american', or 'fractional'
   * @returns {string} Formatted odds string
   */
  formatOdds(odds, format = 'decimal') {
    switch (format) {
      case 'decimal':
        // European style: 2.50x
        return `${odds.toFixed(2)}x`;

      case 'american':
        // American style: +150 or -200
        if (odds >= 2.0) {
          return `+${((odds - 1) * 100).toFixed(0)}`;
        } else {
          return `-${(100 / (odds - 1)).toFixed(0)}`;
        }

      case 'fractional':
        // UK style: 3/2 or 1/4
        const numerator = (odds - 1) * 100;
        const denominator = 100;
        const gcd = this.gcd(numerator, denominator);
        return `${numerator / gcd}/${denominator / gcd}`;

      default:
        return `${odds.toFixed(2)}x`;
    }
  }

  /**
   * Calculate greatest common divisor (for fractional odds)
   */
  gcd(a, b) {
    return b === 0 ? a : this.gcd(b, a % b);
  }

  /**
   * Calculate fair odds from betting volumes
   * Uses simple proportion method
   *
   * @param {number} yesVolume - Total volume on YES
   * @param {number} noVolume - Total volume on NO
   * @returns {object} { yesOdds, noOdds }
   */
  calculateOddsFromVolume(yesVolume, noVolume) {
    const totalVolume = yesVolume + noVolume;

    if (totalVolume === 0) {
      // No bets yet, return even odds
      return { yesOdds: 2.0, noOdds: 2.0 };
    }

    // Probability is proportional to volume
    const yesProbability = noVolume / totalVolume;
    const noProbability = yesVolume / totalVolume;

    return {
      yesOdds: this.probabilityToOdds(yesProbability),
      noOdds: this.probabilityToOdds(noProbability)
    };
  }

  /**
   * Calculate odds from CPMM pools
   *
   * @param {number} yesPool - YES token pool
   * @param {number} noPool - NO token pool
   * @returns {object} { yesOdds, noOdds, yesProbability, noProbability }
   */
  calculateOddsFromPools(yesPool, noPool) {
    const totalPool = yesPool + noPool;

    // CPMM probability calculation
    const yesProbability = noPool / totalPool;
    const noProbability = yesPool / totalPool;

    // Convert to odds
    const yesOdds = this.probabilityToOdds(yesProbability);
    const noOdds = this.probabilityToOdds(noProbability);

    return {
      yesOdds,
      noOdds,
      yesProbability,
      noProbability
    };
  }

  /**
   * Get bet recommendation based on odds
   *
   * @param {number} odds - Current odds
   * @returns {string} Recommendation text
   */
  getOddsCategory(odds) {
    if (odds >= 10.0) {
      return 'Long Shot - High risk, high reward';
    } else if (odds >= 5.0) {
      return 'Underdog - Decent value';
    } else if (odds >= 2.5) {
      return 'Moderate - Balanced odds';
    } else if (odds >= 1.5) {
      return 'Favorite - Lower risk';
    } else {
      return 'Heavy Favorite - Very likely, low payout';
    }
  }

  /**
   * Calculate implied probability including house margin
   * Shows what probability is "priced in" to the odds
   *
   * @param {number} yesOdds - YES odds
   * @param {number} noOdds - NO odds
   * @returns {object} Analysis of odds fairness
   */
  analyzeOddsMargin(yesOdds, noOdds) {
    const yesImplied = 1 / yesOdds;
    const noImplied = 1 / noOdds;
    const totalImplied = yesImplied + noImplied;

    // Overround (bookmaker margin)
    const overround = (totalImplied - 1) * 100;

    // Fair odds (without margin)
    const fairYesOdds = 1 / (yesImplied / totalImplied);
    const fairNoOdds = 1 / (noImplied / totalImplied);

    return {
      yesImpliedProbability: yesImplied,
      noImpliedProbability: noImplied,
      totalImplied,
      overround: overround.toFixed(2) + '%',
      fairYesOdds,
      fairNoOdds,
      houseEdge: overround.toFixed(2) + '%'
    };
  }
}

module.exports = new OddsConverterService();
