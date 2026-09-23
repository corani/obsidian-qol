import { App, TFile } from "obsidian";
import type { BlockConfig } from "./parser";
import type { ModifiedSettings } from "../settings";

export interface ResolvedFile {
	file: TFile;
	displayTitle: string;
	timestamp: number;  // for sorting
}

export interface ResolvedPeriod {
	created: ResolvedFile[];
	createdTotal: number;
	modified: ResolvedFile[];
	modifiedTotal: number;
}

const EXCLUDED_FOLDERS = [".obsidian", "templates"];

function isExcluded(path: string): boolean {
	const lower = path.toLowerCase();
	return EXCLUDED_FOLDERS.some(f => lower.startsWith(f + "/") || lower === f);
}

// Parse a date/datetime frontmatter string to a Date, or null if unparseable.
// Accepts: YYYY-MM-DD, YYYY-MM-DD HH:mm, YYYY-MM-DDTHH:mm:ss, YYYY-MM-DDTHH:mm:ss+HH:mm
// Bare YYYY-MM-DD is parsed as local time to avoid UTC midnight → previous day in UTC+ zones.
function parseFrontmatterDate(value: unknown): Date | null {
	if (!value) return null;
	const s = String(value).trim();
	if (!s) return null;
	// Bare date: parse as local time
	const bare = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (bare) {
		const d = new Date(+bare[1], +bare[2] - 1, +bare[3]);
		return isNaN(d.getTime()) ? null : d;
	}
	// Datetime with space separator: normalise to ISO
	const normalised = s.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}.*)$/, "$1T$2");
	const d = new Date(normalised);
	return isNaN(d.getTime()) ? null : d;
}

// Format a Date as YYYY-MM-DD in local time
function toLocalDay(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Format a Date as YYYY-MM in local time
function toLocalMonth(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ISO week string "YYYY-Www" for a given Date
function isoWeek(d: Date): string {
	const thursday = new Date(d);
	thursday.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
	const yearStart = new Date(thursday.getFullYear(), 0, 1);
	const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
	return `${thursday.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Resolve anchor date from block config + context note frontmatter + filename
export function resolveAnchorDate(app: App, contextPath: string, config: BlockConfig): Date | null {
	// 1. Block config date
	if (config.date) {
		const d = config.date.toLowerCase() === "today"
			? new Date()
			: parseFrontmatterDate(config.date);
		if (d) return d;
	}

	// 2. Context note frontmatter: created then date
	const file = app.vault.getFileByPath(contextPath);
	if (file) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm) {
			const fromCreated = parseFrontmatterDate(fm.created);
			if (fromCreated) return fromCreated;
			const fromDate = parseFrontmatterDate(fm.date);
			if (fromDate) return fromDate;
		}
	}

	// 3. Filename (all local-time)
	const stem = contextPath.split("/").pop()?.replace(/\.md$/, "") ?? "";
	const bare = stem.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (bare) return new Date(+bare[1], +bare[2] - 1, +bare[3]);
	const wm = stem.match(/^(\d{4})-W(\d{2})$/);
	if (wm) {
		const year = +wm[1], week = +wm[2];
		const jan4 = new Date(year, 0, 4);
		const monday = new Date(jan4);
		monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
		return monday;
	}
	const mm = stem.match(/^(\d{4})-(\d{2})$/);
	if (mm) return new Date(+mm[1], +mm[2] - 1, 1);

	return null;
}

function getCreatedDate(app: App, file: TFile): Date {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (fm) {
		const d = parseFrontmatterDate(fm.created);
		if (d) return d;
	}
	return new Date(file.stat.ctime);
}

function getModifiedDate(app: App, file: TFile): Date {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (fm) {
		const d = parseFrontmatterDate(fm.updated);
		if (d) return d;
	}
	return new Date(file.stat.mtime);
}

function getDisplayTitle(app: App, file: TFile): string {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (fm) {
		if (fm.name && typeof fm.name === "string") return fm.name;
		if (fm.title && typeof fm.title === "string") return fm.title;
		if (fm.aliases) {
			const a = Array.isArray(fm.aliases) ? fm.aliases[0] : fm.aliases;
			if (a && typeof a === "string") return a;
		}
	}
	return file.basename;
}

// Returns true if the date string/value matches the anchor period
function inPeriod(date: Date, anchor: Date, period: "day" | "week" | "month"): boolean {
	if (period === "day")   return toLocalDay(date) === toLocalDay(anchor);
	if (period === "week")  return isoWeek(date) === isoWeek(anchor);
	return toLocalMonth(date) === toLocalMonth(anchor);
}

export function resolveFiles(
	app: App,
	_settings: ModifiedSettings,
	contextPath: string,
	config: BlockConfig
): ResolvedPeriod | null {
	const anchor = resolveAnchorDate(app, contextPath, config);
	if (!anchor) return null;

	const limit = config.limit !== undefined ? config.limit : _settings.defaultLimit;
	const created: ResolvedFile[] = [];
	const modified: ResolvedFile[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		if (isExcluded(file.path)) continue;

		const createdDate = getCreatedDate(app, file);
		const modifiedDate = getModifiedDate(app, file);
		const displayTitle = getDisplayTitle(app, file);

		if (inPeriod(createdDate, anchor, config.period)) {
			created.push({ file, displayTitle, timestamp: createdDate.getTime() });
		} else if (inPeriod(modifiedDate, anchor, config.period)) {
			modified.push({ file, displayTitle, timestamp: modifiedDate.getTime() });
		}
	}

	created.sort((a, b) => a.timestamp - b.timestamp);
	modified.sort((a, b) => a.timestamp - b.timestamp);

	return {
		created: limit !== null ? created.slice(0, limit) : created,
		createdTotal: created.length,
		modified: limit !== null ? modified.slice(0, limit) : modified,
		modifiedTotal: modified.length,
	};
}
