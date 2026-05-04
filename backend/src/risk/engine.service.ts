/**
 * NUSA HARVEST — Parametric Risk Engine
 * Calculates drought and flood risks based on rainfall thresholds.
 */

export interface RiskProfile {
  riskScore: number;       // 0 to 1 (1 is highest risk)
  recommendation: string;
  suggestedPremium: number; // in USDC
  potentialPayout: number;  // in USDC
}

export class RiskEngine {
  // Thresholds for rice crops in Indonesia
  private readonly DROUGHT_THRESHOLD_MM = 40;  // mm per month
  private readonly FLOOD_THRESHOLD_MM = 350;    // mm per week
  private readonly BASE_PREMIUM_RATE = 0.05;   // 5% of coverage

  /**
   * Calculate risk based on 7-day forecast and historical averages
   * @param currentRainfall Seven day cumulative rainfall estimate
   * @param cropType Type of crop (RICE, CORN, COFFEE)
   * @param hectares Land size in hectares
   */
  public calculateClimateRisk(
    currentRainfall: number,
    cropType: string,
    hectares: number
  ): RiskProfile {
    let riskScore = 0;
    // Standard payout baseline set to $750 per hectare
    let payoutAmount = hectares * 750; 

    // logic for drought risk (PRECISION: < 40mm triggers critical score)
    if (currentRainfall < this.DROUGHT_THRESHOLD_MM) {
      riskScore = (this.DROUGHT_THRESHOLD_MM - currentRainfall) / this.DROUGHT_THRESHOLD_MM;
      // Boost score if near total drought
      if (currentRainfall < 10) riskScore = Math.max(riskScore, 0.95);
    } 
    // logic for flood risk (PRECISION: > 350mm triggers critical score)
    else if (currentRainfall > this.FLOOD_THRESHOLD_MM) {
      riskScore = (currentRainfall - this.FLOOD_THRESHOLD_MM) / this.FLOOD_THRESHOLD_MM;
    }

    // Clamp risk score (0 to 1.0)
    riskScore = Math.min(Math.max(riskScore, 0), 1);

    // Calculate premium (Base 5% + risk adjusted)
    const suggestedPremium = (payoutAmount * this.BASE_PREMIUM_RATE) + (riskScore * payoutAmount * 0.15);

    let recommendation = "Low Risk: Standard protection recommended.";
    if (riskScore > 0.9) {
      recommendation = "CRITICAL RISK: Automatic on-chain claim trigger imminent. Verify wallet balance.";
    } else if (riskScore > 0.6) {
      recommendation = "High Risk: Significant climate volatility detected. Mitigation required.";
    } else if (riskScore > 0.3) {
      recommendation = "Moderate Risk: Elevated rainfall deficit monitoring active.";
    }

    return {
      riskScore: Math.round(riskScore * 100) / 100,
      recommendation,
      suggestedPremium: Math.round(suggestedPremium * 100) / 100,
      potentialPayout: payoutAmount
    };
  }

  /**
   * Monitor for insurance trigger
   * If rainfall < 40mm in the last 30 days, trigger payout.
   */
  public checkInsuranceTrigger(rainfall30d: number): boolean {
    return rainfall30d < this.DROUGHT_THRESHOLD_MM;
  }
}
