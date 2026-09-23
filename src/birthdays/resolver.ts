import { App, TFile } from "obsidian";
import type { BlockConfig } from "./parser";
import type { BirthdaysSettings } from "../settings";

export interface Person {
	file: TFile;
	born: Date;
	died: Date | null;
	diedUnknown: boolean;
}

// Parse a date string from frontmatter. Returns null if missing/empty, a Date if valid,
// or a Date with year=1 (Dataview sentinel) if the value is unparseable.
// Bare YYYY-MM-DD strings are parsed as local time to avoid UTC midnight → previous day in UTC+ zones.
function parseFrontmatterDate(value: unknown): Date | null {
	if (!value) return null;
	const s = String(value).trim();
	if (!s) return null;
	// Parse bare date as local time
	const bare = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (bare) {
		const d = new Date(+bare[1], +bare[2] - 1, +bare[3]);
		return isNaN(d.getTime()) ? null : d;
	}
	const d = new Date(s);
	if (!isNaN(d.getTime())) return d;
	// Unparseable (e.g. "~1881") -- return sentinel
	return new Date("0001-01-01");
}

function isSentinel(d: Date): boolean {
	return d.getFullYear() === 1;
}

// Resolve the anchor date from block config, frontmatter, then filename.
export function resolveAnchorDate(
	app: App,
	contextPath: string,
	config: BlockConfig
): Date | null {
	// 1. Block config date
	if (config.date) {
		const raw = config.date.toLowerCase() === "today" ? new Date().toISOString().slice(0, 10) : config.date;
		const d = new Date(raw);
		if (!isNaN(d.getTime())) return d;
	}

	// 2. Frontmatter date
	const file = app.vault.getFileByPath(contextPath);
	if (file) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm?.date) {
			const d = new Date(fm.date);
			if (!isNaN(d.getTime())) return d;
		}
	}

	// 3. Filename
	const stem = contextPath.split("/").pop()?.replace(/\.md$/, "") ?? "";
	// YYYY-MM-DD
	if (/^\d{4}-\d{2}-\d{2}$/.test(stem)) {
		const d = new Date(stem);
		if (!isNaN(d.getTime())) return d;
	}
	// YYYY-Www -- use Monday of that week
	const wm = stem.match(/^(\d{4})-W(\d{2})$/);
	if (wm) {
		const year = +wm[1], week = +wm[2];
		const jan4 = new Date(year, 0, 4);
		const monday = new Date(jan4);
		monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
		return monday;
	}
	// YYYY-MM
	const mm = stem.match(/^(\d{4})-(\d{2})$/);
	if (mm) return new Date(+mm[1], +mm[2] - 1, 1);

	return null;
}

// Returns true if birth month/day matches the anchor's month/day (day mode)
function matchesDay(born: Date, anchor: Date): boolean {
	return born.getMonth() === anchor.getMonth() && born.getDate() === anchor.getDate();
}

// Returns true if birth month/day falls within the ISO week containing anchor
function matchesWeek(born: Date, anchor: Date): boolean {
	// Find Monday of the anchor's week
	const monday = new Date(anchor);
	monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
	monday.setHours(0, 0, 0, 0);
	const sunday = new Date(monday);
	sunday.setDate(monday.getDate() + 6);
	sunday.setHours(23, 59, 59, 999);

	// Compare using this year so month-boundary weeks work correctly
	const year = anchor.getFullYear();
	const bornThisYear = new Date(year, born.getMonth(), born.getDate());
	// Also check adjacent years for weeks spanning Dec/Jan
	for (const y of [year - 1, year, year + 1]) {
		const candidate = new Date(y, born.getMonth(), born.getDate());
		if (candidate >= monday && candidate <= sunday) return true;
	}
	return false;
}

// Returns true if birth month matches the anchor's month (month mode)
function matchesMonth(born: Date, anchor: Date): boolean {
	return born.getMonth() === anchor.getMonth();
}

export function resolvePersons(
	app: App,
	settings: BirthdaysSettings,
	contextPath: string,
	config: BlockConfig
): Person[] {
	const anchor = resolveAnchorDate(app, contextPath, config);
	if (!anchor) return [];

	const folder = settings.peopleFolder.replace(/\/$/, "");
	const livingOnly = config.living ?? settings.defaultLiving;

	const persons: Person[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		if (!file.path.startsWith(folder + "/")) continue;

		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || fm.type !== "person") continue;

		const born = parseFrontmatterDate(fm.born);
		if (!born || isSentinel(born)) continue;

		// Match period
		let matches = false;
		if (config.period === "day") matches = matchesDay(born, anchor);
		else if (config.period === "week") matches = matchesWeek(born, anchor);
		else matches = matchesMonth(born, anchor);
		if (!matches) continue;

		const diedRaw = parseFrontmatterDate(fm.died);
		const died = diedRaw && !isSentinel(diedRaw) ? diedRaw : null;
		const diedUnknown = diedRaw !== null && isSentinel(diedRaw);

		if (livingOnly && died !== null) continue;
		if (livingOnly && (new Date().getFullYear() - born.getFullYear()) > 130) continue;

		persons.push({ file, born, died, diedUnknown });
	}

	// Sort by birth month+day, then year
	persons.sort((a, b) => {
		const amd = a.born.getMonth() * 100 + a.born.getDate();
		const bmd = b.born.getMonth() * 100 + b.born.getDate();
		if (amd !== bmd) return amd - bmd;
		return a.born.getFullYear() - b.born.getFullYear();
	});

	return persons;
}
