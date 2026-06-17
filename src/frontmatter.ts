import { GoalStatus, DropReason } from "./types";

/**
 * Patch YAML frontmatter with new status and optional dropReason.
 * Does NOT touch any other frontmatter fields or the body content.
 * Pure function — no Obsidian dependencies, fully testable.
 */
export function patchFrontmatter(content: string, status: GoalStatus, dropReason?: DropReason): string {
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
