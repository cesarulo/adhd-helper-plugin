import { App, WorkspaceLeaf, ItemView, TFile } from "obsidian";
import { GoalEntry } from "./types";
import { GOALS_FOLDER } from "./ui-strings";
import { computePortfolioStats } from "./stats";

export const VIEW_TYPE_DASHBOARD = "adhd-dashboard";

export interface DashboardPlugin {
  app: App;
  loadGoals(): Promise<GoalEntry[]>;
}

export class DashboardView extends ItemView {
  plugin: DashboardPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_DASHBOARD; }
  getDisplayText(): string { return "Dashboard"; }
  getIcon(): string { return "bar-chart-3"; }

  async onOpen() {
    this.registerEvent(
      this.plugin.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.path.startsWith(GOALS_FOLDER + "/")) {
          this.render();
        }
      })
    );
    await this.render();
  }

  async render() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("adhd-dashboard");

    const goals = await this.plugin.loadGoals();
    const stats = computePortfolioStats(goals);

    container.createEl("h2", { text: "Dashboard" });
    container.createEl("p", { text: `Total goals: ${stats.total}`, cls: "adhd-db-subtitle" });
    if (stats.total === 0) return;

    this.renderSection(container, "By Area",
      [...stats.byArea.entries()].map(([name, c]) => `${name}: ${c.active}A / ${c.dropped}D / ${c.fulfilled}F`));

    this.renderSection(container, "By Origin",
      [`Endogenous: ${stats.endogenous} (${Math.round(stats.endogenous / stats.total * 100)}%)`,
       `Exogenous: ${stats.exogenous} (${Math.round(stats.exogenous / stats.total * 100)}%)`]);

    this.renderSection(container, "By Cadence",
      [`Recurring: ${stats.recurring}`, `One-off: ${stats.oneOff}`]);

    if (stats.nonDeferrable > 0 || stats.deferrable > 0) {
      this.renderSection(container, "By Deferrability",
        [`Deferrable: ${stats.deferrable}`, `Non-deferrable: ${stats.nonDeferrable}`]);
    }

    if (stats.dropReasons.size > 0) {
      this.renderSection(container, "Dropped Goals",
        [...stats.dropReasons.entries()].map(([r, n]) => `${r}: ${n}`));
    }
  }

  private renderSection(container: HTMLElement, title: string, items: string[]) {
    const section = container.createDiv("adhd-db-section");
    section.createEl("h4", { text: title });
    for (const item of items) {
      section.createEl("div", { text: item, cls: "adhd-db-item" });
    }
  }
}
