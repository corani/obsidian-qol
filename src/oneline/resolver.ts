import { App, TFile } from "obsidian";
import type { BlockConfig } from "./parser";
import type { OneLineSettings } from "../settings";

// Parse a YYYY-MM-DD string as local time (avoids UTC midnight → previous day in UTC+ zones)
function parseLocalDate(s: string): Date | null {
	const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return null;
	const d = new Date(+m[1], +m[2] - 1, +m[3]);
	return isNaN(d.getTime()) ? null : d;
}

function parseDailyFilename(name: string): Date | null {
	return parseLocalDate(name);
}

function isoWeekOf(d: Date): string {
	const thursday = new Date(d);
	thursday.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
	const yearStart = new Date(thursday.getFullYear(), 0, 1);
	const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
	return `${thursday.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function resolveAnchorDate(
	app: App,
	contextPath: string,
	config: BlockConfig
): Date | null {
	// 1. Block config date
	if (config.date) {
		const d = config.date.toLowerCase() === "today" ? new Date() : new Date(config.date);
		if (!isNaN(d.getTime())) return d;
	}

	// 2. Frontmatter `date`
	const file = app.vault.getFileByPath(contextPath);
	if (file) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm?.date) {
			const d = parseLocalDate(String(fm.date));
			if (d) return d;
		}
	}

	// 3. Filename
	const stem = contextPath.split("/").pop()?.replace(/\.md$/, "") ?? "";
	const daily = parseDailyFilename(stem);
	if (daily) return daily;

	const wm = stem.match(/^(\d{4})-W(\d{2})$/);
	if (wm) {
		const year = +wm[1], week = +wm[2];
		const jan4 = new Date(year, 0, 4);
		const monday = new Date(jan4);
		monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
		return monday;
	}

	return null;
}

export function resolveDayFiles(
	app: App,
	settings: OneLineSettings,
	contextPath: string,
	config: BlockConfig
): TFile[] {
	const anchor = resolveAnchorDate(app, contextPath, config);
	if (!anchor) return [];

	const mm = String(anchor.getMonth() + 1).padStart(2, "0");
	const dd = String(anchor.getDate()).padStart(2, "0");
	const suffix = `-${mm}-${dd}.md`;
	const folder = settings.dailyNotesFolder.replace(/\/$/, "");
	const limit = config.limit ?? settings.defaultLimit;

	return app.vault.getMarkdownFiles()
		.filter(f => f.path.startsWith(folder + "/") && f.name.endsWith(suffix))
		.filter(f => {
			const d = parseDailyFilename(f.name.replace(/\.md$/, ""));
			return d !== null && d.getFullYear() !== anchor.getFullYear();
		})
		.sort((a, b) => b.name.localeCompare(a.name))
		.slice(0, limit);
}

export function resolveWeekFiles(
	app: App,
	settings: OneLineSettings,
	contextPath: string,
	config: BlockConfig
): TFile[] {
	const anchor = resolveAnchorDate(app, contextPath, config);
	if (!anchor) return [];

	const targetWeek = isoWeekOf(anchor);
	const folder = settings.dailyNotesFolder.replace(/\/$/, "");

	return app.vault.getMarkdownFiles()
		.filter(f => {
			if (!f.path.startsWith(folder + "/")) return false;
			const d = parseDailyFilename(f.name.replace(/\.md$/, ""));
			return d !== null && isoWeekOf(d) === targetWeek;
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}
