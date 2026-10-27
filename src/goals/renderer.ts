import { App, Component, MarkdownPostProcessorContext, MarkdownRenderChild, Notice } from "obsidian";
import type { GoalsSettings } from "../settings";
import { extractGoals, parseGoalsConfig, resolveGoalsFile, updateGoal } from "./model";
import { renderTaskList } from "./tasks";

export class GoalsBlock extends MarkdownRenderChild {
	private revision = 0;
	private sourcePath: string | undefined;
	private rendering: Component | undefined;
	private saving = false;

	constructor(
		private app: App,
		private settings: GoalsSettings,
		private source: string,
		el: HTMLElement,
		private ctx: MarkdownPostProcessorContext,
	) {
		super(el);
	}

	async onload() {
		this.registerEvent(this.app.metadataCache.on("changed", file => {
			if (!this.sourcePath || file.path === this.sourcePath || file.path === this.ctx.sourcePath) void this.render();
		}));
		this.registerEvent(this.app.vault.on("delete", file => {
			if (file.path === this.sourcePath) void this.render();
		}));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			if (oldPath === this.sourcePath || file.path === this.sourcePath) void this.render();
		}));
		await this.render();
	}

	onunload() {
		this.revision++;
	}

	private async render() {
		const revision = ++this.revision;
		if (this.rendering) this.removeChild(this.rendering);
		const rendering = this.addChild(new Component());
		this.rendering = rendering;
		const root = document.createElement("div");
		root.className = "qol-goals";
		try {
			const config = parseGoalsConfig(this.source, this.settings.defaultSection);
			const file = resolveGoalsFile(this.app, this.ctx.sourcePath, config, this.settings);
			this.sourcePath = file.path;
			const snapshot = await this.app.vault.cachedRead(file);
			if (revision !== this.revision) return;
			const tasks = extractGoals(snapshot, config.section);
			if (!tasks.length) root.createDiv({ cls: "qol-goals-empty", text: "No goals found." });
			await renderTaskList(this.app, file, tasks, root, rendering,
				() => revision === this.revision, (task, checkbox) => {
					if (this.saving) { checkbox.checked = task.status !== " "; return; }
					this.saving = true;
					root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(input => { input.disabled = true; });
					void updateGoal(this.app, file, snapshot, task)
						.catch(error => {
							console.error("QOL: Could not update goal", error);
							new Notice(`Could not update goal: ${error instanceof Error ? error.message : String(error)}`);
						})
						.finally(() => { this.saving = false; void this.render(); });
				});
		} catch (error) {
			root.empty();
			root.createDiv({ cls: "qol-goals-error", text: error instanceof Error ? error.message : String(error) });
		}
		if (revision === this.revision) this.containerEl.replaceChildren(root);
	}
}
