import { AreaSummary } from "./types";
import { UI } from "./ui-strings";

/** Monday of the current ISO week */
export function weekPlanPath(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  const quarter = Math.ceil((monday.getMonth() + 1) / 3);
  return `Planeamiento/${y}/${y}-Q${quarter}/Semana ${y}-${m}-${d}.md`;
}

/** Spanish day name for today (Monday = Lunes) */
export function todayDayName(): string {
  const day = new Date().getDay();
  return UI.dayNames[day === 0 ? 6 : day - 1];
}

/**
 * Generate a full week plan markdown string.
 * @param areas Active goals grouped by area
 * @param prepopulatedAreas Optional list of area names to pre-fill in daily sections
 */
export function weekPlanContent(areas: AreaSummary[], prepopulatedAreas?: string[]): string {
  let md = "# Objetivos Semanales\n";
  for (const area of areas) {
    const activeGoals = area.goals.filter(g => g.fm.status === "active");
    if (activeGoals.length === 0) continue;
    md += `- ${area.name}\n`;
    for (const goal of activeGoals) {
      md += `\t- ${goal.title}\n`;
    }
  }
  md += "\n";

  const areasToPrepopulate = prepopulatedAreas && prepopulatedAreas.length > 0
    ? prepopulatedAreas
    : null;

  for (const dayName of UI.dayNames) {
    md += `# ${dayName}\n`;
    md += "## Objetivos por Área\n";
    if (areasToPrepopulate) {
      for (const areaName of areasToPrepopulate) {
        md += `- ${areaName}\n`;
      }
    }
    md += "## Horarios\n";
    md += "- \n\n";
  }
  return md;
}

/**
 * Generate a single day section for appending to a week plan.
 */
export interface PopulateInput {
  timedTasks: { desc: string; time: string; area: string }[];
  flexByArea: Map<string, string[]>;
}

export function buildDaySection(dayName: string, input: PopulateInput): string {
  let section = `# ${dayName}\n`;
  section += "## Objetivos por Área\n";
  for (const [area, tasks] of input.flexByArea) {
    section += `- ${area}\n`;
    for (const t of tasks) {
      section += `\t- ${t}\n`;
    }
  }
  section += "## Horarios\n";
  input.timedTasks.sort((a, b) => a.time.localeCompare(b.time));
  for (const t of input.timedTasks) {
    section += `- ${t.time} - ${t.desc}\n`;
  }
  section += "\n";
  return section;
}
