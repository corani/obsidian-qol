import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
	stdin: {
		contents: 'export * from "./src/goals/model"; export * from "./src/goals/renderer"; export { Element, notices, rendered } from "obsidian";',
		resolveDir: process.cwd(),
		loader: "ts",
	},
	bundle: true,
	write: false,
	format: "esm",
	platform: "node",
	plugins: [{
		name: "mock-obsidian",
		setup(build) {
			build.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "mock" }));
			build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
				contents: `
					export class Element {
						children = []; dataset = {}; events = {}; disabled = false;
						constructor(tag = "div", options = {}) { this.tag = tag; this.className = options.cls; this.textContent = options.text; }
						createEl(tag, options) { const el = new Element(tag, options); this.children.push(el); return el; }
						createDiv(options) { return this.createEl("div", options); }
						setAttribute() {}
						empty() { this.children = []; }
						replaceChildren(...children) { this.children = children; }
						querySelectorAll() { return this.children.flatMap(el => [...(el.tag === "input" ? [el] : []), ...el.querySelectorAll()]); }
					}
					export class Component {
						children = []; cleanup = [];
						addChild(child) { this.children.push(child); return child; }
						removeChild(child) { child.unload(); this.children = this.children.filter(c => c !== child); }
						registerEvent(event) { this.cleanup.push(event); }
						registerDomEvent(el, name, fn) { el.events[name] = fn; }
						unload() { this.onunload?.(); this.children.forEach(c => c.unload()); this.cleanup.forEach(fn => fn()); }
					}
					export class MarkdownRenderChild extends Component { constructor(el) { super(); this.containerEl = el; } }
					export const rendered = [];
					export const MarkdownRenderer = { render: async (_app, text, el, path) => { el.textContent = text; rendered.push({ text, path }); } };
					export const notices = [];
					export class Notice { constructor(message) { notices.push(message); } }
				`,
			}));
		},
	}],
});
const { parseGoalsConfig, resolveGoalsFile, extractGoals, updateGoal, GoalsBlock, Element, notices, rendered } = await import(
	`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

const settings = { defaultSection: "Goals*", weeklyNotesFolder: "Journal/Weekly", monthlyNotesFolder: "Journal/Monthly" };
const contextPath = "Journal/Daily/2026-10-23.md";
const weeklyPath = "Journal/Weekly/2026-W43.md";

function fixture(frontmatter = { date: "2026-10-23", created: "2026-09-01" }) {
	const files = new Map();
	const contents = new Map();
	const listeners = new Map();
	const emitter = prefix => ({
		on(name, callback) {
			const key = prefix + name;
			const handlers = listeners.get(key) ?? new Set();
			handlers.add(callback);
			listeners.set(key, handlers);
			return () => handlers.delete(callback);
		},
	});
	const app = {
		vault: {
			...emitter("vault:"),
			getFileByPath: path => files.get(path) ?? null,
			cachedRead: async file => contents.get(file.path),
			process: async (file, update) => { contents.set(file.path, update(contents.get(file.path))); },
		},
		metadataCache: {
			...emitter("metadata:"),
			getFileCache: () => ({ frontmatter }),
		},
		plugins: { plugins: {} },
	};
	function add(path, content = "") { const file = { path }; files.set(path, file); contents.set(path, content); return file; }
	add(contextPath);
	return { app, files, contents, listeners, add };
}

test("parses weekly/monthly goals options and rejects invalid dates and periods", () => {
	assert.deepEqual(parseGoalsConfig("period: weekly\n# comment\ndate: 2026-10-23 # optional"), {
		period: "weekly", date: "2026-10-23", section: "Goals*",
	});
	assert.equal(parseGoalsConfig("period: monthly\nsection: Objectives").section, "Objectives");
	assert.equal(parseGoalsConfig("period: monthly", "Targets*").section, "Targets*");
	for (const source of ["", "period: day", "period: weekly\ndate: 2026-02-30", "period: weekly\nsection:", "period: weekly\nunknown: true"]) {
		assert.throws(() => parseGoalsConfig(source));
	}
});

test("resolves weekly/monthly sources using date, created, and daily/weekly/monthly filenames", () => {
	for (const [frontmatter, path, period, expected] of [
		[{ date: "2026-10-23", created: "2026-09-01" }, contextPath, "weekly", weeklyPath],
		[{ created: "2026-10-23 09:00" }, contextPath, "monthly", "Journal/Monthly/2026-10.md"],
		[{}, contextPath, "weekly", weeklyPath],
		[{}, "Journal/Weekly/2026-W40.md", "monthly", "Journal/Monthly/2026-09.md"],
		[{}, "Journal/Monthly/2026-10.md", "monthly", "Journal/Monthly/2026-10.md"],
		[{ date: "2021-01-01" }, contextPath, "weekly", "Journal/Weekly/2020-W53.md"],
	]) {
		const f = fixture(frontmatter);
		f.add(path);
		const source = f.add(expected);
		assert.equal(resolveGoalsFile(f.app, path, { period, section: "Goals*" }, settings), source);
	}
	const f = fixture();
	const override = f.add("Journal/Monthly/2025-12.md");
	assert.equal(resolveGoalsFile(f.app, contextPath, { period: "monthly", date: "2025-12-31" }, settings), override);
	assert.throws(() => resolveGoalsFile(f.app, contextPath, { period: "weekly" }, settings), /not found/);
});

test("extracts only tasks from the first matching section, including nested tasks and subheadings", () => {
	const content = [
		"---", "text: Goals", "---", "```md", "## Goals fake", "- [ ] fake", "<!--", "```",
		"## Goals for this week", "[[Monthly#Goals|Monthly goals]]",
		"- [x] Parent ✅ 2026-10-22", "\t- [ ] Child [[Note|alias]]",
		"### Extra", "1. [/] In progress", "Non-task content",
		"~~~", "- [ ] not a task", "~~~",
		"<!--", "- [ ] commented out", "-->",
		"## Review", "- [ ] Outside", "## Goals again", "- [ ] Also outside",
	].join("\n");
	const tasks = extractGoals(content, "Goals*");
	assert.deepEqual(tasks.map(t => [t.line, t.status, t.indent, t.text]), [
		[10, "x", 0, "Parent ✅ 2026-10-22"],
		[11, " ", 4, "Child [[Note|alias]]"],
		[13, "/", 0, "In progress"],
	]);
	assert.equal(extractGoals(content, "goals for this week").length, 3);
	assert.throws(() => extractGoals(content, "Goals"), /section not found/);
	assert.deepEqual(extractGoals("## Goals\nNo tasks\n## Other", "Goals*"), []);
});

