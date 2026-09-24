import { App, PluginSettingTab, Setting } from "obsidian";
import type QolPlugin from "./main";

// ── One Line ──────────────────────────────────────────────────────────────────

export interface OneLineSettings {
	showTitle: boolean;
	defaultDayTitle: string;
	defaultWeekTitle: string;
	defaultSection: string;
	defaultLimit: number;
	dailyNotesFolder: string;
	weeklyNotesFolder: string;
}

export const DEFAULT_ONELINE_SETTINGS: OneLineSettings = {
	showTitle: true,
	defaultDayTitle: "On this day",
	defaultWeekTitle: "This week",
	defaultSection: "One Line",
	defaultLimit: 5,
	dailyNotesFolder: "Journal/Daily",
	weeklyNotesFolder: "Journal/Weekly",
};

// ── Birthdays ─────────────────────────────────────────────────────────────────

export interface BirthdaysSettings {
	showTitle: boolean;
	defaultTitle: string;
	defaultLiving: boolean;
	peopleFolder: string;
}

export const DEFAULT_BIRTHDAYS_SETTINGS: BirthdaysSettings = {
	showTitle: true,
	defaultTitle: "Birthdays",
	defaultLiving: false,
	peopleFolder: "People",
};

// ── Modified ──────────────────────────────────────────────────────────────────

export interface ModifiedSettings {
	showTitle: boolean;
	defaultDayTitle: string;
	defaultWeekTitle: string;
	defaultMonthTitle: string;
	defaultLimit: number | null;
}

export const DEFAULT_MODIFIED_SETTINGS: ModifiedSettings = {
	showTitle: true,
	defaultDayTitle: "Today's notes",
	defaultWeekTitle: "This week's notes",
	defaultMonthTitle: "This month's notes",
	defaultLimit: null,
};

// ── Links ─────────────────────────────────────────────────────────────────────

export interface LinksSettings {
	enabled: boolean;
	sectionTitle: string;
	limit: number;
	refreshInterval: number;
}

export const DEFAULT_LINKS_SETTINGS: LinksSettings = {
	enabled: true,
	sectionTitle: "Links",
	limit: 0,
	refreshInterval: 500,
};

// ── Utilities ─────────────────────────────────────────────────────────────────

export interface UtilitiesSettings {
	timestampFormat: string;
}

export const DEFAULT_UTILITIES_SETTINGS: UtilitiesSettings = {
	timestampFormat: "YYYY-MM-DD HH:mm",
};

// ── Combined ──────────────────────────────────────────────────────────────────

export interface QolSettings {
	oneline: OneLineSettings;
	birthdays: BirthdaysSettings;
	modified: ModifiedSettings;
	links: LinksSettings;
	utilities: UtilitiesSettings;
}

export const DEFAULT_SETTINGS: QolSettings = {
	oneline: DEFAULT_ONELINE_SETTINGS,
	birthdays: DEFAULT_BIRTHDAYS_SETTINGS,
	modified: DEFAULT_MODIFIED_SETTINGS,
	links: DEFAULT_LINKS_SETTINGS,
	utilities: DEFAULT_UTILITIES_SETTINGS,
};

// ── Settings Tab ──────────────────────────────────────────────────────────────

