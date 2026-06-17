# ADHD Helper - Obsidian Plugin

A mission control panel for life areas and goals, built for ADHD brains.

## What it does

- **Mission Control view** — see all your life areas at a glance, with active/dropped/fulfilled goal counts per area
- **Goal portfolio** — each goal shows its origin (endogenous vs exogenous), cadence (recurring vs one-off), deferrability, and recurring task specs
- **Drop goals with reasons** — resistance, trauma response, lack of interest, peer pressure, external resolution, or other
- **Recurring task specs** — define what daily tasks a recurring goal generates (timed/flex, deferrable/non-deferrable, start time)
- **Sticky area nav** — clickable area tiles that anchor-scroll to sections below

## Dev Setup

```bash
npm install
npm run dev     # watch mode, rebuilds on change
npm run build   # production build
```

Copy `main.js`, `styles.css`, and `manifest.json` to your vault's `.obsidian/plugins/adhd-helper/` after building.

## Installation

1. Download the latest release or clone this repo
2. Run `npm install && npm run build`
3. Copy `main.js`, `styles.css`, and `manifest.json` into your vault's `.obsidian/plugins/adhd-helper/`
4. Optionally copy the `sample-vault/Goals/` folder into your vault root
5. In Obsidian: Settings → Community Plugins → turn off Restricted Mode if needed
6. Enable "ADHD Helper" in the installed plugins list
7. Press cmd+P → "Open Mission Control" or click the target icon in the ribbon

## Goal File Format

Goals live as markdown files in a `Goals/` folder (configurable in settings) with YAML frontmatter:

```yaml
---
area: FÍSICA
origin: endogenous
cadence: recurring
deferrability: deferrable
status: active
sourceNote: "Therapist recommended, May 2026"
recurringTasks:
  - description: "ir al gimnasio"
    timing: timed
    startTime: "09:00"
    deferrability: deferrable
  - description: "caminar 30min"
    timing: flex
    deferrability: non-deferrable
---

# Gym Routine

Body of the note (free text, optional).
```

### Fields

| Field | Values |
|---|---|
| `area` | Any string — FÍSICA, MENTAL, FAMILIAR, REALIZACIONAL, SOCIAL, TRÁMITES, LABORAL, etc. |
| `origin` | `endogenous` (from within) or `exogenous` (imposed) |
| `cadence` | `recurring` (repeats daily) or `one-off` (done once) |
| `deferrability` | `deferrable` (can push to tomorrow) or `non-deferrable` (today or never) |
| `status` | `active`, `dropped`, or `fulfilled` |
| `dropReason` | `resistance`, `trauma_response`, `lack_of_interest`, `peer_pressure`, `external_resolved`, `other` |
| `sourceNote` | Free text — where did this goal come from? |
| `recurringTasks` | Array of task specs (only for recurring goals) |

## Sample Data

The `sample-vault/` directory contains example data to try out:
- `Goals/` — 8 sample goals across 6 life areas
- `Planeamiento/2026/2026-Q2/` — 2 synthetic weekly planning files with therapy notes and CBT chain analysis

## Requirements

- Obsidian v1.5.0 or later
- Node.js v18+ (dev only)
