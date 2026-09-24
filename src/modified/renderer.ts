import { App, MarkdownRenderChild, MarkdownPostProcessorContext, MarkdownRenderer } from "obsidian";
import { parseBlockConfig, ParseError } from "./parser";
import { resolveFiles, ResolvedFile } from "./resolver";
import type { ModifiedSettings } from "../settings";

export class ModifiedBlock extends MarkdownRenderChild {
	constructor(
		private app: App,
		private settings: ModifiedSettings,
		private source: string,
		el: HTMLElement,
		private ctx: MarkdownPostProcessorContext
	) {
		super(el);
	}

	async onload() {
		await this.render();
		this.registerEvent(
			this.app.vault.on("modify", async () => {
				this.containerEl.empty();
				await this.render();
			})
		);
	}

	private async render() {
		const el = this.containerEl;

		let config;
		try {
			config = parseBlockConfig(this.source);
		} catch (e) {
			this.renderError(el, e instanceof ParseError ? e.message : String(e));
			return;
		}

		const result = resolveFiles(this.app, this.settings, this.ctx.sourcePath, config);
		if (!result) {
			this.renderError(el, "Cannot determine date for this note. Add a `date` property to the block or to the note's frontmatter.");
			return;
		}

		if (result.created.length === 0 && result.modified.length === 0) {
			el.createDiv({ cls: "modified-empty", text: "No notes found." });
			return;
		}

		// Build markdown and let Obsidian render it natively -- gives us real collapsible callouts
		const lines: string[] = [];

		const showTitle = config.showTitle ?? this.settings.showTitle;
		if (showTitle) {
			const titleText = config.title ?? this.defaultTitle(config.period);
			lines.push(`**${titleText}**`, "");
		}

		if (result.created.length > 0) {
			lines.push(`> [!success]- Created (${result.createdTotal})`);
			for (const f of result.created) {
				lines.push(`> - [[${f.file.path.replace(/\.md$/, "")}|${f.displayTitle}]]`);
			}
			if (result.createdTotal > result.created.length) {
				lines.push(`> - *… and ${result.createdTotal - result.created.length} more*`);
			}
			lines.push("");
		}

		if (result.modified.length > 0) {
			lines.push(`> [!seealso]- Modified (${result.modifiedTotal})`);
			for (const f of result.modified) {
				lines.push(`> - [[${f.file.path.replace(/\.md$/, "")}|${f.displayTitle}]]`);
			}
			if (result.modifiedTotal > result.modified.length) {
				lines.push(`> - *… and ${result.modifiedTotal - result.modified.length} more*`);
			}
			lines.push("");
		}

		await MarkdownRenderer.render(
			this.app,
			lines.join("\n"),
			el,
			this.ctx.sourcePath,
			this
		);
	}

	private defaultTitle(period: "day" | "week" | "month"): string {
		if (period === "week") return this.settings.defaultWeekTitle;
		if (period === "month") return this.settings.defaultMonthTitle;
		return this.settings.defaultDayTitle;
	}

	private renderError(el: HTMLElement, message: string) {
		const block = el.createDiv({ cls: "ol-block ol-block--error" });
		block.createDiv({ cls: "ol-block__header" })
			.createSpan({ cls: "ol-block__title", text: "Modified" });
		block.createDiv({ cls: "ol-block__content" })
			.createDiv({ cls: "ol-block__error", text: message });
	}
}
