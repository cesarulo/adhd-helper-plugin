import { App, Modal, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, ItemView, TFile, Notice } from "obsidian";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const GOALS_FOLDER = "Goals";

const UI = {
  viewTitle: "Mission Control",
  viewSubtitle: "What are you working toward? What have you let go of?",
  emptyTitle: "No goals yet",
  emptyBody: "Add your first goal to get started.",
  addGoal: "+ Add Goal",
  areaActive: (n: number) => `${n} active`,
  areaDropped: (n: number) => `${n} dropped`,
  sectionActive: "Active",
  sectionDropped: (n: number) => `Dropped (${n})`,
  sectionFulfilled: "Fulfilled",
  toggleShow: "Show",
  toggleHide: "Hide",
  goalOrigin: (o: Origin) => o === "endogenous" ? "para mí" : "externo",
  goalCadence: (c: Cadence) => c === "recurring" ? "recurrente" : "one-off",
  taskLabel: "Daily tasks:",
  taskTimingLabel: (t: TaskTiming) => t === "timed" ? "timed" : "flex",
  taskNoPunt: "no punt",
  btnDrop: "Drop",
  btnFulfill: "Fulfill",
  btnEdit: "Edit",
  btnReactivate: "Reactivate",
  doneBadge: "✓ done",
  sourcePrefix: "Source: ",
  dropDialogTitle: "Why are you dropping this goal?",
  errorUpdateGoal: "Could not update goal — check the console for details.",
  errorCreateGoal: "Could not create goal — check the console for details.",
  logPrefix: "ADHD Helper: ",
  planWeek: "Plan This Week",
  weekExists: (path: string) => `Week plan already exists: ${path}`,
  dayNames: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"],
};

type Origin = "endogenous" | "exogenous";
type Cadence = "recurring" | "one-off";
type GoalStatus = "active" | "dropped" | "fulfilled";
type DropReason = "resistance" | "trauma_response" | "lack_of_interest" | "peer_pressure" | "external_resolved" | "other";
type TaskTiming = "timed" | "flex";

interface RecurringTaskSpec {
  description: string;
  timing: TaskTiming;
  startTime?: string;
  isPuntable: boolean;
}

interface GoalFrontmatter {
  area: string;
  origin: Origin;
  cadence: Cadence;
  status: GoalStatus;
  dropReason?: DropReason;
  sourceNote?: string;
  recurringTasks?: RecurringTaskSpec[];
}

interface GoalEntry {
  file: TFile;
  title: string;
  fm: GoalFrontmatter;
}

interface AreaSummary {
  name: string;
  activeCount: number;
  droppedCount: number;
  fulfilledCount: number;
  goals: GoalEntry[];
}

// ---------------------------------------------------------------------------
// View type constant
// ---------------------------------------------------------------------------

const VIEW_TYPE_MISSION_CONTROL = "adhd-mission-control";

