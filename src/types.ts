export type Origin = "endogenous" | "exogenous";
export type Cadence = "recurring" | "one-off";
export type GoalStatus = "active" | "dropped" | "fulfilled";
export type DropReason = "resistance" | "trauma_response" | "lack_of_interest" | "peer_pressure" | "external_resolved" | "other";
export type TaskTiming = "timed" | "flex";

export interface RecurringTaskSpec {
  description: string;
  timing: TaskTiming;
  startTime?: string;
  isPuntable: boolean;
}

export interface GoalFrontmatter {
  area: string;
  origin: Origin;
  cadence: Cadence;
  status: GoalStatus;
  dropReason?: DropReason;
  sourceNote?: string;
  recurringTasks?: RecurringTaskSpec[];
}

export interface GoalEntry {
  title: string;
  path: string;
  fm: GoalFrontmatter;
}

export interface AreaSummary {
  name: string;
  activeCount: number;
  droppedCount: number;
  fulfilledCount: number;
  goals: GoalEntry[];
}

export interface ADHDHelperSettings {
  goalsFolder: string;
}

export interface PortfolioStats {
  total: number;
  byArea: Map<string, { active: number; dropped: number; fulfilled: number }>;
  endogenous: number;
  exogenous: number;
  recurring: number;
  oneOff: number;
  deferrable: number;
  nonDeferrable: number;
  dropReasons: Map<string, number>;
}

export interface ScoredArea {
  area: string;
  score: number;
}
