import { App, Component, MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownRenderer, Notice } from "obsidian";
import type { GoalsSettings } from "../settings";
import { extractGoals, parseGoalsConfig, resolveGoalsFile, updateGoal } from "./model";

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
			const list = root.createEl("ul", { cls: "qol-goals-list" });
			const parents: { indent: number; item: HTMLLIElement; list?: HTMLUListElement }[] = [];
			for (const task of tasks) {
				while (parents.length && parents[parents.length - 1].indent >= task.indent) parents.pop();
				const parent = parents[parents.length - 1];
				const target = parent
					? (parent.list ??= parent.item.createEl("ul", { cls: "qol-goals-list" })) : list;
				const item = target.createEl("li", { cls: "qol-goals-task" });
				item.dataset.task = task.status;
				const row = item.createDiv({ cls: "qol-goals-row" });
				const checkbox = row.createEl("input", { cls: "task-list-item-checkbox", type: "checkbox" });
				checkbox.checked = task.status !== " ";
				checkbox.setAttribute("aria-label", task.text);
				const body = row.createDiv({ cls: "qol-goals-text" });
				await MarkdownRenderer.render(this.app, task.text, body, file.path, rendering);
				if (revision !== this.revision) return;
				rendering.registerDomEvent(checkbox, "click", event => event.stopPropagation());
				rendering.registerDomEvent(checkbox, "change", () => {
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
				parents.push({ indent: task.indent, item });
			}
		} catch (error) {
			root.empty();
			root.createDiv({ cls: "qol-goals-error", text: error instanceof Error ? error.message : String(error) });
		}
		if (revision === this.revision) this.containerEl.replaceChildren(root);
	}
}
