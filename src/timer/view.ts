import { ItemView, setIcon, WorkspaceLeaf } from "obsidian";
import type QolPlugin from "../main";
import { formatDuration, parseDuration } from "./model";

export const TIMER_TYPE = "qol-timer";

export class TimerView extends ItemView {
	private input!: HTMLInputElement;
	private ring!: SVGCircleElement;
	private play!: HTMLButtonElement;
	private status!: HTMLElement;
	private presets!: HTMLElement;
	private editing = false;
	private editValue = "";
	private unsubscribe?: () => void;
	private playing?: boolean;

	constructor(leaf: WorkspaceLeaf, private plugin: QolPlugin) { super(leaf); }
	getViewType(): string { return TIMER_TYPE; }
	getDisplayText(): string { return "Timer"; }
	getIcon(): string { return "timer"; }
	private get timer() { return this.plugin.timer.countdown; }

	async onOpen(): Promise<void> {
		this.editing = false;
		this.playing = undefined;
		this.contentEl.empty();
		this.contentEl.addClass("qol-timer");
		const panel = this.contentEl.createDiv({ cls: "qol-timer-panel" });
		const dial = panel.createDiv({ cls: "qol-timer-dial" });
		const svg = dial.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("viewBox", "0 0 220 220");
		svg.setAttribute("aria-hidden", "true");
		dial.appendChild(svg);
		for (const name of ["qol-timer-track", "qol-timer-progress"]) {
			const circle = dial.ownerDocument.createElementNS(svg.namespaceURI, "circle") as SVGCircleElement;
			for (const [key, value] of Object.entries({ cx: "110", cy: "110", r: "100", class: name, pathLength: "100" })) {
				circle.setAttribute(key, value);
			}
			svg.appendChild(circle);
			this.ring = circle;
		}
		this.input = dial.createEl("input", {
			cls: "qol-timer-value", type: "text",
			attr: { "aria-label": "Timer duration, minutes or minutes:seconds", spellcheck: "false", maxlength: "6" },
		});
		this.input.title = "Edit duration (minutes or m:ss)";
		this.input.addEventListener("focus", () => {
			if (this.timer.running) return;
			if (!this.editing) this.editValue = this.input.value;
			this.editing = true;
			this.input.select();
		});
		this.input.addEventListener("input", () => this.input.removeAttribute("aria-invalid"));
		this.input.addEventListener("blur", () => {
			if (this.editing) this.commitEdit();
		});
		this.input.addEventListener("keydown", event => {
			if (this.timer.running) return;
			if (event.key === "Enter") {
				event.preventDefault();
				if (this.commitEdit()) this.input.blur();
			} else if (event.key === "Escape") {
				event.preventDefault();
				this.editing = false;
				this.input.removeAttribute("aria-invalid");
				this.refresh();
				this.input.blur();
			}
		});
		this.presets = panel.createDiv({ cls: "qol-timer-presets", attr: { role: "group", "aria-label": "Timer presets" } });
		const controls = dial.createDiv({ cls: "qol-timer-controls" });
		const stop = controls.createEl("button", { attr: { "aria-label": "Stop and reset timer", title: "Stop and reset" } });
		setIcon(stop, "square");
		stop.addEventListener("click", () => { this.cancelEdit(); this.timer.reset(); });
		this.play = controls.createEl("button");
		this.play.addEventListener("click", () => {
			if (this.editing && !this.commitEdit()) { this.input.focus(); return; }
			if (this.timer.running) this.timer.pause();
			else this.plugin.timer.start();
		});
		this.status = panel.createDiv({ cls: "qol-timer-status", attr: { role: "status", "aria-live": "polite" } });
		this.refreshPresets();
		this.unsubscribe = this.timer.subscribe(() => this.refresh());
		this.refresh();
	}

	refreshPresets(): void {
		if (!this.presets) return;
		this.presets.empty();
		for (const minutes of this.plugin.settings.timer.presets) {
			const button = this.presets.createEl("button", { text: String(minutes), attr: { "aria-label": `Set timer to ${minutes} minutes`, title: `${minutes} minutes` } });
			button.addEventListener("click", () => { this.cancelEdit(); this.timer.load(minutes * 60); });
		}
		if (this.status) this.refresh();
	}

	private cancelEdit(): void {
		this.editing = false;
		this.input.removeAttribute("aria-invalid");
	}

	private commitEdit(): boolean {
		if (this.timer.running) return false;
		if (this.input.value === this.editValue) {
			this.cancelEdit();
			this.refresh();
			return true;
		}
		const seconds = parseDuration(this.input.value);
		if (seconds === null) {
			this.input.setAttribute("aria-invalid", "true");
			this.status.textContent = "Use minutes or m:ss (0:01–999:59).";
			return false;
		}
		this.cancelEdit();
		this.timer.load(seconds);
		return true;
	}

	private refresh(): void {
		if (this.timer.running && this.editing) this.cancelEdit();
		this.input.readOnly = this.timer.running;
		this.input.tabIndex = this.timer.running ? -1 : 0;
		this.input.title = this.timer.running ? "Pause to edit duration" : "Edit duration (minutes or m:ss)";
		if (!this.editing) this.input.value = formatDuration(this.timer.remaining);
		this.ring.style.strokeDashoffset = String(100 * (1 - this.timer.remaining / this.timer.duration));
		this.ring.style.opacity = this.timer.remaining === 0 ? "0" : "1";
		if (this.playing !== this.timer.running) {
			this.playing = this.timer.running;
			setIcon(this.play, this.playing ? "pause" : "play");
			this.play.setAttribute("aria-label", this.playing ? "Pause timer" : "Start timer");
			this.play.title = this.playing ? "Pause" : "Start";
		}
		if (this.input.getAttribute("aria-invalid") !== "true") {
			const status = this.timer.remaining === 0 ? "Time’s up"
				: !this.timer.running && this.timer.remaining < this.timer.duration ? "Paused" : "";
			if (this.status.textContent !== status) this.status.textContent = status;
		}
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.contentEl.empty();
	}
}
