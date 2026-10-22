import { App, Modal, MarkdownRenderer, Component, Notice } from "obsidian";
import type { QuickCaptureSettings } from "../settings";
import { CaptureEditor } from "./editor";

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
	private captureEditor: CaptureEditor | null = null;
	private dateInput!: HTMLInputElement;
	private previewComponent!: Component;
	private addButton!: HTMLButtonElement;
	private submitting = false;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private focusTimer: number | null = null;

	constructor(
		app: App,
		private settings: QuickCaptureSettings,
		private onSubmit: (storedChar: string, text: string, date: string) => Promise<void>,
	) {
		super(app);
	}

	async onOpen() {
		const { contentEl } = this;
		this.modalEl.addClass("qol-capture-modal");
		this.titleEl.setText("Quick Capture");

		this.previewComponent = new Component();
		this.previewComponent.load();

		// ── Input row ────────────────────────────────────────────────────────
		const inputRow = contentEl.createDiv({ cls: "qol-capture-input-row" });

		this.previewEl = inputRow.createDiv({ cls: "qol-capture-preview" });

		inputRow.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.isComposing) {
				e.preventDefault();
				e.stopPropagation();
				void this.submit();
			}
		}, true);
		const help = contentEl.createDiv({ cls: "qol-capture-help" });
		const prefixes = help.createEl("span");
		for (const [prefix, label] of [["i", " note · "], ["t", " task · "], ["1", " one-line"]]) {
			prefixes.createEl("code", { text: prefix });
			prefixes.createEl("span", { text: label });
		}
		const shortcut = help.createEl("span");
		shortcut.createEl("kbd", { text: "Ctrl/Cmd+Enter" });
		shortcut.createEl("span", { text: " to add" });

		// ── Date row ─────────────────────────────────────────────────────────
		const dateRow = contentEl.createDiv({ cls: "qol-capture-date-row" });
		dateRow.createEl("label", { text: "Date:" });

		this.dateInput = dateRow.createEl("input");
		this.dateInput.type = "date";
		this.dateInput.value = this.todayStr();

		// ── Button row ───────────────────────────────────────────────────────
		const btns = contentEl.createDiv({ cls: "qol-capture-buttons" });
		btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		this.addButton = btns.createEl("button", { text: "Add", cls: "mod-cta" });
		this.addButton.disabled = true;
		this.addButton.addEventListener("click", () => { void this.submit(); });

		void this.renderPreview("i");
		try {
			const leaf = this.app.workspace.getMostRecentLeaf() ?? this.app.workspace.getLeaf(false);
			const editor = new CaptureEditor(leaf, () => this.schedulePreviewUpdate());
			this.captureEditor = editor;
			inputRow.appendChild(editor.containerEl);
			editor.load();
			await editor.setState({ mode: "source", source: false }, { history: false });
			if (this.captureEditor !== editor) return;
			editor.setViewData("", true);
			this.addButton.disabled = false;
			this.focusTimer = activeWindow.setTimeout(() => {
				this.focusTimer = null;
				this.captureEditor?.editor.focus();
			}, 0);
		} catch (error) {
			console.error("QOL: Could not open capture editor", error);
			new Notice(`Could not open capture editor: ${error instanceof Error ? error.message : String(error)}`);
			this.close();
		}
	}

	onClose() {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		if (this.focusTimer !== null) activeWindow.clearTimeout(this.focusTimer);
		this.captureEditor?.unload();
		this.captureEditor = null;
		this.previewComponent?.unload();
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
			if (!this.captureEditor) return;
			const { storedChar } = parseInput(this.captureEditor.editor.getValue());
			void this.renderPreview(storedChar);
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
		if (!this.captureEditor || this.submitting || this.addButton.disabled) return;
		const raw = this.captureEditor.editor.getValue().trim();
		if (!raw) return;

		const { storedChar, text } = parseInput(raw);
		if (!text.trim()) return;

		this.submitting = true;
		this.addButton.disabled = true;
		try {
			await this.onSubmit(storedChar, text, this.dateInput.value || this.todayStr());
			this.close();
		} catch (error) {
			console.error("QOL: Could not save capture", error);
			new Notice(`Could not save capture: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this.submitting = false;
			this.addButton.disabled = false;
		}
	}
}
