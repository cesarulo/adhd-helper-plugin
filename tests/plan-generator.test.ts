import { describe, it, expect, vi } from "vitest";
import { weekPlanContent, buildDaySection, weekPlanPath } from "../src/plan-generator";
import { AreaSummary, GoalEntry, GoalStatus } from "../src/types";

function makeGoal(title: string, area: string, status: GoalStatus = "active"): GoalEntry {
  return {
    title, path: "",
    fm: { area, origin: "endogenous", cadence: "recurring", status },
  };
}

function makeArea(name: string, goals: GoalEntry[]): AreaSummary {
  return {
    name,
    activeCount: goals.filter(g => g.fm.status === "active").length,
    droppedCount: goals.filter(g => g.fm.status === "dropped").length,
    fulfilledCount: goals.filter(g => g.fm.status === "fulfilled").length,
    goals,
  };
}

describe("weekPlanContent", () => {
  it("generates weekly objectives from active goals", () => {
    const areas = [
      makeArea("FÍSICA", [makeGoal("Gym", "FÍSICA"), makeGoal("Meditation", "FÍSICA")]),
      makeArea("MENTAL", [makeGoal("Read", "MENTAL")]),
    ];
    const content = weekPlanContent(areas);
    expect(content).toContain("# Objetivos Semanales");
    expect(content).toContain("- FÍSICA");
    expect(content).toContain("\t- Gym");
    expect(content).toContain("\t- Meditation");
    expect(content).toContain("- MENTAL");
    expect(content).toContain("\t- Read");
  });

  it("skips areas with no active goals in objectives", () => {
    const areas = [
      makeArea("FÍSICA", [makeGoal("Gym", "FÍSICA", "dropped")]),
    ];
    const content = weekPlanContent(areas);
    expect(content).not.toContain("- FÍSICA");
  });

  it("includes all 7 days with default sections", () => {
    const content = weekPlanContent([]);
    expect(content).toContain("# Lunes");
    expect(content).toContain("# Martes");
    expect(content).toContain("# Miércoles");
    expect(content).toContain("# Jueves");
    expect(content).toContain("# Viernes");
    expect(content).toContain("# Sábado");
    expect(content).toContain("# Domingo");
    expect(content).toContain("## Objetivos por Área");
    expect(content).toContain("## Horarios");
  });

  it("prepopulates area headers when prepopulatedAreas provided", () => {
    const content = weekPlanContent([], ["FÍSICA", "MENTAL"]);
    const lines = content.split("\n");
    const lunesIdx = lines.findIndex(l => l === "# Lunes");
    // After Lunes header, next lines should be prepopulated areas
    const postLunesSection = lines.slice(lunesIdx + 1).join("\n");
    expect(postLunesSection).toContain("- FÍSICA");
    expect(postLunesSection).toContain("- MENTAL");
  });
});

describe("buildDaySection", () => {
  it("builds a full day section", () => {
    const section = buildDaySection("Lunes", {
      timedTasks: [
        { desc: "Medication", time: "07:00", area: "FÍSICA" },
        { desc: "Gym", time: "09:00", area: "FÍSICA" },
      ],
      flexByArea: new Map([
        ["MENTAL", ["Meditate", "Read"]],
        ["TRÁMITES", ["Pay bills"]],
      ]),
    });
    expect(section).toContain("# Lunes");
    expect(section).toContain("## Objetivos por Área");
    expect(section).toContain("- MENTAL");
    expect(section).toContain("\t- Meditate");
    expect(section).toContain("\t- Read");
    expect(section).toContain("- TRÁMITES");
    expect(section).toContain("\t- Pay bills");
    expect(section).toContain("## Horarios");
    expect(section).toContain("- 07:00 - Medication");
    expect(section).toContain("- 09:00 - Gym");
  });

  it("sorts timed tasks by time", () => {
    const section = buildDaySection("Lunes", {
      timedTasks: [
        { desc: "Late", time: "09:00", area: "A" },
        { desc: "Early", time: "07:00", area: "A" },
      ],
      flexByArea: new Map(),
    });
    const earlyIdx = section.indexOf("07:00 - Early");
    const lateIdx = section.indexOf("09:00 - Late");
    expect(earlyIdx).toBeLessThan(lateIdx);
  });
});

describe("weekPlanPath", () => {
  it("generates correct path with 1 - Planeamiento prefix", () => {
    vi.setSystemTime(new Date("2026-06-16T12:00:00")); // Tuesday
    const path = weekPlanPath();
    expect(path).toBe("1 - Planeamiento/2026/2026-Q2/Semana 2026-06-15.md");
    vi.useRealTimers();
  });

  it("wraps Monday back to previous week", () => {
    vi.setSystemTime(new Date("2026-01-05T12:00:00")); // Monday
    const path = weekPlanPath();
    expect(path).toBe("1 - Planeamiento/2026/2026-Q1/Semana 2026-01-05.md");
    vi.useRealTimers();
  });

  it("handles year boundary (Jan 1 = Thursday → Monday Dec 29)", () => {
    vi.setSystemTime(new Date("2026-01-01T12:00:00")); // Thursday
    const path = weekPlanPath();
    expect(path).toBe("1 - Planeamiento/2025/2025-Q4/Semana 2025-12-29.md");
    vi.useRealTimers();
  });
});

describe("accented area names in prepopulation", () => {
  it("handles accented area names in prepopulatedAreas", () => {
    const content = weekPlanContent([], ["FÍSICA", "TRÁMITES", "REALIZACIONAL"]);
    expect(content).toContain("- FÍSICA");
    expect(content).toContain("- TRÁMITES");
    expect(content).toContain("- REALIZACIONAL");
  });
});
