import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
	entryPoints: ["src/links/renderer.ts"],
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
					export class Component {
						cleanup = [];
						register(fn) { this.cleanup.push(fn); }
						unload() { this.cleanup.forEach(fn => fn()); }
					}
					export const MarkdownRenderer = { render: async () => {} };
				`,
			}));
		},
	}],
});
const { alignEditorFooter, updateView, removeFromView } = await import(
	`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

const baseStyle = { direction: "ltr", borderLeftWidth: "0px", borderRightWidth: "0px", paddingLeft: "0px", paddingRight: "0px" };
function box(left, width, style = {}) {
	return { rect: { left, right: left + width, width }, computed: { ...baseStyle, ...style }, getBoundingClientRect() { return this.rect; } };
}

test("aligns the footer to the text column, excluding mobile gutters, padding, and borders", () => {
	const previous = globalThis.getComputedStyle;
	globalThis.getComputedStyle = el => el.computed;
	try {
		const footer = { style: {} };
		const container = box(10, 400, { paddingLeft: "10px", borderLeftWidth: "2px" });
		const content = box(60, 320, { paddingLeft: "12px", paddingRight: "8px", borderLeftWidth: "1px", borderRightWidth: "1px" });
		alignEditorFooter(footer, content, container);
		assert.deepEqual(footer.style, { marginInlineStart: "51px", width: "298px" });
		alignEditorFooter(footer, box(22, 300), container);
		assert.deepEqual(footer.style, { marginInlineStart: "0px", width: "300px" });
		alignEditorFooter(footer, box(0, 0), container);
		assert.deepEqual(footer.style, { marginInlineStart: "0px", width: "300px" });
	} finally {
		globalThis.getComputedStyle = previous;
	}
});

test("uses the logical start edge for right-to-left editor content", () => {
	const previous = globalThis.getComputedStyle;
	globalThis.getComputedStyle = el => el.computed;
	try {
		const footer = { style: {} };
		alignEditorFooter(footer, box(10, 300, { direction: "rtl", paddingRight: "10px" }),
			box(0, 400, { direction: "rtl", paddingRight: "20px" }));
		assert.deepEqual(footer.style, { marginInlineStart: "80px", width: "290px" });
	} finally {
		globalThis.getComputedStyle = previous;
	}
});

test("tracks layout changes without duplicate observers and disconnects on removal and view unload", async () => {
	const saved = new Map(["getComputedStyle", "requestAnimationFrame", "ResizeObserver", "document"].map(key => [key, globalThis[key]]));
	const observers = [];
	const footers = [];
	class Footer {
		style = {};
		attributes = new Map();
		setAttribute(key, value) { this.attributes.set(key, value); }
		getAttribute(key) { return this.attributes.get(key); }
		querySelectorAll() { return []; }
		remove() { const index = footers.indexOf(this); if (index >= 0) footers.splice(index, 1); }
	}
	const content = box(80, 320);
	const container = {
		...box(0, 400),
		offsetParent: {},
		matches: selector => selector === ".cm-sizer",
		querySelector: selector => selector === ".cm-content" ? content : footers[0],
		appendChild: footer => footers.push(footer),
	};
	const view = {
		file: { path: "Note.md" },
		children: [],
		addChild(child) { this.children.push(child); return child; },
		removeChild(child) { child.unload(); this.children = this.children.filter(c => c !== child); },
		contentEl: {
			querySelectorAll: selector => selector === ".links-footer" ? [...footers] : [],
			querySelector: () => container,
		},
	};
	const app = {
		vault: { getFileByPath: path => ({ path, basename: "Source" }) },
		metadataCache: { resolvedLinks: { "Source.md": { "Note.md": 1 } }, getFileCache: () => ({}) },
	};
	globalThis.getComputedStyle = el => el.computed;
	globalThis.requestAnimationFrame = callback => callback();
	globalThis.document = { createElement: () => new Footer() };
	globalThis.ResizeObserver = class {
		observed = [];
		constructor(callback) { this.callback = callback; observers.push(this); }
		observe(el) { this.observed.push(el); }
		disconnect() { this.disconnected = true; }
	};
	try {
		const settings = { sectionTitle: "Links", limit: 0 };
		await updateView(app, view, settings, {});
		assert.deepEqual(footers[0].style, { marginInlineStart: "80px", width: "320px" });
		assert.deepEqual(observers[0].observed, [content, container]);
		await updateView(app, view, settings, {});
		assert.equal(observers.length, 1);
		content.rect = { left: 40, right: 400, width: 360 };
		observers[0].callback();
		assert.deepEqual(footers[0].style, { marginInlineStart: "40px", width: "360px" });
		removeFromView(view);
		assert.equal(observers[0].disconnected, true);
		assert.equal(footers.length, 0);
		assert.equal(view.children.length, 0);
		await updateView(app, view, settings, {});
		view.children.forEach(child => child.unload());
		assert.equal(observers[1].disconnected, true);
	} finally {
		for (const [key, value] of saved) {
			if (value === undefined) delete globalThis[key];
			else globalThis[key] = value;
		}
	}
});
