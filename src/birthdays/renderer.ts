import { App, MarkdownRenderChild, MarkdownPostProcessorContext } from "obsidian";
import { parseBlockConfig, ParseError } from "./parser";
import { resolvePersons, resolveAnchorDate, Person } from "./resolver";
import type { BirthdaysSettings } from "../settings";

function formatDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function calcAge(born: Date, asOf: Date): number | null {
	const age = asOf.getFullYear() - born.getFullYear();
	return age > 130 ? null : age;
}

export class BirthdaysBlock extends MarkdownRenderChild {
	constructor(
		private app: App,
		private settings: BirthdaysSettings,
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

		const anchor = resolveAnchorDate(this.app, this.ctx.sourcePath, config);
		if (!anchor) {
			this.renderError(el, "Cannot determine date for this note. Add a `date` property to the block or to the note's frontmatter.");
			return;
		}

		const title = config.title ?? this.settings.defaultTitle;
		const showTitle = config.showTitle ?? this.settings.showTitle;
		const persons = resolvePersons(this.app, this.settings, this.ctx.sourcePath, config);

		const block = el.createDiv({ cls: "ol-block" });
		if (showTitle) {
			const header = block.createDiv({ cls: "ol-block__header" });
			header.createSpan({ cls: "ol-block__title", text: title });
		}

		const content = block.createDiv({ cls: "ol-block__content" });

		if (persons.length === 0) {
			content.createDiv({ cls: "ol-block__empty", text: "No birthdays found." });
			return;
		}

		const table = content.createEl("table", { cls: "birthdays-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		const showDied = !(config.living ?? this.settings.defaultLiving);
		for (const h of showDied ? ["Name", "Born", "Died", "Age"] : ["Name", "Born", "Age"]) {
			headerRow.createEl("th", { text: h });
		}

		const tbody = table.createEl("tbody");
		for (const person of persons) {
			this.renderRow(tbody, person, anchor, showDied);
		}
	}

	private renderRow(tbody: HTMLElement, person: Person, anchor: Date, showDied: boolean) {
		const row = tbody.createEl("tr");

		// Name -- internal link
		const nameCell = row.createEl("td");
		const link = nameCell.createEl("a", {
			cls: "internal-link",
			text: person.file.basename,
		});
		link.setAttribute("href", person.file.path);
		link.setAttribute("data-href", person.file.path);
		link.setAttribute("target", "_blank");
		link.setAttribute("rel", "noopener");

		// Born
		row.createEl("td", { text: formatDate(person.born) });

		// Died (omitted when living-only filter is active)
		if (showDied) {
			if (person.died) {
				row.createEl("td", { text: formatDate(person.died) });
			} else if (person.diedUnknown) {
				row.createEl("td", { text: "?" });
			} else {
				row.createEl("td", { text: "" });
			}
		}

		// Age
		if (person.diedUnknown) {
			row.createEl("td", { text: "?" });
		} else if (person.died) {
			const age = calcAge(person.born, person.died);
			row.createEl("td", { text: age !== null ? `(${age})` : "?" });
		} else {
			const age = calcAge(person.born, anchor);
			row.createEl("td", { text: age !== null ? String(age) : "?" });
		}
	}

	private renderError(el: HTMLElement, message: string) {
		const block = el.createDiv({ cls: "ol-block ol-block--error" });
		block.createDiv({ cls: "ol-block__header" })
			.createSpan({ cls: "ol-block__title", text: "Birthdays" });
		block.createDiv({ cls: "ol-block__content" })
			.createDiv({ cls: "ol-block__error", text: message });
	}
}
