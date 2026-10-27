import { App, Component, MarkdownRenderChild, Notice } from "obsidian";
import { updateGoal } from "../goals/model";
import { renderTaskList } from "../goals/tasks";
import { extractNextActions, inNextActionsFolder, nextActionTitle, NextActionsConfig, parseNextActionsConfig, resolveNextActionFiles } from "./model";

export class NextActionsBlock extends MarkdownRenderChild {
	private revision = 0;
	private rendering: Component | undefined;
	private config: NextActionsConfig | undefined;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private saving = false;
	private closed = false;

	constructor(
		private app: App,
		private source: string,
		el: HTMLElement,
	) {
		super(el);
	}

	async onload() {
		const schedule = (path: string) => {
			if (!this.config || !inNextActionsFolder(path, this.config.folder)) return;
			if (this.timer) clearTimeout(this.timer);
			this.timer = setTimeout(() => { void this.render(); }, 100);
		};
		this.registerEvent(this.app.metadataCache.on("changed", file => schedule(file.path)));
		this.registerEvent(this.app.vault.on("delete", file => schedule(file.path)));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			schedule(oldPath);
			schedule(file.path);
		}));
		await this.render();
	}

	onunload() {
		this.closed = true;
		this.revision++;
		if (this.timer) clearTimeout(this.timer);
	}

	private async render() {
		if (this.closed) return;
		if (this.timer) clearTimeout(this.timer);
		const revision = ++this.revision;
		if (this.rendering) this.removeChild(this.rendering);
		const rendering = this.addChild(new Component());
		this.rendering = rendering;
		const root = document.createElement("div");
		root.className = "qol-next-actions";
		try {
			const config = this.config = parseNextActionsConfig(this.source);
			const files = resolveNextActionFiles(this.app, config);
			if (!files.length) root.createDiv({ cls: "qol-next-actions-empty", text: "No matching notes found." });
			for (const file of files) {
				const snapshot = await this.app.vault.cachedRead(file);
				if (revision !== this.revision) return;
				const group = root.createDiv({ cls: "qol-next-actions-group" });
				const link = group.createEl("a", {
					cls: "qol-next-actions-heading internal-link", text: nextActionTitle(this.app, file),
				});
				const href = `${file.path}#${config.section}`;
				link.setAttribute("href", href);
				link.setAttribute("data-href", href);
				const tasks = extractNextActions(snapshot, config.section);
				if (!tasks.length) {
					group.createDiv({ cls: "qol-next-actions-empty", text: "No next actions defined" });
					continue;
				}
				const body = group.createDiv({ cls: "qol-goals" });
				await renderTaskList(this.app, file, tasks, body, rendering,
					() => revision === this.revision, (task, checkbox) => {
						if (this.saving) { checkbox.checked = false; return; }
						this.saving = true;
						root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(input => { input.disabled = true; });
						void updateGoal(this.app, file, snapshot, task)
							.catch(error => {
								console.error("QOL: Could not update next action", error);
								new Notice(`Could not update next action: ${error instanceof Error ? error.message : String(error)}`);
							})
							.finally(() => { this.saving = false; void this.render(); });
					});
				if (revision !== this.revision) return;
			}
		} catch (error) {
			root.empty();
			root.createDiv({ cls: "qol-goals-error", text: error instanceof Error ? error.message : String(error) });
		}
		if (revision === this.revision) this.containerEl.replaceChildren(root);
	}
}
