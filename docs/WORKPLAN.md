# Workplan — ADHD Helper Obsidian Plugin

Each task includes what's broken, the fix approach, and the file(s) affected.
Check off when done, add notes as needed.

---

## P0 — Data Integrity
*Fix these before modifying any goal file. Current code can corrupt frontmatter.*

### P0-1: Fix YAML serialization in `rebuildFrontmatter`

- [ ] **Assigned:** ___

**What's broken:** `JSON.stringify(value)` on line 346 of `main.ts` produces
JSON, not YAML. A `recurringTasks` array becomes
`[{"description":"empastillarse","timing":"timed"...}]` — unreadable in
Obsidian and impossible to edit by hand. Every call to `updateGoalStatus`
(drop, fulfill, reactivate) corrupts any goal with `recurringTasks`.

**Fix:** Write a small YAML serializer for the subset of types we use:
strings, numbers, booleans, and arrays of flat objects. For nested objects
inside arrays, write them as YAML block sequences with inline mappings.
Add a unit test: read a goal with `recurringTasks`, change its status,
verify the file still has valid YAML with all recurring tasks intact.

**File:** `main.ts` — `rebuildFrontmatter` method (~lines 339-351)

---

### P0-2: Preserve unknown frontmatter fields

- [ ] **Assigned:** ___

**What's broken:** `rebuildFrontmatter` strips *all* frontmatter, then
reconstructs only the keys present in the metadata cache at that moment.
If a user adds `tags: [adhd, goals]`, `cssclass: wide`, or any other
Obsidian-native frontmatter field to a goal note, it is silently deleted
on the next status change. Body content after frontmatter is preserved,
but any `# headings` in the body are untouched (this works correctly).

**Fix:** Instead of delete-and-rebuild, do a targeted update. Find the
frontmatter block with a regex (`/^---\n([\s\S]*?)\n---/`), parse only
the YAML block, update just the keys we manage (`status`, `dropReason`),
reserialize the entire block (using the fix from P0-1), and splice it back
into the file. This preserves ordering, unknown keys, comments, and body.

**File:** `main.ts` — `rebuildFrontmatter` method (~lines 339-351)
**Relation:** Depends on P0-1 for serialization.

---

### P0-3: Error handling on vault reads and writes

- [ ] **Assigned:** ___

**What's broken:** `vault.read`, `vault.modify`, and `vault.create`
(lines 321, 336, 369) have no try/catch. A transient file lock, permission
error, or filesystem issue causes a silent failure — the view doesn't
update and the user gets no feedback.

**Fix:** Wrap each vault operation in try/catch. On failure, show a
`new Notice("Could not update goal: <reason>")` with the error message.
Add a console.error for debugging. Affected methods:
- `updateGoalStatus` (lines 320-337)
- `openGoalCreator` (lines 353-372)

**File:** `main.ts` — `updateGoalStatus`, `openGoalCreator`

---

## P1 — Code Quality
*Improves readability and safety for two-person collaboration.*

### P1-1: Extract `sectionIdFor` helper

- [ ] **Assigned:** ___

**What's messy:** The expression
`"adhd-mc-section-" + area.name.replace(/[^a-zA-Z0-9]/g, "-")` appears
at lines 102 and 133. If the ID scheme changes, two places must be updated.

**Fix:** `private sectionIdFor(areaName: string): string` that returns
`"adhd-mc-section-" + areaName.replace(/[^a-zA-Z0-9]/g, "-")`. Replace
both call sites.

**File:** `main.ts` — `MissionControlView.render()` and `renderAreaSection()`

---

### P1-2: Remove unused import

- [ ] **Assigned:** ___

**What's unused:** `FrontMatterCache` is imported at line 1 but never
referenced in the code.

**Fix:** Delete it from the import statement.

**File:** `main.ts` — line 1

---

### P1-3: Replace `any` type assertions in `loadGoals`

- [ ] **Assigned:** ___

**What's messy:** `(folderObj as any).children` at lines 545 and 548
bypasses Obsidian's type system because `TAbstractFile` doesn't expose
a `children` property.

**Fix:** Instead of getting the folder object and accessing its children,
use `this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder + "/"))`.
This uses the public API, is type-safe, and returns the same result.

**File:** `main.ts` — `loadGoals` method (~lines 539-565)

---

### P1-4: Break up `MissionControlView` render method

- [ ] **Assigned:** ___

**What's messy:** The `MissionControlView` class is 340 lines. The `render()`
method is 50 lines and calls into `renderAreaSection`, `renderGoalCard`,
and `renderDroppedGoalCard`, which together form a 200-line rendering block.

**Fix:** Extract the three rendering regions of `render()` into private
methods: `renderHeader(topBar)`, `renderAreaCards(topBar, areas)`,
`renderGoalSections(container, areas)`. The `render()` method itself
becomes ~10 lines of orchestration. Don't create separate classes yet —
that's premature for a prototype.

**File:** `main.ts` — `render()` method (~lines 80-130)

---

## P2 — UX Polish
*Nice to have. Won't break anything if skipped.*

### P2-1: Empty state

- [ ] **Assigned:** ___

**What's missing:** If the `Goals/` folder doesn't exist or contains no
valid goal files, the view is barren — just a gray "Add Goal" button at
the bottom.

**Fix:** After loading goals, if `areas.length === 0`, render a centered
message: "No goals yet — add your first goal to get started." with a
large, friendly CTA button. Skip rendering area cards and sections.

**File:** `main.ts` — `render()` method (~line 85 after load)

---

### P2-2: Centralize UI strings

- [ ] **Assigned:** ___

**What's messy:** "Mission Control", "Active", "Dropped", "Fulfilled",
"Show", "Hide", "Add Goal", "Edit", "Drop", "Reactivate", "Fulfill",
"Daily tasks:", "Source:", "no punt" — these are scattered across the
file. Some are English, some Spanish ("para mí", "recurrente").

**Fix:** Create a `const UI = { ... }` object at the top of the file.
Replace all hardcoded strings with `UI.headerTitle`, `UI.activeLabel`,
etc. Won't implement i18n libraries — just centralization. The Spanish
strings stay as-is for now; they're intentional.

**File:** `main.ts`

---

### P2-3: Validate `recurringTasks` before rendering

- [ ] **Assigned:** ___

**What's fragile:** If a goal's frontmatter has malformed `recurringTasks`
(for example, a string `"daily"` instead of an array), iterating over it
in `renderGoalCard` will crash the view.

**Fix:** Before the `for (const task of goal.fm.recurringTasks)` loop
at line 214, add: `if (!Array.isArray(goal.fm.recurringTasks)) { console.warn("Malformed recurringTasks for goal:", goal.title); return; }`

**File:** `main.ts` — `renderGoalCard` (~line 210)

---

## Notes

- **Prototype disclaimer:** This is a research prototype to validate UX
  ideas before committing to the Android app implementation. Bugs are
  expected. The P0 tasks are the only blocking ones — everything else
  can ship in rough shape.
- **Testing:** After each P0 fix, create a test goal with `recurringTasks`,
  drop it, reactivate it, and verify the frontmatter is still valid YAML
  with all fields intact.
- **Commit style:** One commit per task. Keep messages short and link back
  to the task ID (e.g. "P0-1: fix YAML serialization in rebuildFrontmatter").
