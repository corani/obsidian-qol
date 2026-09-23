import { App, MarkdownRenderChild, MarkdownPostProcessorContext, MarkdownRenderer, TFile } from "obsidian";
import { parseBlockConfig, ParseError } from "./parser";
import { resolveDayFiles, resolveWeekFiles, resolveAnchorDate } from "./resolver";
import { extractSection } from "./extractor";
import type { OneLineSettings } from "../settings";

// Format a YYYY-MM-DD filename stem as "Weekday, DD Month YYYY"
function formatDate(stem: string): string {
	const m = stem.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return stem;
	const d = new Date(+m[1], +m[2] - 1, +m[3]);
	return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export class OneLineBlock extends MarkdownRenderChild {
	constructor(
		private app: App,
		private settings: OneLineSettings,
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

		const title = config.title ?? (config.period === "week"
			? this.settings.defaultWeekTitle
			: this.settings.defaultDayTitle);
		const section = config.section ?? this.settings.defaultSection;

		const files: TFile[] = config.period === "week"
			? resolveWeekFiles(this.app, this.settings, this.ctx.sourcePath, config)
			: resolveDayFiles(this.app, this.settings, this.ctx.sourcePath, config);

		const anchor = resolveAnchorDate(this.app, this.ctx.sourcePath, config);
		if (anchor === null) {
			this.renderError(el, "Cannot determine date for this note. Add a `date` property to the block or to the note's frontmatter.");
			return;
		}

		const block = el.createDiv({ cls: "ol-block" });
		const showTitle = config.showTitle ?? this.settings.showTitle;
		if (showTitle) {
			const header = block.createDiv({ cls: "ol-block__header" });
			header.createSpan({ cls: "ol-block__title", text: title });
		}

		const content = block.createDiv({ cls: "ol-block__content" });
		let hasEntries = false;

		for (const file of files) {
			const fileContent = await this.app.vault.cachedRead(file);
			const lines = extractSection(fileContent, section);
			if (lines.length === 0) continue;

			hasEntries = true;
			const stem = file.name.replace(/\.md$/, "");
			const entry = content.createDiv({ cls: "ol-block__entry" });

			const link = entry.createEl("a", {
				cls: "ol-block__entry-date internal-link",
				text: formatDate(stem),
			});
			link.setAttribute("href", stem);
			link.setAttribute("data-href", stem);
			link.setAttribute("target", "_blank");
			link.setAttribute("rel", "noopener");

			const body = entry.createDiv({ cls: "ol-block__entry-body" });
			await MarkdownRenderer.render(this.app, lines.join("\n"), body, file.path, this);
		}

		if (!hasEntries) {
			content.createDiv({ cls: "ol-block__empty", text: "No entries found." });
		}
	}

	private renderError(el: HTMLElement, message: string) {
		const block = el.createDiv({ cls: "ol-block ol-block--error" });
		block.createDiv({ cls: "ol-block__header" })
			.createSpan({ cls: "ol-block__title", text: "One Line" });
		block.createDiv({ cls: "ol-block__content" })
			.createDiv({ cls: "ol-block__error", text: message });
	}
}