export class QolSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: QolPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.addOneLineSection(containerEl);
		this.addBirthdaysSection(containerEl);
		this.addModifiedSection(containerEl);
		this.addLinksSection(containerEl);
		this.addUtilitiesSection(containerEl);
	}

	private heading(containerEl: HTMLElement, text: string) {
		containerEl.createEl("h3", { text, cls: "qol-section-heading" });
	}

	private card(containerEl: HTMLElement): HTMLElement {
		return containerEl.createDiv({ cls: "qol-section-card" });
	}

	// Show or hide a setting row, and mark it as a sub-setting (indented, no separator)
	private sub(setting: Setting, hidden: boolean) {
		setting.settingEl.style.display = hidden ? "none" : "";
		setting.settingEl.classList.add("qol-title-sub");
	}

	// Show or hide a setting row (no indent, keeps separator)
	private vis(setting: Setting, hidden: boolean) {
		setting.settingEl.style.display = hidden ? "none" : "";
	}

	private addOneLineSection(containerEl: HTMLElement) {
		this.heading(containerEl, "One Line");
		const card = this.card(containerEl);
		const s = this.plugin.settings.oneline;
		const save = () => this.plugin.saveSettings();

		let dayTitleSetting: Setting;
		let weekTitleSetting: Setting;

		new Setting(card)
			.setName("Show title")
			.setDesc("Show the block title bar by default.")
			.addToggle(t => t.setValue(s.showTitle).onChange(async v => {
				s.showTitle = v;
				await save();
				this.sub(dayTitleSetting, !v);
				this.sub(weekTitleSetting, !v);
			}));

		dayTitleSetting = new Setting(card)
			.setName("Default title (day)")
			.setDesc("Block title for period=day.")
			.addText(t => t.setPlaceholder(DEFAULT_ONELINE_SETTINGS.defaultDayTitle).setValue(s.defaultDayTitle).onChange(async v => {
				s.defaultDayTitle = v || DEFAULT_ONELINE_SETTINGS.defaultDayTitle; await save();
			}));
		this.sub(dayTitleSetting, !s.showTitle);

		weekTitleSetting = new Setting(card)
			.setName("Default title (week)")
			.setDesc("Block title for period=week.")
			.addText(t => t.setPlaceholder(DEFAULT_ONELINE_SETTINGS.defaultWeekTitle).setValue(s.defaultWeekTitle).onChange(async v => {
				s.defaultWeekTitle = v || DEFAULT_ONELINE_SETTINGS.defaultWeekTitle; await save();
			}));
		this.sub(weekTitleSetting, !s.showTitle);

		new Setting(card)
			.setName("Default section")
			.setDesc("Heading to extract when not specified in the block.")
			.addText(t => t.setPlaceholder(DEFAULT_ONELINE_SETTINGS.defaultSection).setValue(s.defaultSection).onChange(async v => {
				s.defaultSection = v || DEFAULT_ONELINE_SETTINGS.defaultSection; await save();
			}));

		new Setting(card)
			.setName("Default limit")
			.setDesc("Max entries shown in day mode when not specified in the block.")
			.addText(t => t.setPlaceholder(String(DEFAULT_ONELINE_SETTINGS.defaultLimit)).setValue(String(s.defaultLimit)).onChange(async v => {
				const n = parseInt(v, 10); s.defaultLimit = isNaN(n) || n < 1 ? DEFAULT_ONELINE_SETTINGS.defaultLimit : n; await save();
			}));

		new Setting(card)
			.setName("Daily notes folder")
			.setDesc("Vault-relative folder containing daily notes.")
			.addText(t => t.setPlaceholder(DEFAULT_ONELINE_SETTINGS.dailyNotesFolder).setValue(s.dailyNotesFolder).onChange(async v => {
				s.dailyNotesFolder = v || DEFAULT_ONELINE_SETTINGS.dailyNotesFolder; await save();
			}));

		new Setting(card)
			.setName("Weekly notes folder")
			.setDesc("Vault-relative folder containing weekly notes.")
			.addText(t => t.setPlaceholder(DEFAULT_ONELINE_SETTINGS.weeklyNotesFolder).setValue(s.weeklyNotesFolder).onChange(async v => {
				s.weeklyNotesFolder = v || DEFAULT_ONELINE_SETTINGS.weeklyNotesFolder; await save();
			}));
	}

	private addBirthdaysSection(containerEl: HTMLElement) {
		this.heading(containerEl, "Birthdays");
		const card = this.card(containerEl);
		const s = this.plugin.settings.birthdays;
		const save = () => this.plugin.saveSettings();

		let titleSetting: Setting;

		new Setting(card)
			.setName("Show title")
			.setDesc("Show the block title bar by default.")
			.addToggle(t => t.setValue(s.showTitle).onChange(async v => {
				s.showTitle = v; await save(); this.sub(titleSetting, !v);
			}));

		titleSetting = new Setting(card)
			.setName("Default title")
			.setDesc("Block title when not specified in the block.")
			.addText(t => t.setPlaceholder(DEFAULT_BIRTHDAYS_SETTINGS.defaultTitle).setValue(s.defaultTitle).onChange(async v => {
				s.defaultTitle = v || DEFAULT_BIRTHDAYS_SETTINGS.defaultTitle; await save();
			}));
		this.sub(titleSetting, !s.showTitle);

		new Setting(card)
			.setName("Show living only")
			.setDesc("Hide deceased people by default.")
			.addToggle(t => t.setValue(s.defaultLiving).onChange(async v => {
				s.defaultLiving = v; await save();
			}));

		new Setting(card)
			.setName("People folder")
			.setDesc("Vault-relative folder to scan for person notes.")
			.addText(t => t.setPlaceholder(DEFAULT_BIRTHDAYS_SETTINGS.peopleFolder).setValue(s.peopleFolder).onChange(async v => {
				s.peopleFolder = v || DEFAULT_BIRTHDAYS_SETTINGS.peopleFolder; await save();
			}));
	}

	private addModifiedSection(containerEl: HTMLElement) {
		this.heading(containerEl, "Modified");
		const card = this.card(containerEl);
		const s = this.plugin.settings.modified;
		const save = () => this.plugin.saveSettings();

		let dayTitleSetting: Setting;
		let weekTitleSetting: Setting;
		let monthTitleSetting: Setting;

		new Setting(card)
			.setName("Show title")
			.setDesc("Show the heading above callouts by default.")
			.addToggle(t => t.setValue(s.showTitle).onChange(async v => {
				s.showTitle = v; await save();
				this.sub(dayTitleSetting, !v);
				this.sub(weekTitleSetting, !v);
				this.sub(monthTitleSetting, !v);
			}));

		const disabled = !s.showTitle;

		dayTitleSetting = new Setting(card)
			.setName("Default title (day)")
			.addText(t => t.setPlaceholder(DEFAULT_MODIFIED_SETTINGS.defaultDayTitle).setValue(s.defaultDayTitle).onChange(async v => {
				s.defaultDayTitle = v || DEFAULT_MODIFIED_SETTINGS.defaultDayTitle; await save();
			}));
		this.sub(dayTitleSetting, disabled);

		weekTitleSetting = new Setting(card)
			.setName("Default title (week)")
			.addText(t => t.setPlaceholder(DEFAULT_MODIFIED_SETTINGS.defaultWeekTitle).setValue(s.defaultWeekTitle).onChange(async v => {
				s.defaultWeekTitle = v || DEFAULT_MODIFIED_SETTINGS.defaultWeekTitle; await save();
			}));
		this.sub(weekTitleSetting, disabled);

		monthTitleSetting = new Setting(card)
			.setName("Default title (month)")
			.addText(t => t.setPlaceholder(DEFAULT_MODIFIED_SETTINGS.defaultMonthTitle).setValue(s.defaultMonthTitle).onChange(async v => {
				s.defaultMonthTitle = v || DEFAULT_MODIFIED_SETTINGS.defaultMonthTitle; await save();
			}));
		this.sub(monthTitleSetting, disabled);

		new Setting(card)
			.setName("Default limit")
			.setDesc("Max entries per callout. Leave empty for no limit.")
			.addText(t => t.setPlaceholder("all").setValue(s.defaultLimit !== null ? String(s.defaultLimit) : "").onChange(async v => {
				const n = parseInt(v, 10);
				s.defaultLimit = (!v.trim() || isNaN(n) || n < 1) ? null : n; await save();
			}));
	}

	private addLinksSection(containerEl: HTMLElement) {
		this.heading(containerEl, "Links");
		const card = this.card(containerEl);
		const s = this.plugin.settings.links;
		const save = () => this.plugin.saveSettings();

		let titleSetting: Setting;
		let limitSetting: Setting;
		let intervalSetting: Setting;

		new Setting(card)
			.setName("Enable")
			.setDesc("Append backlinks and outlinks to the bottom of every note.")
			.addToggle(t => t.setValue(s.enabled).onChange(async v => {
				s.enabled = v; await save();
				this.vis(titleSetting, !v);
				this.vis(limitSetting, !v);
				this.vis(intervalSetting, !v);
				this.plugin.onLinksSettingChanged();
			}));

		const disabled = !s.enabled;

		titleSetting = new Setting(card)
			.setName("Section title")
			.setDesc("Heading shown above the backlinks and outlinks callouts.")
			.addText(t => t.setPlaceholder(DEFAULT_LINKS_SETTINGS.sectionTitle).setValue(s.sectionTitle).onChange(async v => {
				s.sectionTitle = v || DEFAULT_LINKS_SETTINGS.sectionTitle; await save();
				this.plugin.onLinksSettingChanged();
			}));
		this.vis(titleSetting, disabled);

		limitSetting = new Setting(card)
			.setName("Limit")
			.setDesc("Max entries per callout. Leave empty or 0 for no limit.")
			.addText(t => t.setPlaceholder("all").setValue(s.limit > 0 ? String(s.limit) : "").onChange(async v => {
				const n = parseInt(v, 10);
				s.limit = (!v.trim() || isNaN(n) || n < 1) ? 0 : n; await save();
				this.plugin.onLinksSettingChanged();
			}));
		this.vis(limitSetting, disabled);

		intervalSetting = new Setting(card)
			.setName("Refresh interval")
			.setDesc("Debounce delay in milliseconds for updates while editing.")
			.addText(t => t.setPlaceholder(String(DEFAULT_LINKS_SETTINGS.refreshInterval)).setValue(String(s.refreshInterval)).onChange(async v => {
				const n = parseInt(v, 10);
				s.refreshInterval = isNaN(n) || n < 0 ? DEFAULT_LINKS_SETTINGS.refreshInterval : n; await save();
			}));
		this.vis(intervalSetting, disabled);
	}

	private addUtilitiesSection(containerEl: HTMLElement) {
		this.heading(containerEl, "Utilities");
		const card = this.card(containerEl);
		const s = this.plugin.settings.utilities;
		const save = () => this.plugin.saveSettings();

		new Setting(card)
			.setName("Timestamp format")
			.setDesc("Format for the `updated` frontmatter field. Tokens: YYYY MM DD HH mm ss.")
			.addText(t => t
				.setPlaceholder(DEFAULT_UTILITIES_SETTINGS.timestampFormat)
				.setValue(s.timestampFormat)
				.onChange(async v => {
					s.timestampFormat = v || DEFAULT_UTILITIES_SETTINGS.timestampFormat;
					await save();
				}));
	}
}
