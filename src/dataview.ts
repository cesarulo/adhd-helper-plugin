import { App, Notice } from "obsidian";
import { ScoredArea } from "./types";
import { scoredAreaFrequencies } from "./stats";
import { UI } from "./ui-strings";

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/**
 * Get the Dataview plugin API, or null if not installed.
 * Dataview is required for area frequency scoring.
 */
function getDataviewAPI(app: App): any | null {
  const dv = (app as any).plugins?.plugins?.["dataview"]?.api;
  return dv || null;
}

/**
 * Parse weekly plan files using Dataview and score areas by frequency.
 * Falls back gracefully with a Notice if Dataview is not installed.
 */
export async function getScoredAreas(app: App, topN = 6): Promise<ScoredArea[]> {
  const dv = getDataviewAPI(app);
  if (!dv) {
    new Notice(UI.dataviewMissing);
    return [];
  }

  const pages = dv.pages('"1 - Planeamiento"').where((p: any) => p.file.name.startsWith("Semana"));
  const plans: { weekMonday: Date; areaNames: string[] }[] = [];

  for (const page of pages) {
    try {
      const name: string = page.file.name; // e.g. "Semana 2026-06-15"
      const dateMatch = name.match(/(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const weekMonday = new Date(dateMatch[1] + "T00:00:00");

      // Extract area names from the weekly objectives section
      const content: string = await dv.io.load(page.file.path);
      const areaNames: string[] = [];
      const objSection = content.match(/# Objetivos Semanales\n([\s\S]*?)(?=\n# |$)/);
      if (objSection) {
        for (const line of objSection[1].split("\n")) {
          const match = line.match(/^- (.+)$/);
          if (match) areaNames.push(match[1].trim());
        }
      }

      // Also pick up areas from daily Objetivos por Área sections
      const dailyAreas = content.match(/## Objetivos por Área\n([\s\S]*?)(?=\n##|$)/g);
      if (dailyAreas) {
        for (const section of dailyAreas) {
          for (const line of section.split("\n")) {
            const match = line.match(/^- (.+)$/);
            if (match && !areaNames.includes(match[1].trim())) areaNames.push(match[1].trim());
          }
        }
      }

      if (areaNames.length > 0) {
        plans.push({ weekMonday, areaNames });
      }
    } catch {
      // skip malformed pages
    }
  }

  if (plans.length === 0) return [];

  const currentMonday = getCurrentMonday();
  return scoredAreaFrequencies(plans, currentMonday).slice(0, topN);
}

/**
 * Like getScoredAreas, but separates by day of week.
 * Returns a Map of day name → scored areas, so each day gets
 * its own prepopulated area headers based on what you typically
 * work on that day of the week.
 */
export async function getScoredAreasByDay(app: App, topN = 4): Promise<Map<string, ScoredArea[]>> {
  const dv = getDataviewAPI(app);
  const result = new Map<string, ScoredArea[]>();
  if (!dv) {
    new Notice(UI.dataviewMissing);
    return result;
  }

  const pages = dv.pages('"1 - Planeamiento"').where((p: any) => p.file.name.startsWith("Semana"));
  const plansByDay = new Map<string, { weekMonday: Date; areaNames: string[] }[]>();
  for (const day of DAY_NAMES) plansByDay.set(day, []);

  for (const page of pages) {
    try {
      const name: string = page.file.name;
      const dateMatch = name.match(/(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const content: string = await dv.io.load(page.file.path);
      const lines = content.split("\n");

      let currentDay = "";
      for (let i = 0; i < lines.length; i++) {
        const dayMatch = lines[i].match(/^# (Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)$/);
        if (dayMatch) {
          currentDay = dayMatch[1];
          continue;
        }
        if (!currentDay) continue;

        // Look for Objetivos por Área section within this day
        if (lines[i] === "## Objetivos por Área") {
          const areaNames: string[] = [];
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].startsWith("#")) break;
            const match = lines[j].match(/^- (.+)$/);
            if (match) areaNames.push(match[1].trim());
          }
          if (areaNames.length > 0) {
            const weekMonday = new Date(dateMatch[1] + "T00:00:00");
            plansByDay.get(currentDay)!.push({ weekMonday, areaNames });
          }
        }
      }
    } catch { /* skip malformed */ }
  }

  const currentMonday = getCurrentMonday();
  for (const [day, plans] of plansByDay) {
    if (plans.length > 0) {
      result.set(day, scoredAreaFrequencies(plans, currentMonday).slice(0, topN));
    }
  }

  return result;
}

function getCurrentMonday(): Date {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}