function weekPlanPath(): string {
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

function todayDayName(): string {
  const day = new Date().getDay();
  return UI.dayNames[day === 0 ? 6 : day - 1];
}

// ---------------------------------------------------------------------------
// Mission Control View
// ---------------------------------------------------------------------------

class MissionControlView extends ItemView {
  plugin: ADHDHelperPlugin;
  private refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ADHDHelperPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  private sectionIdFor(areaName: string): string {
    return "adhd-mc-section-" + areaName.replace(/[^a-zA-Z0-9]/g, "-");
  }

  getViewType(): string {
    return VIEW_TYPE_MISSION_CONTROL;
  }

  getDisplayText(): string {
    return UI.viewTitle;
  }

  getIcon(): string {
    return "target";
  }

  async onOpen() {
    this.registerEvent(
      this.plugin.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.path.startsWith(GOALS_FOLDER + "/")) {
          if (this.refreshTimer) clearTimeout(this.refreshTimer);
          this.refreshTimer = window.setTimeout(() => this.render(), 300);
        }
      })
    );
    await this.render();
  }

  async render() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("adhd-mission-control");

    const goals = await this.plugin.loadGoals();
    const areas = this.groupByArea(goals);

    if (areas.length === 0) {
      const empty = container.createDiv("adhd-mc-empty");
      empty.createEl("h3", { text: UI.emptyTitle });
      empty.createEl("p", { text: UI.emptyBody });
      const addBtn = container.createDiv("adhd-mc-add-btn");
      addBtn.createEl("button", {
        text: UI.addGoal,
        cls: "mod-cta"
      }).addEventListener("click", () => this.openGoalCreator());
      return;
    }

    const topBar = container.createDiv("adhd-mc-top-bar");
    this.renderHeader(topBar);
    this.renderAreaCards(topBar, areas);

    for (const area of areas) {
      this.renderAreaSection(container, area);
    }

    const addBtn = container.createDiv("adhd-mc-add-btn");
    addBtn.createEl("button", {
      text: UI.addGoal,
      cls: "mod-cta"
    }).addEventListener("click", () => this.openGoalCreator());

    const planBtn = container.createDiv("adhd-mc-add-btn");
    planBtn.createEl("button", {
      text: UI.planWeek,
      cls: "mod-cta"
    }).addEventListener("click", () => this.planThisWeek());
  }

  private renderHeader(topBar: HTMLElement) {
    const header = topBar.createDiv("adhd-mc-header");
    header.createEl("h2", { text: UI.viewTitle });
    header.createEl("p", { 
      text: UI.viewSubtitle,
      cls: "adhd-mc-subtitle" 
    });
  }

  private renderAreaCards(topBar: HTMLElement, areas: AreaSummary[]) {
    const areaRow = topBar.createDiv("adhd-mc-area-row");
    for (const area of areas) {
      const card = areaRow.createDiv("adhd-mc-area-card");
      const sectionId = this.sectionIdFor(area.name);
      card.addEventListener("click", () => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      card.createEl("strong", { text: area.name, cls: "adhd-mc-area-name" });
      card.createEl("span", { 
        text: UI.areaActive(area.activeCount),
        cls: "adhd-mc-area-stat" 
      });
      if (area.droppedCount > 0) {
        card.createEl("span", { 
          text: UI.areaDropped(area.droppedCount),
          cls: "adhd-mc-area-stat adhd-mc-dropped-stat" 
        });
      }
    }
  }

  renderAreaSection(container: HTMLElement, area: AreaSummary) {
    const sectionId = this.sectionIdFor(area.name);
    const section = container.createDiv("adhd-mc-area-section");
    section.id = sectionId;

    // Area header
    const areaHeader = section.createDiv("adhd-mc-area-header");
    areaHeader.createEl("h3", { text: area.name });
    areaHeader.createEl("span", { 
      text: `${area.activeCount} active · ${area.droppedCount} dropped · ${area.fulfilledCount} fulfilled`,
      cls: "adhd-mc-area-counts" 
    });

    // Active goals
    const activeGoals = area.goals.filter(g => g.fm.status === "active");
    if (activeGoals.length > 0) {
      const activeSection = section.createDiv("adhd-mc-goal-group");
      activeSection.createEl("h4", { text: UI.sectionActive });
      for (const goal of activeGoals) {
        this.renderGoalCard(activeSection, goal);
      }
    }

    // Dropped goals (collapsed)
    const droppedGoals = area.goals.filter(g => g.fm.status === "dropped");
    if (droppedGoals.length > 0) {
      const dropSection = section.createDiv("adhd-mc-goal-group adhd-mc-dropped-group");
      const dropHeader = dropSection.createDiv("adhd-mc-dropped-header");
      dropHeader.createEl("h4", { text: UI.sectionDropped(droppedGoals.length) });
      
      const toggleBtn = dropHeader.createEl("button", { 
        text: UI.toggleShow,
        cls: "adhd-mc-toggle-btn" 
      });
      
      const dropContent = dropSection.createDiv("adhd-mc-dropped-content");
      dropContent.style.display = "none";
      
      toggleBtn.addEventListener("click", () => {
        const hidden = dropContent.style.display === "none";
        dropContent.style.display = hidden ? "block" : "none";
        toggleBtn.setText(hidden ? UI.toggleHide : UI.toggleShow);
      });

      for (const goal of droppedGoals) {
        this.renderDroppedGoalCard(dropContent, goal);
      }
    }

    // Fulfilled goals
    const fulfilledGoals = area.goals.filter(g => g.fm.status === "fulfilled");
    if (fulfilledGoals.length > 0) {
      const fulSection = section.createDiv("adhd-mc-goal-group");
      fulSection.createEl("h4", { text: UI.sectionFulfilled });
      for (const goal of fulfilledGoals) {
        const card = fulSection.createDiv("adhd-mc-goal-card adhd-mc-fulfilled");
        card.createEl("span", { text: goal.title, cls: "adhd-mc-goal-title" });
        card.createEl("span", { text: UI.doneBadge, cls: "adhd-mc-badge adhd-mc-badge-fulfilled" });
      }
    }
  }

  renderGoalCard(container: HTMLElement, goal: GoalEntry) {
    const card = container.createDiv("adhd-mc-goal-card");

    // Row 1: title + badges
    const row1 = card.createDiv("adhd-mc-goal-row");
    row1.createEl("span", { text: goal.title, cls: "adhd-mc-goal-title" });
    
    // Origin badge
    const originLabel = UI.goalOrigin(goal.fm.origin);
    const originCls = goal.fm.origin === "endogenous" ? "adhd-mc-badge-endo" : "adhd-mc-badge-exo";
    row1.createEl("span", { text: originLabel, cls: `adhd-mc-badge ${originCls}` });
    
    // Cadence badge
    const cadLabel = UI.goalCadence(goal.fm.cadence);
    row1.createEl("span", { text: cadLabel, cls: "adhd-mc-badge adhd-mc-badge-cadence" });

    // Recurring tasks
    if (goal.fm.cadence === "recurring" && goal.fm.recurringTasks && Array.isArray(goal.fm.recurringTasks) && goal.fm.recurringTasks.length > 0) {
      const tasksSection = card.createDiv("adhd-mc-recurring-tasks");
      tasksSection.createEl("small", { text: UI.taskLabel, cls: "adhd-mc-tasks-label" });
      for (const task of goal.fm.recurringTasks) {
        const taskRow = tasksSection.createDiv("adhd-mc-task-row");
        const timeStr = task.timing === "timed" && task.startTime 
          ? `${task.startTime} ` 
          : "";
        taskRow.createEl("span", { 
          text: `${timeStr}${task.description}`,
          cls: "adhd-mc-task-desc" 
        });
        if (!task.isPuntable) {
          taskRow.createEl("span", { text: UI.taskNoPunt, cls: "adhd-mc-badge adhd-mc-badge-nopunt" });
        }
        taskRow.createEl("span", { 
          text: UI.taskTimingLabel(task.timing),
          cls: "adhd-mc-badge adhd-mc-badge-timing" 
        });
      }
    }

    // Source note
    if (goal.fm.sourceNote) {
      card.createEl("small", { 
        text: UI.sourcePrefix + goal.fm.sourceNote,
        cls: "adhd-mc-source-note" 
      });
    }

    // Actions
    const actions = card.createDiv("adhd-mc-actions");
    
    // Drop button
    actions.createEl("button", { text: UI.btnDrop, cls: "adhd-mc-action-btn adhd-mc-drop-btn" })
      .addEventListener("click", () => this.showDropDialog(goal));

    // Fulfill button (for one-off goals)
    if (goal.fm.cadence === "one-off") {
      actions.createEl("button", { text: UI.btnFulfill, cls: "adhd-mc-action-btn" })
        .addEventListener("click", () => this.fulfillGoal(goal));
    }

    // Edit button
    actions.createEl("button", { text: UI.btnEdit, cls: "adhd-mc-action-btn" })
      .addEventListener("click", () => this.plugin.app.workspace.openLinkText(goal.file.path, "", false));
  }

  renderDroppedGoalCard(container: HTMLElement, goal: GoalEntry) {
    const card = container.createDiv("adhd-mc-goal-card adhd-mc-dropped-card");
    const row = card.createDiv("adhd-mc-goal-row");
    row.createEl("span", { text: goal.title, cls: "adhd-mc-goal-title" });
    
    if (goal.fm.dropReason) {
      row.createEl("span", { 
        text: this.dropReasonLabel(goal.fm.dropReason),
        cls: "adhd-mc-badge adhd-mc-badge-dropped-reason" 
      });
    }

    // Reactivate
    const actions = card.createDiv("adhd-mc-actions");
    actions.createEl("button", { text: UI.btnReactivate, cls: "adhd-mc-action-btn" })
      .addEventListener("click", () => this.reactivateGoal(goal));
    
    actions.createEl("button", { text: UI.btnEdit, cls: "adhd-mc-action-btn" })
      .addEventListener("click", () => this.plugin.app.workspace.openLinkText(goal.file.path, "", false));
  }

  dropReasonLabel(reason: DropReason): string {
    const labels: Record<DropReason, string> = {
      resistance: "resistencia",
      trauma_response: "trauma",
      lack_of_interest: "ya no interesa",
      peer_pressure: "presión social",
      external_resolved: "se resolvió",
      other: "otra razón",
    };
    return labels[reason] || reason;
  }

  async showDropDialog(goal: GoalEntry) {
    const reasons: { label: string; value: DropReason }[] = [
      { label: "Me da resistencia", value: "resistance" },
      { label: "Viene de un trauma", value: "trauma_response" },
      { label: "Ya no me interesa", value: "lack_of_interest" },
      { label: "Era presión social", value: "peer_pressure" },
      { label: "Se resolvió solo", value: "external_resolved" },
      { label: "Otra razón", value: "other" },
    ];

    // Simple approach: use Obsidian modal
    const modal = new DropReasonModal(this.plugin.app, reasons, async (reason) => {
      await this.updateGoalStatus(goal, "dropped", reason);
      await this.render();
    });
    modal.open();
  }

  async fulfillGoal(goal: GoalEntry) {
    await this.updateGoalStatus(goal, "fulfilled");
    await this.render();
  }

  async reactivateGoal(goal: GoalEntry) {
    await this.updateGoalStatus(goal, "active");
    await this.render();
  }

  async updateGoalStatus(goal: GoalEntry, status: GoalStatus, dropReason?: DropReason) {
    try {
      const content = await this.plugin.app.vault.read(goal.file);
      const newContent = this.patchFrontmatter(content, status, dropReason);
      await this.plugin.app.vault.modify(goal.file, newContent);
    } catch (e) {
      console.error(UI.logPrefix + "failed to update goal status", e);
      new Notice(UI.errorUpdateGoal);
    }
  }

  patchFrontmatter(content: string, status: GoalStatus, dropReason?: DropReason): string {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return content;

    const fmBlock = fmMatch[1];
    const before = content.substring(0, fmMatch.index!);
    const after = content.substring(fmMatch.index! + fmMatch[0].length);

    let lines = fmBlock.split("\n");
    const hasStatus = lines.some(l => /^\s*status:/.test(l));
    const hasDropReason = lines.some(l => /^\s*dropReason:/.test(l));

    if (hasStatus) {
      lines = lines.map(l => /^\s*status:/.test(l) ? `status: ${status}` : l);
    } else {
      lines.push(`status: ${status}`);
    }

    if (status === "dropped" && dropReason) {
      if (hasDropReason) {
        lines = lines.map(l => /^\s*dropReason:/.test(l) ? `dropReason: ${dropReason}` : l);
      } else {
        lines.push(`dropReason: ${dropReason}`);
      }
    } else {
      lines = lines.filter(l => !/^\s*dropReason:/.test(l));
    }

    return before + "---\n" + lines.join("\n") + "\n---" + after;
  }

  openGoalCreator() {
    // Open a new note in the Goals folder with a template
    const timestamp = Date.now();
    const path = `${GOALS_FOLDER}/New Goal ${timestamp}.md`;
    const template = `---
area: ""
origin: endogenous
cadence: one-off
status: active
sourceNote: ""
---

# New Goal

Describe your goal here.
`;
    this.plugin.app.vault.create(path, template).then((file) => {
      this.plugin.app.workspace.openLinkText(file.path, "", false);
    }).catch((e) => {
      console.error(UI.logPrefix + "failed to create goal file", e);
      new Notice(UI.errorCreateGoal);
    });
  }

  private async planThisWeek() {
    const goals = await this.plugin.loadGoals();
    const areas = this.groupByArea(goals);
    const path = weekPlanPath();
    const exists = this.plugin.app.vault.getAbstractFileByPath(path);
    if (exists) {
      new Notice(UI.weekExists(path));
      return;
    }
    const content = this.weekPlanContent(areas);
    try {
      const file = await this.plugin.app.vault.create(path, content);
      await this.plugin.app.workspace.openLinkText(file.path, "", false);
    } catch (e) {
      console.error(UI.logPrefix + "failed to create week plan", e);
      new Notice(UI.errorCreateGoal);
    }
  }

  private weekPlanContent(areas: AreaSummary[]): string {
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
    for (const dayName of UI.dayNames) {
      md += `# ${dayName}\n`;
      md += "## Objetivos por Área\n";
      md += "## Horarios\n";
      md += "- \n\n";
    }
    return md;
  }

  groupByArea(goals: GoalEntry[]): AreaSummary[] {
    const map = new Map<string, GoalEntry[]>();
    for (const g of goals) {
      const area = g.fm.area || "Uncategorized";
      if (!map.has(area)) map.set(area, []);
      map.get(area)!.push(g);
    }

    const summaries: AreaSummary[] = [];
    for (const [name, areaGoals] of map) {
      summaries.push({
        name,
        activeCount: areaGoals.filter(g => g.fm.status === "active").length,
        droppedCount: areaGoals.filter(g => g.fm.status === "dropped").length,
        fulfilledCount: areaGoals.filter(g => g.fm.status === "fulfilled").length,
        goals: areaGoals,
      });
    }

    // Sort: active count desc
    summaries.sort((a, b) => b.activeCount - a.activeCount);
    return summaries;
  }
}

