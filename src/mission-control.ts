import { App, WorkspaceLeaf, ItemView, Notice, TFile } from "obsidian";
import { AreaSummary, GoalEntry, GoalStatus, DropReason } from "./types";
import { UI, GOALS_FOLDER } from "./ui-strings";
import { weekPlanPath, weekPlanContent } from "./plan-generator";
import { ensureFolder } from "./plugin";
import { DropReasonModal } from "./drop-reason-modal";
import { patchFrontmatter } from "./frontmatter";
import { getScoredAreas } from "./dataview";

export const VIEW_TYPE_MISSION_CONTROL = "adhd-mission-control";

export interface MCPlugin {
  app: App;
  loadGoals(): Promise<GoalEntry[]>;
}

export class MissionControlView extends ItemView {
  plugin: MCPlugin;
  private refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: MCPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  private sectionIdFor(areaName: string): string {
    return "adhd-mc-section-" + areaName.replace(/[^a-zA-Z0-9]/g, "-");
  }

  getViewType(): string { return VIEW_TYPE_MISSION_CONTROL; }
  getDisplayText(): string { return UI.viewTitle; }
  getIcon(): string { return "target"; }

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
      addBtn.createEl("button", { text: UI.addGoal, cls: "mod-cta" })
        .addEventListener("click", () => this.openGoalCreator());
      return;
    }

    const topBar = container.createDiv("adhd-mc-top-bar");
    this.renderHeader(topBar);
    this.renderAreaCards(topBar, areas);

    for (const area of areas) {
      this.renderAreaSection(container, area);
    }

    const addBtn = container.createDiv("adhd-mc-add-btn");
    addBtn.createEl("button", { text: UI.addGoal, cls: "mod-cta" })
      .addEventListener("click", () => this.openGoalCreator());

    const planBtn = container.createDiv("adhd-mc-add-btn");
    planBtn.createEl("button", { text: UI.planWeek, cls: "mod-cta" })
      .addEventListener("click", () => this.planThisWeek());
  }

  private renderHeader(topBar: HTMLElement) {
    const header = topBar.createDiv("adhd-mc-header");
    header.createEl("h2", { text: UI.viewTitle });
    header.createEl("p", { text: UI.viewSubtitle, cls: "adhd-mc-subtitle" });
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
      card.createEl("span", { text: UI.areaActive(area.activeCount), cls: "adhd-mc-area-stat" });
      if (area.droppedCount > 0) {
        card.createEl("span", { text: UI.areaDropped(area.droppedCount), cls: "adhd-mc-area-stat adhd-mc-dropped-stat" });
      }
    }
  }

  renderAreaSection(container: HTMLElement, area: AreaSummary) {
    const sectionId = this.sectionIdFor(area.name);
    const section = container.createDiv("adhd-mc-area-section");
    section.id = sectionId;

    const areaHeader = section.createDiv("adhd-mc-area-header");
    areaHeader.createEl("h3", { text: area.name });
    areaHeader.createEl("span", {
      text: `${area.activeCount} active · ${area.droppedCount} dropped · ${area.fulfilledCount} fulfilled`,
      cls: "adhd-mc-area-counts"
    });

    const activeGoals = area.goals.filter(g => g.fm.status === "active");
    if (activeGoals.length > 0) {
      const activeSection = section.createDiv("adhd-mc-goal-group");
      activeSection.createEl("h4", { text: UI.sectionActive });
      for (const goal of activeGoals) {
        this.renderGoalCard(activeSection, goal);
      }
    }

    const droppedGoals = area.goals.filter(g => g.fm.status === "dropped");
    if (droppedGoals.length > 0) {
      const dropSection = section.createDiv("adhd-mc-goal-group adhd-mc-dropped-group");
      const dropHeader = dropSection.createDiv("adhd-mc-dropped-header");
      dropHeader.createEl("h4", { text: UI.sectionDropped(droppedGoals.length) });
      const toggleBtn = dropHeader.createEl("button", { text: UI.toggleShow, cls: "adhd-mc-toggle-btn" });
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
    const row1 = card.createDiv("adhd-mc-goal-row");
    row1.createEl("span", { text: goal.title, cls: "adhd-mc-goal-title" });

    const originLabel = UI.goalOrigin(goal.fm.origin);
    const originCls = goal.fm.origin === "endogenous" ? "adhd-mc-badge-endo" : "adhd-mc-badge-exo";
    row1.createEl("span", { text: originLabel, cls: `adhd-mc-badge ${originCls}` });

    const cadLabel = UI.goalCadence(goal.fm.cadence);
    row1.createEl("span", { text: cadLabel, cls: "adhd-mc-badge adhd-mc-badge-cadence" });

    if (goal.fm.cadence === "recurring" && goal.fm.recurringTasks && Array.isArray(goal.fm.recurringTasks) && goal.fm.recurringTasks.length > 0) {
      const tasksSection = card.createDiv("adhd-mc-recurring-tasks");
      tasksSection.createEl("small", { text: UI.taskLabel, cls: "adhd-mc-tasks-label" });
      for (const task of goal.fm.recurringTasks) {
        const taskRow = tasksSection.createDiv("adhd-mc-task-row");
        const timeStr = task.timing === "timed" && task.startTime ? `${task.startTime} ` : "";
        taskRow.createEl("span", { text: `${timeStr}${task.description}`, cls: "adhd-mc-task-desc" });
        if (!task.isPuntable) {
          taskRow.createEl("span", { text: UI.taskNoPunt, cls: "adhd-mc-badge adhd-mc-badge-nopunt" });
        }
        taskRow.createEl("span", { text: UI.taskTimingLabel(task.timing), cls: "adhd-mc-badge adhd-mc-badge-timing" });
      }
    }

    if (goal.fm.sourceNote) {
      card.createEl("small", { text: UI.sourcePrefix + goal.fm.sourceNote, cls: "adhd-mc-source-note" });
    }

    const actions = card.createDiv("adhd-mc-actions");
    actions.createEl("button", { text: UI.btnDrop, cls: "adhd-mc-action-btn adhd-mc-drop-btn" })
      .addEventListener("click", () => this.showDropDialog(goal));

    if (goal.fm.cadence === "one-off") {
      actions.createEl("button", { text: UI.btnFulfill, cls: "adhd-mc-action-btn" })
        .addEventListener("click", () => this.fulfillGoal(goal));
    }

    actions.createEl("button", { text: UI.btnEdit, cls: "adhd-mc-action-btn" })
      .addEventListener("click", () => this.plugin.app.workspace.openLinkText(goal.path, "", false));
  }

  renderDroppedGoalCard(container: HTMLElement, goal: GoalEntry) {
    const card = container.createDiv("adhd-mc-goal-card adhd-mc-dropped-card");
    const row = card.createDiv("adhd-mc-goal-row");
    row.createEl("span", { text: goal.title, cls: "adhd-mc-goal-title" });
    if (goal.fm.dropReason) {
      row.createEl("span", { text: this.dropReasonLabel(goal.fm.dropReason), cls: "adhd-mc-badge adhd-mc-badge-dropped-reason" });
    }
    const actions = card.createDiv("adhd-mc-actions");
    actions.createEl("button", { text: UI.btnReactivate, cls: "adhd-mc-action-btn" })
      .addEventListener("click", () => this.reactivateGoal(goal));
    actions.createEl("button", { text: UI.btnEdit, cls: "adhd-mc-action-btn" })
      .addEventListener("click", () => this.plugin.app.workspace.openLinkText(goal.path, "", false));
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
      const file = this.plugin.app.vault.getAbstractFileByPath(goal.path);
      if (!(file instanceof TFile)) return;
      const content = await this.plugin.app.vault.read(file);
      const newContent = patchFrontmatter(content, status, dropReason);
      await this.plugin.app.vault.modify(file, newContent);
    } catch (e) {
      console.error(UI.logPrefix + "failed to update goal status", e);
      new Notice(UI.errorUpdateGoal);
    }
  }

  openGoalCreator() {
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
    const existsOnDisk = await this.plugin.app.vault.adapter.exists(path);
    if (existsOnDisk) {
      new Notice(UI.weekExists(path));
      return;
    }

    const scored = await getScoredAreas(this.plugin.app);
    const prepopulatedAreas = scored.length > 0 ? scored.map(s => s.area) : undefined;
    const content = weekPlanContent(areas, prepopulatedAreas);
    try {
      const dir = path.substring(0, path.lastIndexOf("/"));
      await ensureFolder(this.plugin.app.vault, dir);
      const file = await this.plugin.app.vault.create(path, content);
      await this.plugin.app.workspace.openLinkText(file.path, "", false);
    } catch (e) {
      console.error(UI.logPrefix + "failed to create week plan", e);
      new Notice(UI.errorCreateGoal);
    }
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
    summaries.sort((a, b) => b.activeCount - a.activeCount);
    return summaries;
  }
}
