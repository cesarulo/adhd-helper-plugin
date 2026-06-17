import { describe, it, expect } from "vitest";
import { scoredAreaFrequencies, computePortfolioStats } from "../src/stats";
import { GoalEntry } from "../src/types";

describe("scoredAreaFrequencies", () => {
  it("returns empty array for no weekly plans", () => {
    expect(scoredAreaFrequencies([])).toEqual([]);
  });

  it("scores areas proportionally to frequency", () => {
    const currentMonday = new Date("2026-06-15");
    const plans = [
      { weekMonday: new Date("2026-06-15"), areaNames: ["FÍSICA", "MENTAL"] },
      { weekMonday: new Date("2026-06-15"), areaNames: ["FÍSICA"] },
      { weekMonday: new Date("2026-06-08"), areaNames: ["MENTAL", "FAMILIAR"] },
    ];
    const result = scoredAreaFrequencies(plans, currentMonday, 0.85);
    expect(result.length).toBeGreaterThan(0);
    // FÍSICA appears twice in current week → highest score
    expect(result[0].area).toBe("FÍSICA");
  });

  it("applies exponential decay for older weeks", () => {
    const currentMonday = new Date("2026-06-15");
    const plans = [
      { weekMonday: new Date("2026-06-15"), areaNames: ["FÍSICA"] },
      { weekMonday: new Date("2026-05-04"), areaNames: ["MENTAL"] }, // 6 weeks ago
    ];
    const result = scoredAreaFrequencies(plans, currentMonday, 0.85);
    // FÍSICA in current week has weight 1.0 (since 0.85^0 = 1.0)
    // MENTAL from 6 weeks ago has weight 0.85^6 ≈ 0.377
    expect(result[0].area).toBe("FÍSICA");
  });

  it("ranks same-frequency areas by recency", () => {
    const currentMonday = new Date("2026-06-15");
    const plans = [
      { weekMonday: new Date("2026-06-01"), areaNames: ["A"] }, // 2 weeks ago, weight 0.85^2 = 0.7225
      { weekMonday: new Date("2026-06-08"), areaNames: ["B"] }, // 1 week ago, weight 0.85^1 = 0.85
    ];
    const result = scoredAreaFrequencies(plans, currentMonday, 0.85);
    expect(result[0].area).toBe("B");
    expect(result[1].area).toBe("A");
  });

  it("ignores future plans", () => {
    const currentMonday = new Date("2026-06-15");
    const plans = [
      { weekMonday: new Date("2026-06-22"), areaNames: ["FUTURE"] }, // next week
      { weekMonday: new Date("2026-06-15"), areaNames: ["CURRENT"] },
    ];
    const result = scoredAreaFrequencies(plans, currentMonday, 0.85);
    expect(result.length).toBe(1);
    expect(result[0].area).toBe("CURRENT");
  });

  it("uses default decay factor 0.85", () => {
    const currentMonday = new Date("2026-06-15");
    const plans = [
      { weekMonday: new Date("2026-06-15"), areaNames: ["A", "B"] },
    ];
    const result = scoredAreaFrequencies(plans, currentMonday);
    expect(result).toHaveLength(2);
    // Both same week, both weight 1.0
    expect(result[0].score).toBe(1);
    expect(result[1].score).toBe(1);
  });

  it("aggregates scores for same area across weeks", () => {
    const currentMonday = new Date("2026-06-15");
    const plans = [
      { weekMonday: new Date("2026-06-15"), areaNames: ["FÍSICA"] },
      { weekMonday: new Date("2026-06-08"), areaNames: ["FÍSICA"] },
      { weekMonday: new Date("2026-06-01"), areaNames: ["FÍSICA"] },
    ];
    const result = scoredAreaFrequencies(plans, currentMonday, 0.85);
    expect(result).toHaveLength(1);
    expect(result[0].area).toBe("FÍSICA");
    // 1.0 + 0.85 + 0.7225 = 2.5725
    expect(result[0].score).toBeCloseTo(2.57, 1);
  });
});

describe("computePortfolioStats", () => {
  function makeGoal(overrides: Partial<GoalEntry> = {}): GoalEntry {
    return {
      title: "Test Goal",
      path: "Goals/Test.md",
      fm: {
        area: "FÍSICA",
        origin: "endogenous",
        cadence: "recurring",
        status: "active",
        ...overrides.fm,
      },
      ...overrides,
    };
  }

  it("returns zero stats for empty goals", () => {
    const stats = computePortfolioStats([]);
    expect(stats.total).toBe(0);
  });

  it("counts goals by area and status", () => {
    const goals = [
      makeGoal({ fm: { area: "FÍSICA", origin: "endogenous", cadence: "recurring", status: "active" } }),
      makeGoal({ fm: { area: "FÍSICA", origin: "endogenous", cadence: "recurring", status: "dropped", dropReason: "resistance" } }),
      makeGoal({ fm: { area: "MENTAL", origin: "endogenous", cadence: "one-off", status: "fulfilled" } }),
    ];
    const stats = computePortfolioStats(goals);
    expect(stats.total).toBe(3);
    expect(stats.byArea.get("FÍSICA")).toEqual({ active: 1, dropped: 1, fulfilled: 0 });
    expect(stats.byArea.get("MENTAL")).toEqual({ active: 0, dropped: 0, fulfilled: 1 });
  });

  it("counts origin and cadence correctly", () => {
    const goals = [
      makeGoal({ fm: { area: "A", origin: "endogenous", cadence: "recurring", status: "active" } }),
      makeGoal({ fm: { area: "B", origin: "exogenous", cadence: "one-off", status: "active" } }),
    ];
    const stats = computePortfolioStats(goals);
    expect(stats.endogenous).toBe(1);
    expect(stats.exogenous).toBe(1);
    expect(stats.recurring).toBe(1);
    expect(stats.oneOff).toBe(1);
  });

  it("aggregates drop reasons", () => {
    const goals = [
      makeGoal({ fm: { area: "A", origin: "endogenous", cadence: "recurring", status: "dropped", dropReason: "peer_pressure" } }),
      makeGoal({ fm: { area: "B", origin: "exogenous", cadence: "one-off", status: "dropped", dropReason: "peer_pressure" } }),
      makeGoal({ fm: { area: "C", origin: "endogenous", cadence: "recurring", status: "dropped", dropReason: "lack_of_interest" } }),
    ];
    const stats = computePortfolioStats(goals);
    expect(stats.dropReasons.get("peer_pressure")).toBe(2);
    expect(stats.dropReasons.get("lack_of_interest")).toBe(1);
  });

  it("handles uncategorized area", () => {
    const goals = [
      makeGoal({ fm: { area: "", origin: "endogenous", cadence: "recurring", status: "active" } }),
    ];
    const stats = computePortfolioStats(goals);
    expect(stats.byArea.get("Uncategorized")?.active).toBe(1);
  });
});
