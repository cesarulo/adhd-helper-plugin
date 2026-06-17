import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, TFile, Vault, Notice } from "obsidian";
import { ADHDHelperSettings, GoalEntry, GoalFrontmatter, GoalStatus } from "./types";
import { GOALS_FOLDER, UI } from "./ui-strings";
import { VIEW_TYPE_MISSION_CONTROL, MissionControlView, MCPlugin } from "./mission-control";
import { VIEW_TYPE_DASHBOARD, DashboardView, DashboardPlugin } from "./dashboard";
import { weekPlanPath, todayDayName, buildDaySection } from "./plan-generator";

export const DEFAULT_SETTINGS: ADHDHelperSettings = {
  goalsFolder: "Goals",
};

export async function ensureFolder(vault: Vault, fullPath: string) {
  const parts = fullPath.split("/");
  let current = "";
  for (const part of parts) {
    current += (current ? "/" : "") + part;
    if (!vault.getAbstractFileByPath(current)) {
      await vault.createFolder(current);
    }
  }
}

export default class ADHDHelperPlugin extends Plugin implements MCPlugin, DashboardPlugin {
  pluginSettings: ADHDHelperSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_MISSION_CONTROL, (leaf) => new MissionControlView(leaf, this));
    this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));

    this.addRibbonIcon("target", "ADHD Mission Control", () => this.openView(VIEW_TYPE_MISSION_CONTROL));
    this.addCommand({ id: "open-mission-control", name: "Open Mission Control", callback: () => this.openView(VIEW_TYPE_MISSION_CONTROL) });

    this.addRibbonIcon("bar-chart-3", "ADHD Dashboard", () => this.openView(VIEW_TYPE_DASHBOARD));
    this.addCommand({ id: "open-dashboard", name: "Open Dashboard", callback: () => this.openView(VIEW_TYPE_DASHBOARD) });

    this.addRibbonIcon("list-plus", "Populate Today's Tasks", () => this.populateToday());
    this.addCommand({ id: "populate-today", name: "Populate Today's Tasks from Goals", callback: () => this.populateToday() });

    this.addSettingTab(new ADHDHelperSettingTab(this.app, this));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MISSION_CONTROL);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_DASHBOARD);
  }

  private async openView(viewType: string) {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(viewType)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: viewType, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }

  async loadSettings() { this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
  async saveSettings() { await this.saveData(this.pluginSettings); }

  async loadGoals(): Promise<GoalEntry[]> {
    const folder = this.pluginSettings.goalsFolder;
    const goals: GoalEntry[] = [];
    const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder + "/"));
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter as GoalFrontmatter | undefined;
      if (fm && fm.area && fm.origin && fm.cadence && fm.status) {
        goals.push({ title: cache?.frontmatter?.title || file.basename, path: file.path, fm });
      }
    }
    return goals;
  }

  async populateToday() {
    const goals = await this.loadGoals();
    const dayName = todayDayName();
    const path = weekPlanPath();

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

    const section = buildDaySection(dayName, { timedTasks, flexByArea });
    const exists = this.app.vault.getAbstractFileByPath(path);
    if (exists && exists instanceof TFile) {
      const content = await this.app.vault.read(exists);
      const dayRegex = new RegExp(`^# ${dayName}\\n([\\s\\S]*?)(?=\\n# |$)`, "m");
      if (dayRegex.test(content)) {
        await this.app.vault.modify(exists, content.replace(dayRegex, section.trimEnd()));
      } else {
        await this.app.vault.modify(exists, content.trimEnd() + "\n\n" + section);
      }
      await this.app.workspace.openLinkText(path, "", false);
    } else {
      const dir = path.substring(0, path.lastIndexOf("/"));
      await ensureFolder(this.app.vault, dir);
      const file = await this.app.vault.create(path, section);
      await this.app.workspace.openLinkText(file.path, "", false);
    }
  }
}

class ADHDHelperSettingTab extends PluginSettingTab {
  plugin: ADHDHelperPlugin;
  constructor(app: App, plugin: ADHDHelperPlugin) { super(app, plugin); this.plugin = plugin; }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "ADHD Helper Settings" });
    new Setting(containerEl)
      .setName("Goals folder")
      .setDesc("Folder where goal notes are stored")
      .addText(text => text.setValue(this.plugin.pluginSettings.goalsFolder).onChange(async (value) => {
        this.plugin.pluginSettings.goalsFolder = value;
        await this.plugin.saveSettings();
      }));
  }
}
