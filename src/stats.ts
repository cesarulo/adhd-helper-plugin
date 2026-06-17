import { GoalEntry, PortfolioStats, ScoredArea } from "./types";

const DEFAULT_DECAY_FACTOR = 0.85;

/**
 * Score areas by frequency across weekly plan files using exponential decay.
 * Most recent weeks have highest weight; older weeks decay exponentially.
 *
 * @param weeklyPlans Map of filename → parsed content (area names per week)
 * @param currentWeekMonday Date of current week's Monday
 * @param decayFactor Exponential decay factor (default 0.85, half-life ~4.3 weeks)
 * @returns Areas sorted by score descending
 */
export function scoredAreaFrequencies(
  weeklyPlans: { weekMonday: Date; areaNames: string[] }[],
  currentWeekMonday: Date = new Date(),
  decayFactor: number = DEFAULT_DECAY_FACTOR,
): ScoredArea[] {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const areaScores = new Map<string, number>();

  for (const plan of weeklyPlans) {
    const weeksAgo = (currentWeekMonday.getTime() - plan.weekMonday.getTime()) / msPerWeek;
    if (weeksAgo < 0) continue; // future plans don't count
    const weight = Math.pow(decayFactor, weeksAgo);

    for (const area of plan.areaNames) {
      const current = areaScores.get(area) || 0;
      areaScores.set(area, current + weight);
    }
  }

  return [...areaScores.entries()]
    .map(([area, score]) => ({ area, score: Math.round(score * 100) / 100 }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Compute portfolio-level stats from a list of goals.
 * Pure function — no Obsidian dependencies.
 */
export function computePortfolioStats(goals: GoalEntry[]): PortfolioStats {
  const byArea = new Map<string, { active: number; dropped: number; fulfilled: number }>();
  let endogenous = 0;
  let exogenous = 0;
  let recurring = 0;
  let oneOff = 0;
  let deferrable = 0;
  let nonDeferrable = 0;
  const dropReasons = new Map<string, number>();

  for (const g of goals) {
    const a = g.fm.area || "Uncategorized";
    if (!byArea.has(a)) byArea.set(a, { active: 0, dropped: 0, fulfilled: 0 });
    const entry = byArea.get(a)!;
    if (g.fm.status === "active") entry.active++;
    else if (g.fm.status === "dropped") entry.dropped++;
    else entry.fulfilled++;

    if (g.fm.origin === "endogenous") endogenous++;
    else exogenous++;

    if (g.fm.cadence === "recurring") recurring++;
    else oneOff++;

    const def = (g.fm as any).deferrability;
    if (def === "non-deferrable") nonDeferrable++;
    else deferrable++;

    if (g.fm.dropReason) {
      dropReasons.set(g.fm.dropReason, (dropReasons.get(g.fm.dropReason) || 0) + 1);
    }
  }

  return {
    total: goals.length,
    byArea,
    endogenous,
    exogenous,
    recurring,
    oneOff,
    deferrable,
    nonDeferrable,
    dropReasons,
  };
}
