import { App, Modal } from "obsidian";
import { DropReason } from "./types";
import { UI } from "./ui-strings";

export class DropReasonModal extends Modal {
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