test("toggles only the selected source line through Tasks and preserves CRLF and recurrence output", async () => {
	const f = fixture();
	const snapshot = "## Goals\r\n- [ ] Duplicate\r\n- [ ] Duplicate\r\n## Other\r\n";
	const file = f.add(weeklyPath, snapshot);
	const tasks = extractGoals(snapshot, "Goals*");
	f.app.plugins.plugins["obsidian-tasks-plugin"] = {
		get apiV1() {
			return { executeToggleTaskDoneCommand: (line, path) => {
				assert.equal(path, weeklyPath);
				assert.equal(line, "- [ ] Duplicate");
				return "- [ ] Duplicate 🔁 every day\n- [x] Duplicate ✅ 2026-10-23";
			} };
		},
	};
	await updateGoal(f.app, file, snapshot, tasks[1]);
	assert.equal(f.contents.get(weeklyPath),
		"## Goals\r\n- [ ] Duplicate\r\n- [ ] Duplicate 🔁 every day\r\n- [x] Duplicate ✅ 2026-10-23\r\n## Other\r\n");
});

test("rejects stale task writes and API failures without altering notes; supports plain checkboxes without Tasks", async () => {
	const f = fixture();
	const snapshot = "## Goals\n- [ ] Goal\n";
	const file = f.add(weeklyPath, snapshot);
	const task = extractGoals(snapshot, "Goals*")[0];
	f.contents.set(weeklyPath, "# New heading\n" + snapshot);
	await assert.rejects(updateGoal(f.app, file, snapshot, task), /source changed/);
	assert.equal(f.contents.get(weeklyPath), "# New heading\n" + snapshot);
	f.contents.set(weeklyPath, snapshot);
	f.app.plugins.plugins["obsidian-tasks-plugin"] = {};
	await assert.rejects(updateGoal(f.app, file, snapshot, task), /toggle API/);
	assert.equal(f.contents.get(weeklyPath), snapshot);
	delete f.app.plugins.plugins["obsidian-tasks-plugin"];
	await updateGoal(f.app, file, snapshot, task);
	assert.equal(f.contents.get(weeklyPath), "## Goals\n- [x] Goal\n");
	await updateGoal(f.app, file, f.contents.get(weeklyPath), extractGoals(f.contents.get(weeklyPath), "Goals*")[0]);
	assert.equal(f.contents.get(weeklyPath), snapshot);
});

test("renders nested tasks with source link context, writes back, refreshes, and cleans up", async () => {
	const previous = globalThis.document;
	globalThis.document = { createElement: tag => new Element(tag) };
	const f = fixture();
	const snapshot = "## Goals\nIgnored text\n- [x] Completed parent\n\t- [ ] Child [[Note]]\n";
	const file = f.add(weeklyPath, snapshot);
	const el = new Element();
	const block = new GoalsBlock(f.app, settings, "period: weekly", el, { sourcePath: contextPath });
	try {
		rendered.length = 0;
		await block.onload();
		assert.deepEqual(rendered.map(r => r.text), ["Completed parent", "Child [[Note]]"]);
		assert.ok(rendered.every(r => r.path === weeklyPath));
		const parent = el.children[0].children[0].children[0];
		assert.equal(parent.dataset.task, "x");
		assert.equal(parent.children[1].children[0].dataset.task, " ");
		const checkboxes = el.querySelectorAll();
		assert.deepEqual(checkboxes.map(c => c.checked), [true, false]);
		checkboxes[1].events.change();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.equal(f.contents.get(weeklyPath), snapshot.replace("- [ ] Child", "- [x] Child"));
		assert.deepEqual(el.querySelectorAll().map(c => c.checked), [true, true]);
		f.contents.set(file.path, snapshot);
		for (const callback of f.listeners.get("metadata:changed")) callback(file);
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.deepEqual(el.querySelectorAll().map(c => c.checked), [true, false]);
		assert.equal(notices.length, 0);
	} finally {
		block.unload();
		assert.ok([...f.listeners.values()].every(set => set.size === 0));
		if (previous === undefined) delete globalThis.document;
		else globalThis.document = previous;
	}
});
