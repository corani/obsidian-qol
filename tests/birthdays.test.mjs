import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
	entryPoints: ["src/birthdays/renderer.ts"],
	bundle: true,
	write: false,
	format: "esm",
	platform: "node",
	plugins: [{
		name: "mock-obsidian",
		setup(build) {
			build.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "mock" }));
			build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
				contents: "export class MarkdownRenderChild { constructor(el) { this.containerEl = el; } }",
			}));
		},
	}],
});
const { BirthdaysBlock } = await import(
	`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

class Element {
	children = [];
	classes = new Set();
	attributes = new Map();
	createEl(tag, options = {}) {
		const el = new Element();
		el.tag = tag;
		el.text = options.text;
		if (options.cls) el.addClass(options.cls);
		this.children.push(el);
		return el;
	}
	addClass(name) { this.classes.add(name); }
	setAttribute(key, value) { this.attributes.set(key, value); }
}

test("marks known and unknown death dates as deceased while retaining links and normal living rows", () => {
	const block = new BirthdaysBlock({}, {}, "", new Element(), {});
	const tbody = new Element();
	const base = {
		file: { path: "People/Person.md", basename: "Person" },
		born: new Date("1960-10-26"),
		died: null,
		diedUnknown: false,
	};
	for (const person of [
		{ ...base, died: new Date("2020-01-01") },
		{ ...base, diedUnknown: true },
		base,
	]) {
		block.renderRow(tbody, person, new Date("2026-10-26"), true);
	}
	assert.deepEqual(tbody.children.map(row => row.classes.has("birthdays-deceased")), [true, true, false]);
	assert.deepEqual(tbody.children.map(row => row.children[2].text), ["2020-01-01", "?", ""]);
	for (const row of tbody.children) {
		const link = row.children[0].children[0];
		assert.equal(link.classes.has("internal-link"), true);
		assert.equal(link.attributes.get("data-href"), base.file.path);
	}
});
