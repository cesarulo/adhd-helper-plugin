import { App, Modal, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, ItemView, TFile, Notice } from "obsidian";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const GOALS_FOLDER = "Goals";

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

// ---------------------------------------------------------------------------
// Mission Control View
// ---------------------------------------------------------------------------

class MissionControlView extends ItemView {
  plugin: ADHDHelperPlugin;

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
    return "Mission Control";
  }

  getIcon(): string {
    return "target";
  }

  async onOpen() {
    await this.render();
  }

  async render() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("adhd-mission-control");

    const goals = await this.plugin.loadGoals();
    const areas = this.groupByArea(goals);

    const topBar = container.createDiv("adhd-mc-top-bar");
    this.renderHeader(topBar);
    this.renderAreaCards(topBar, areas);

    for (const area of areas) {
      this.renderAreaSection(container, area);
    }

    const addBtn = container.createDiv("adhd-mc-add-btn");
    addBtn.createEl("button", {
      text: "+ Add Goal",
      cls: "mod-cta"
    }).addEventListener("click", () => this.openGoalCreator());
  }

  private renderHeader(topBar: HTMLElement) {
    const header = topBar.createDiv("adhd-mc-header");
    header.createEl("h2", { text: "Mission Control" });
    header.createEl("p", { 
      text: "What are you working toward? What have you let go of?",
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
        text: `${area.activeCount} active`,
        cls: "adhd-mc-area-stat" 
      });
      if (area.droppedCount > 0) {
        card.createEl("span", { 
          text: `${area.droppedCount} dropped`,
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
      activeSection.createEl("h4", { text: "Active" });
      for (const goal of activeGoals) {
        this.renderGoalCard(activeSection, goal);
      }
    }

    // Dropped goals (collapsed)
    const droppedGoals = area.goals.filter(g => g.fm.status === "dropped");
    if (droppedGoals.length > 0) {
      const dropSection = section.createDiv("adhd-mc-goal-group adhd-mc-dropped-group");
      const dropHeader = dropSection.createDiv("adhd-mc-dropped-header");
      dropHeader.createEl("h4", { text: `Dropped (${droppedGoals.length})` });
      
      const toggleBtn = dropHeader.createEl("button", { 
        text: "Show",
        cls: "adhd-mc-toggle-btn" 
      });
      
      const dropContent = dropSection.createDiv("adhd-mc-dropped-content");
      dropContent.style.display = "none";
      
      toggleBtn.addEventListener("click", () => {
        const hidden = dropContent.style.display === "none";
        dropContent.style.display = hidden ? "block" : "none";
        toggleBtn.setText(hidden ? "Hide" : "Show");
      });

      for (const goal of droppedGoals) {
        this.renderDroppedGoalCard(dropContent, goal);
      }
    }

    // Fulfilled goals
    const fulfilledGoals = area.goals.filter(g => g.fm.status === "fulfilled");
    if (fulfilledGoals.length > 0) {
      const fulSection = section.createDiv("adhd-mc-goal-group");
      fulSection.createEl("h4", { text: "Fulfilled" });
      for (const goal of fulfilledGoals) {
        const card = fulSection.createDiv("adhd-mc-goal-card adhd-mc-fulfilled");
        card.createEl("span", { text: goal.title, cls: "adhd-mc-goal-title" });
        card.createEl("span", { text: "✓ done", cls: "adhd-mc-badge adhd-mc-badge-fulfilled" });
      }
    }
  }

  renderGoalCard(container: HTMLElement, goal: GoalEntry) {
    const card = container.createDiv("adhd-mc-goal-card");

    // Row 1: title + badges
    const row1 = card.createDiv("adhd-mc-goal-row");
    row1.createEl("span", { text: goal.title, cls: "adhd-mc-goal-title" });
    
    // Origin badge
    const originLabel = goal.fm.origin === "endogenous" ? "para mí" : "externo";
    const originCls = goal.fm.origin === "endogenous" ? "adhd-mc-badge-endo" : "adhd-mc-badge-exo";
    row1.createEl("span", { text: originLabel, cls: `adhd-mc-badge ${originCls}` });
    
    // Cadence badge
    const cadLabel = goal.fm.cadence === "recurring" ? "recurrente" : "one-off";
    row1.createEl("span", { text: cadLabel, cls: "adhd-mc-badge adhd-mc-badge-cadence" });

    // Recurring tasks
    if (goal.fm.cadence === "recurring" && goal.fm.recurringTasks && goal.fm.recurringTasks.length > 0) {
      const tasksSection = card.createDiv("adhd-mc-recurring-tasks");
      tasksSection.createEl("small", { text: "Daily tasks:", cls: "adhd-mc-tasks-label" });
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
          taskRow.createEl("span", { text: "no punt", cls: "adhd-mc-badge adhd-mc-badge-nopunt" });
        }
        taskRow.createEl("span", { 
          text: task.timing === "timed" ? "timed" : "flex",
          cls: "adhd-mc-badge adhd-mc-badge-timing" 
        });
      }
    }

    // Source note
    if (goal.fm.sourceNote) {
      card.createEl("small", { 
        text: `Source: ${goal.fm.sourceNote}`,
        cls: "adhd-mc-source-note" 
      });
    }

    // Actions
    const actions = card.createDiv("adhd-mc-actions");
    
    // Drop button
    actions.createEl("button", { text: "Drop", cls: "adhd-mc-action-btn adhd-mc-drop-btn" })
      .addEventListener("click", () => this.showDropDialog(goal));

    // Fulfill button (for one-off goals)
    if (goal.fm.cadence === "one-off") {
      actions.createEl("button", { text: "Fulfill", cls: "adhd-mc-action-btn" })
        .addEventListener("click", () => this.fulfillGoal(goal));
    }

    // Edit button
    actions.createEl("button", { text: "Edit", cls: "adhd-mc-action-btn" })
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
    actions.createEl("button", { text: "Reactivate", cls: "adhd-mc-action-btn" })
      .addEventListener("click", () => this.reactivateGoal(goal));
    
    actions.createEl("button", { text: "Edit", cls: "adhd-mc-action-btn" })
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
      console.error("ADHD Helper: failed to update goal status", e);
      new Notice("Could not update goal — check the console for details.");
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
      console.error("ADHD Helper: failed to create goal file", e);
      new Notice("Could not create goal — check the console for details.");
    });
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
    contentEl.createEl("h3", { text: "Why are you dropping this goal?" });
    
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
}