// ---------------------------------------------------------------------------
// Drop Reason Modal
// ---------------------------------------------------------------------------

class DropReasonModal extends Modal {
  reasons: { label: string; value: DropReason }[];
  onSubmit: (reason: DropReason) => void;

  constructor(app: App, reasons: { label: string; value: DropReason }[], onSubmit: (reason: DropReason) => void) {
    super(app);
    this.reasons = reasons;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: UI.dropDialogTitle });
    
    for (const reason of this.reasons) {
      contentEl.createEl("button", {
        text: reason.label,
        cls: "mod-cta adhd-mc-reason-btn"
      }).addEventListener("click", () => {
        this.onSubmit(reason.value);
        this.close();
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
// Plugin Settings
// ---------------------------------------------------------------------------

interface ADHDHelperSettings {
  goalsFolder: string;
}

const DEFAULT_SETTINGS: ADHDHelperSettings = {
  goalsFolder: "Goals",
};

class ADHDHelperSettingTab extends PluginSettingTab {
  plugin: ADHDHelperPlugin;

  constructor(app: App, plugin: ADHDHelperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "ADHD Helper Settings" });

    new Setting(containerEl)
      .setName("Goals folder")
      .setDesc("Folder where goal notes are stored")
      .addText((text) =>
        text
          .setValue(this.plugin.pluginSettings.goalsFolder)
          .onChange(async (value) => {
            this.plugin.pluginSettings.goalsFolder = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

// ---------------------------------------------------------------------------
// Plugin Entry Point
// ---------------------------------------------------------------------------

export default class ADHDHelperPlugin extends Plugin {
  pluginSettings: ADHDHelperSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    // Register the Mission Control view
    this.registerView(
      VIEW_TYPE_MISSION_CONTROL,
      (leaf) => new MissionControlView(leaf, this)
    );

    // Ribbon icon
    this.addRibbonIcon("target", "ADHD Mission Control", () => {
      this.activateView();
    });

    // Command
    this.addCommand({
      id: "open-mission-control",
      name: "Open Mission Control",
      callback: () => this.activateView(),
    });

    // Settings tab
    this.addSettingTab(new ADHDHelperSettingTab(this.app, this));

    // DayPopulator: ribbon + command
    this.addRibbonIcon("list-plus", "Populate Today's Tasks", () => {
      this.populateToday();
    });
    this.addCommand({
      id: "populate-today",
      name: "Populate Today's Tasks from Goals",
      callback: () => this.populateToday(),
    });
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MISSION_CONTROL);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_MISSION_CONTROL)[0] ?? null;

    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_MISSION_CONTROL,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async loadSettings() {
    this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.pluginSettings);
  }

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  async loadGoals(): Promise<GoalEntry[]> {
    const folder = this.pluginSettings.goalsFolder;
    const goals: GoalEntry[] = [];

    const files = this.app.vault.getMarkdownFiles()
      .filter(f => f.path.startsWith(folder + "/"));

    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter as GoalFrontmatter | undefined;
      if (fm && fm.area && fm.origin && fm.cadence && fm.status) {
        goals.push({
          file,
          title: cache?.frontmatter?.title || file.basename,
          fm,
        });
      }
    }

    return goals;
  }

  async populateToday() {
    const goals = await this.loadGoals();
    const dayName = todayDayName();
    const path = weekPlanPath();

    // Collect timed + flex tasks from active recurring goals
    const timedTasks: { desc: string; time: string; area: string }[] = [];
    const flexByArea: Map<string, string[]> = new Map();

    for (const goal of goals) {
      if (goal.fm.status !== "active" || goal.fm.cadence !== "recurring") continue;
      for (const task of goal.fm.recurringTasks || []) {
        if (task.timing === "timed" && task.startTime) {
          timedTasks.push({ desc: task.description, time: task.startTime, area: goal.fm.area });
        } else {
          if (!flexByArea.has(goal.fm.area)) flexByArea.set(goal.fm.area, []);
          flexByArea.get(goal.fm.area)!.push(task.description);
        }
      }
    }

    // Build the today section
    let section = `# ${dayName}\n`;
    section += "## Objetivos por Área\n";
    for (const [area, tasks] of flexByArea) {
      section += `- ${area}\n`;
      for (const t of tasks) {
        section += `\t- ${t}\n`;
      }
    }
    section += "## Horarios\n";
    timedTasks.sort((a, b) => a.time.localeCompare(b.time));
    for (const t of timedTasks) {
      section += `- ${t.time} - ${t.desc}\n`;
    }
    section += "\n";

    // Find or create the week plan file, then append
    const exists = this.app.vault.getAbstractFileByPath(path);
    if (exists && exists instanceof TFile) {
      const content = await this.app.vault.read(exists);
      // Replace existing day section if present
      const dayRegex = new RegExp(`^# ${dayName}\\n([\\s\\S]*?)(?=\\n# |$)`, "m");
      if (dayRegex.test(content)) {
        const updated = content.replace(dayRegex, section.trimEnd());
        await this.app.vault.modify(exists, updated);
      } else {
        await this.app.vault.modify(exists, content.trimEnd() + "\n\n" + section);
      }
      await this.app.workspace.openLinkText(path, "", false);
    } else {
      // Create new week plan with just today's tasks
      const dir = path.substring(0, path.lastIndexOf("/"));
      const dirObj = this.app.vault.getAbstractFileByPath(dir);
      if (!dirObj) {
        await this.app.vault.createFolder(dir);
      }
      const file = await this.app.vault.create(path, section);
      await this.app.workspace.openLinkText(file.path, "", false);
    }
  }
}
