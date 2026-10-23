import type { App, TFile } from "obsidian";
import { resolveAnchorDate } from "../modified/resolver";
import type { GoalsSettings } from "../settings";

export interface GoalsConfig {
	period: "weekly" | "monthly";
	date?: string;
	section: string;
}

export interface GoalTask {
	line: number;
	raw: string;
	text: string;
	status: string;
	indent: number;
}

export function parseGoalsConfig(source: string, defaultSection = "Goals*"): GoalsConfig {
	let period: GoalsConfig["period"] | undefined;
	let date: string | undefined;
	let section = defaultSection;
	for (const raw of source.split("\n")) {
		const line = raw.replace(/\s+#.*$/, "").trim();
		if (!line || line.startsWith("#")) continue;
		const match = line.match(/^(\w+):\s*(.*?)\s*$/);
		if (!match) throw new Error(`Invalid goals option: ${line}`);
		const [, key, value] = match;
		switch (key.toLowerCase()) {
			case "period":
				if (value !== "weekly" && value !== "monthly") {
					throw new Error('Goals period must be "weekly" or "monthly".');
				}
				period = value;
				break;
			case "date": {
				if (value.toLowerCase() !== "today") {
					const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
					const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
					if (!m || !d || d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) {
						throw new Error("Goals date must be YYYY-MM-DD or today.");
					}
				}
				date = value;
				break;
			}
			case "section":
				if (!value) throw new Error("Goals section cannot be empty.");
				section = value;
				break;
			default:
				throw new Error(`Unknown goals option: ${key}`);
		}
	}
	if (!period) throw new Error('Goals requires period: weekly or period: monthly.');
	return { period, date, section };
}

export function resolveGoalsFile(app: App, contextPath: string, config: GoalsConfig, settings: GoalsSettings): TFile {
	const anchor = resolveAnchorDate(app, contextPath, {
		period: config.period === "weekly" ? "week" : "month",
		date: config.date,
	});
	if (!anchor) throw new Error("Cannot determine this note's date. Set date in the block or note frontmatter.");
	let stem: string;
	if (config.period === "monthly") {
		stem = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`;
	} else {
		// UTC calendar arithmetic avoids DST changing the ISO week number.
		const thursday = new Date(Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()));
		thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
		const year = thursday.getUTCFullYear();
		const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
		stem = `${year}-W${String(week).padStart(2, "0")}`;
	}
	const folder = (config.period === "weekly" ? settings.weeklyNotesFolder : settings.monthlyNotesFolder).replace(/\/+$/, "");
	const path = `${folder ? `${folder}/` : ""}${stem}.md`;
	const file = app.vault.getFileByPath(path);
	if (!file) throw new Error(`Goals source note not found: ${path}`);
	return file;
}

export function extractGoals(content: string, section: string): GoalTask[] {
	const lines = content.split("\n");
	const prefix = section.endsWith("*");
	const target = (prefix ? section.slice(0, -1) : section).toLowerCase();
	const tasks: GoalTask[] = [];
	let level = 0;
	let found = false;
	let fence: string | undefined;
	let frontmatter = lines[0]?.trim() === "---";
	let comment = false;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index].replace(/\r$/, "");
		if (frontmatter) {
			if (index > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false;
			continue;
		}
		const marker = line.match(/^\s*(`{3,}|~{3,})/);
		if (fence) {
			if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length &&
				line.trim() === marker[1]) fence = undefined;
			continue;
		}
		if (comment || line.trimStart().startsWith("<!--")) {
			comment = !line.includes("-->");
			continue;
		}
		if (marker) { fence = marker[1]; continue; }
		const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
		if (heading) {
			if (level && heading[1].length <= level) break;
			const title = heading[2].toLowerCase();
			if (!found && (prefix ? title.startsWith(target) : title === target)) {
				found = true;
				level = heading[1].length;
			}
			continue;
		}
		if (!level) continue;
		const task = line.match(/^([ \t]*)(?:[-+*]|\d+[.)])\s+\[([^\]])\]\s+(.*)$/);
		if (task) {
			tasks.push({
				line: index, raw: line, status: task[2], text: task[3],
				indent: task[1].replace(/\t/g, "    ").length,
			});
		}
	}
	if (!found) throw new Error(`Goals section not found: ${section}`);
	return tasks;
}

export function toggleGoal(app: App, task: GoalTask, path: string): string {
	const plugins = (app as App & { plugins?: { plugins: Record<string, unknown> } }).plugins?.plugins;
	const plugin = plugins?.["obsidian-tasks-plugin"];
	if (plugin !== undefined) {
		const api = typeof plugin === "object" && plugin !== null && "apiV1" in plugin ? plugin.apiV1 : null;
		if (!api || typeof api !== "object" || !("executeToggleTaskDoneCommand" in api) ||
			typeof api.executeToggleTaskDoneCommand !== "function") {
			throw new Error("The installed Tasks plugin does not expose its checkbox-toggle API.");
		}
		const result: unknown = api.executeToggleTaskDoneCommand(task.raw, path);
		if (typeof result !== "string" || !result) throw new Error("Tasks returned an invalid task update.");
		return result;
	}
	return task.raw.replace(/^(\s*(?:[-+*]|\d+[.)])\s+\[)[^\]](\])/, `$1${task.status === " " ? "x" : " "}$2`);
}

export async function updateGoal(app: App, file: TFile, snapshot: string, task: GoalTask): Promise<void> {
	await app.vault.process(file, current => {
		if (current !== snapshot) throw new Error("The goals source changed. Refresh and try again.");
		const lines = current.split("\n");
		if (lines[task.line]?.replace(/\r$/, "") !== task.raw) throw new Error("The source task no longer matches.");
		const newline = current.includes("\r\n") ? "\r\n" : "\n";
		const replacement = toggleGoal(app, task, file.path).replace(/\r?\n/g, newline);
		lines[task.line] = replacement + (lines[task.line].endsWith("\r") ? "\r" : "");
		return lines.join("\n");
	});
}
