import { App, Modal, MarkdownRenderer, Component } from "obsidian";
import type { QuickCaptureSettings } from "../settings";

// ── Prefix tables ─────────────────────────────────────────────────────────────

const TODO_PREFIXES    = new Set(["t", "/", "x", "-", ">", "<"]);
const NOTES_PREFIXES   = new Set(["?", "!", "*", '"', "q", "l", "b", "i",
                                   "S", "I", "p", "c", "f", "k", "w", "u", "d"]);
const ONELINE_PREFIXES = new Set(["1"]);

function parseInput(raw: string): { storedChar: string; text: string } {
	if (raw.length >= 3 && raw[1] === " ") {
		const p = raw[0];
		if (TODO_PREFIXES.has(p) || NOTES_PREFIXES.has(p) || ONELINE_PREFIXES.has(p)) {
			const storedChar = p === "t" ? " " : p === "q" ? '"' : p;
			return { storedChar, text: raw.slice(2) };
		}
	}
	return { storedChar: "i", text: raw };
}

export function isOneLine(storedChar: string): boolean {
	return storedChar === "1";
}

export function isTodo(storedChar: string): boolean {
	return storedChar === " " || storedChar === "/" || storedChar === "x"
		|| storedChar === "-" || storedChar === ">" || storedChar === "<";
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private message: string,
		private onConfirm: () => void,
		private onCancel?: () => void,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("p", { text: this.message });

		const btns = contentEl.createDiv({ cls: "qol-capture-buttons" });
		btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => {
			this.onCancel?.();
			this.close();
		});
		const confirm = btns.createEl("button", { text: "Confirm", cls: "mod-cta" });
		confirm.addEventListener("click", () => {
			this.onConfirm();
			this.close();
		});
		confirm.focus();
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ── QuickCaptureModal ─────────────────────────────────────────────────────────

export class QuickCaptureModal extends Modal {
	private previewEl!: HTMLElement;
	private textarea!: HTMLTextAreaElement;
	private dateInput!: HTMLInputElement;
	private previewComponent!: Component;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		app: App,
		private settings: QuickCaptureSettings,
		private onSubmit: (storedChar: string, text: string, date: string) => Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		this.titleEl.setText("Quick Capture");

		this.previewComponent = new Component();
		this.previewComponent.load();

		// ── Input row ────────────────────────────────────────────────────────
		const inputRow = contentEl.createDiv({ cls: "qol-capture-input-row" });

		this.previewEl = inputRow.createDiv({ cls: "qol-capture-preview" });

		this.textarea = inputRow.createEl("textarea", { cls: "qol-capture-textarea" });
		this.textarea.rows = 3;
		this.textarea.placeholder = "i <note text>  or  t <todo text>  or  1 <one-line>";
		this.textarea.addEventListener("input", () => this.schedulePreviewUpdate());
		this.textarea.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && e.ctrlKey) {
				e.preventDefault();
				this.submit();
			}
		});

		// ── Date row ─────────────────────────────────────────────────────────
		const dateRow = contentEl.createDiv({ cls: "qol-capture-date-row" });
		dateRow.createEl("label", { text: "Date:" });

		this.dateInput = dateRow.createEl("input");
		this.dateInput.type = "date";
		this.dateInput.value = this.todayStr();

		// ── Button row ───────────────────────────────────────────────────────
		const btns = contentEl.createDiv({ cls: "qol-capture-buttons" });
		btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		const addBtn = btns.createEl("button", { text: "Add", cls: "mod-cta" });
		addBtn.addEventListener("click", () => this.submit());

		this.renderPreview("i");
		// Defer focus so Modal's own focus management doesn't steal it back
		activeWindow.setTimeout(() => this.textarea.focus(), 0);
	}

	onClose() {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.previewComponent.unload();
		this.contentEl.empty();
	}

	private todayStr(): string {
		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	}

	private schedulePreviewUpdate() {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => {
			const { storedChar } = parseInput(this.textarea.value);
			this.renderPreview(storedChar);
		}, 100);
	}

	private async renderPreview(storedChar: string) {
		this.previewEl.empty();
		if (storedChar === "1") {
			// One Line: render as a quote checkbox preview
			await MarkdownRenderer.render(
				this.app,
				`- ["] `,
				this.previewEl,
				"",
				this.previewComponent,
			);
			return;
		}
		await MarkdownRenderer.render(
			this.app,
			`- [${storedChar}] `,
			this.previewEl,
			"",
			this.previewComponent,
		);
		// Remove the empty text node Obsidian appends after the checkbox
		this.previewEl.querySelectorAll("li").forEach(li => {
			li.childNodes.forEach(n => {
				if (n.nodeType === Node.TEXT_NODE) n.remove();
			});
		});
	}

	private async submit() {
		const raw = this.textarea.value.trim();
		if (!raw) return;

		const { storedChar, text } = parseInput(raw);
		if (!text.trim()) return;

		await this.onSubmit(storedChar, text, this.dateInput.value || this.todayStr());
		this.close();
	}
}
