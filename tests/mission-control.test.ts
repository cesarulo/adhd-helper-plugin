import { describe, it, expect } from "vitest";
import { patchFrontmatter } from "../src/frontmatter";

describe("patchFrontmatter", () => {
  const sample = `---
area: FÍSICA
origin: endogenous
cadence: recurring
status: active
recurringTasks:
  - description: gym
    timing: timed
    startTime: "09:00"
    isPuntable: true
---

# My Goal
Body text here.
`;

  it("updates status line without touching other fields", () => {
    const result = patchFrontmatter(sample, "dropped", "resistance");
    expect(result).toContain("status: dropped");
    expect(result).toContain("dropReason: resistance");
    expect(result).toContain("area: FÍSICA");
    expect(result).toContain("recurringTasks:");
    expect(result).toContain("  - description: gym");
    expect(result).toContain("# My Goal");
    expect(result).toContain("Body text here.");
  });

  it("removes dropReason when reactivating", () => {
    const dropped = patchFrontmatter(sample, "dropped", "peer_pressure");
    const reactivated = patchFrontmatter(dropped, "active");
    expect(reactivated).toContain("status: active");
    expect(reactivated).not.toContain("dropReason:");
    expect(reactivated).toContain("recurringTasks:");
  });

  it("preserves body content after frontmatter", () => {
    const result = patchFrontmatter(sample, "fulfilled");
    expect(result).toContain("# My Goal");
    expect(result).toContain("Body text here.");
  });

  it("handles file without frontmatter gracefully", () => {
    const noFm = "# Just a heading\nContent.";
    expect(patchFrontmatter(noFm, "active")).toBe(noFm);
  });

  it("adds status line if missing", () => {
    const noStatus = `---
area: FÍSICA
---

Body.`;
    const result = patchFrontmatter(noStatus, "dropped", "resistance");
    expect(result).toContain("status: dropped");
    expect(result).toContain("dropReason: resistance");
    expect(result).toContain("area: FÍSICA");
  });

  it("does not corrupt YAML block sequences", () => {
    // This was the original bug: JSON.stringify produced JSON instead of YAML
    const result = patchFrontmatter(sample, "dropped", "lack_of_interest");
    expect(result).not.toContain('"description"');
    expect(result).not.toContain('["'); // no JSON array
    expect(result).toContain("  - description: gym");
    expect(result).toContain("    timing: timed");
    expect(result).toContain("    startTime: \"09:00\"");
    expect(result).toContain("    isPuntable: true");
  });
});
