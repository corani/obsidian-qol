import { parseYaml } from "obsidian";
import type { App, TFile } from "obsidian";
import { extractGoals, GoalTask } from "../goals/model";

type FilterScalar = string | number | boolean;
type FilterValue = FilterScalar | FilterScalar[];

export interface NextActionsConfig {
	folder: string;
	section: string;
	filter: Record<string, FilterValue>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isScalar(value: unknown): value is FilterScalar {
	return typeof value === "string" || typeof value === "boolean" ||
		(typeof value === "number" && Number.isFinite(value));
}

export function parseNextActionsConfig(source: string): NextActionsConfig {
	const value: unknown = parseYaml(source);
	if (!isRecord(value)) throw new Error("Next actions requires a YAML mapping with folder and optional filter.");
	for (const key of Object.keys(value)) {
		if (key !== "folder" && key !== "filter" && key !== "section") throw new Error(`Unknown next-actions option: ${key}`);
	}
	if (typeof value.folder !== "string" || !value.folder.trim()) throw new Error("Next actions requires a folder.");
	const folder = value.folder.trim().replace(/\/+$/, "");
	if (!folder || folder.split("/").some(part => !part || part === "." || part === "..") || folder.includes("\\")) {
		throw new Error("Next-actions folder must be a vault-relative folder path.");
	}
	const section = value.section === undefined ? "Next Action" : value.section;
	if (typeof section !== "string" || !section.trim()) throw new Error("Next-actions section must be a non-empty heading name.");
	const filter = value.filter ?? {};
	if (!isRecord(filter)) throw new Error("Next-actions filter must be a mapping of property names to values.");
	const entries = Object.entries(filter).map(([key, expected]): [string, FilterValue] => {
		if (!isScalar(expected) && !(Array.isArray(expected) && expected.every(isScalar))) {
			throw new Error(`Invalid filter "${key}": use a string, number, boolean, or an array of these values.`);
		}
		return [key, expected];
	});
	return { folder, section: section.trim(), filter: Object.fromEntries(entries) };
}

function matchesScalar(actual: unknown, expected: FilterScalar, tag: boolean): boolean {
	if (actual === undefined || actual === null) {
		actual = typeof expected === "boolean" ? false : typeof expected === "number" ? 0 : "";
	}
	if (typeof actual !== typeof expected) return false;
	if (typeof expected !== "string" || typeof actual !== "string") return actual === expected;
	const text = tag ? actual.replace(/^#/, "") : actual;
	const pattern = tag ? expected.replace(/^#/, "") : expected;
	return pattern.endsWith("*") ? text.startsWith(pattern.slice(0, -1)) : text === pattern;
}

export function matchesFilter(properties: Record<string, unknown>, filter: NextActionsConfig["filter"]): boolean {
	return Object.entries(filter).every(([key, expected]) => {
		const actual: unknown = Object.prototype.hasOwnProperty.call(properties, key) ? properties[key] : undefined;
		if (Array.isArray(expected)) {
			return Array.isArray(actual) && actual.some(value => expected.some(pattern => matchesScalar(value, pattern, key === "tags")));
		}
		return matchesScalar(actual, expected, key === "tags");
	});
}

export function inNextActionsFolder(path: string, folder: string): boolean {
	return path === folder || path.startsWith(`${folder}/`);
}

export function resolveNextActionFiles(app: App, config: NextActionsConfig): TFile[] {
	return app.vault.getMarkdownFiles()
		.filter(file => inNextActionsFolder(file.path, config.folder) &&
			matchesFilter(app.metadataCache.getFileCache(file)?.frontmatter ?? {}, config.filter))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function nextActionTitle(app: App, file: TFile): string {
	const aliases: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.aliases;
	const first: unknown = Array.isArray(aliases) ? aliases[0] : aliases;
	return typeof first === "string" && first.trim() ? first : file.basename;
}

export function extractNextActions(content: string, section = "Next Action"): GoalTask[] {
	const result: GoalTask[] = [];
	const parents: { indent: number; depth: number }[] = [];
	for (const task of extractGoals(content, `${section}*`, false)) {
		while (parents.length && parents[parents.length - 1].indent >= task.indent) parents.pop();
		let depth = parents[parents.length - 1]?.depth ?? -1;
		if (task.status === " ") {
			depth++;
			result.push({ ...task, indent: depth });
		}
		parents.push({ indent: task.indent, depth });
	}
	return result;
}
