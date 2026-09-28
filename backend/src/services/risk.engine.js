// Pure, explainable risk scoring (PRD 9.1). Weights are illustrative and configurable.
// No imports so the seed script can reuse it.
export const RISK_WEIGHTS = { condition: 40, criticality: 15, traffic: 15, age: 10, overdue: 10, history: 10 };

const DAY = 24 * 60 * 60 * 1000;
const round = (value) => Math.round(value * 10) / 10;

export function riskBand(score) {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

const levelWord = ["", "very low", "low", "moderate", "high", "very high"];
const conditionWord = ["", "critical", "poor", "moderate", "good", "excellent"];

// `asset` needs: condition_rating, criticality, traffic_level, commissioned_on, design_life_years,
// next_inspection_due, inspection_interval_days. `history`: { repairsLast5y, openHighDefects }.
export function computeRisk(asset, history = {}, now = new Date()) {
  const factors = [];

  const condition = asset.condition_rating ? ((5 - asset.condition_rating) / 4) * RISK_WEIGHTS.condition : 0;
  factors.push({
    key: "condition",
    label: asset.condition_rating ? `Condition ${asset.condition_rating}/5 (${conditionWord[asset.condition_rating]})` : "Condition not yet rated",
    points: round(condition),
    max: RISK_WEIGHTS.condition
  });

  const criticality = ((asset.criticality ?? 3) / 5) * RISK_WEIGHTS.criticality;
  factors.push({
    key: "criticality",
    label: `Structural importance ${levelWord[asset.criticality ?? 3]}`,
    points: round(criticality),
    max: RISK_WEIGHTS.criticality
  });

  const traffic = ((asset.traffic_level ?? 3) / 5) * RISK_WEIGHTS.traffic;
  factors.push({ key: "traffic", label: `Traffic/usage ${levelWord[asset.traffic_level ?? 3]}`, points: round(traffic), max: RISK_WEIGHTS.traffic });

  let age = 0;
  let ageLabel = "Age unknown";
  if (asset.commissioned_on && asset.design_life_years) {
    const years = (now - new Date(asset.commissioned_on)) / (365.25 * DAY);
    age = Math.min(Math.max(years, 0) / asset.design_life_years, 1) * RISK_WEIGHTS.age;
    ageLabel = `${Math.max(0, Math.floor(years))} of ${asset.design_life_years} design-life years used`;
  }
  factors.push({ key: "age", label: ageLabel, points: round(age), max: RISK_WEIGHTS.age });

  let overdue = 0;
  let overdueLabel = "Inspection not due";
  if (asset.next_inspection_due) {
    const daysOverdue = Math.floor((now - new Date(asset.next_inspection_due)) / DAY);
    if (daysOverdue > 0) {
      const interval = asset.inspection_interval_days || 365;
      overdue = Math.min(daysOverdue / interval, 1) * RISK_WEIGHTS.overdue;
      overdueLabel = daysOverdue >= 60 ? `Inspection ${Math.round(daysOverdue / 30)} months overdue` : `Inspection ${daysOverdue} days overdue`;
    }
  }
  factors.push({ key: "overdue", label: overdueLabel, points: round(overdue), max: RISK_WEIGHTS.overdue });

  const repairs = history.repairsLast5y ?? 0;
  const openHigh = history.openHighDefects ?? 0;
  const historyPoints = Math.min(repairs / 4, 1) * 5 + (openHigh > 0 ? 5 : 0);
  const historyLabel =
    repairs || openHigh
      ? [repairs ? `${repairs} repair(s) in 5 years` : null, openHigh ? `${openHigh} open high-severity defect(s)` : null].filter(Boolean).join(", ")
      : "No recent repairs or open high defects";
  factors.push({ key: "history", label: historyLabel, points: round(historyPoints), max: RISK_WEIGHTS.history });

  const score = round(factors.reduce((sum, factor) => sum + factor.points, 0));
  return { score, band: riskBand(score), factors };
}

// PRD 9.2 — transparent rules; shown as "Suggested", the officer decides.
export function recommend(asset, now = new Date()) {
  const overdue = asset.next_inspection_due && new Date(asset.next_inspection_due) < now;
  if (asset.lifecycle_status === "RETIRED") return { action: "None — asset retired", reason: "Retired assets are read-only." };
  if (asset.risk_band === "CRITICAL") {
    return { action: "Immediate inspection and prioritise for rehabilitation planning", reason: "Risk is in the critical band." };
  }
  if (asset.risk_band === "HIGH" && overdue) return { action: "Schedule an inspection this week", reason: "High risk and the inspection is overdue." };
  if (asset.risk_band === "HIGH") return { action: "Plan targeted maintenance", reason: "High risk band." };
  if (asset.risk_band === "MEDIUM" && (asset.condition_rating ?? 5) <= 3) {
    return { action: "Plan periodic maintenance", reason: "Medium risk with moderate or worse condition." };
  }
  if (overdue) return { action: "Schedule the overdue inspection", reason: "Inspection due date has passed." };
  return { action: "Routine maintenance only", reason: "Low risk." };
}
