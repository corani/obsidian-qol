import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
	stdin: {
		contents: 'export { QuickCaptureModal } from "./src/capture/modal"; export { notices } from "obsidian";',
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
					class Element {
						children = [];
						events = {};
						disabled = false;
						constructor(options = {}) { this.textContent = options.text; this.className = options.cls; }
						createDiv(options) { return this.createEl("div", options); }
						createEl(tag, options) { const el = new Element(options); el.tag = tag; this.appendChild(el); return el; }
						appendChild(el) { this.children.push(el); }
						addClass(name) { this.className = name; }
						addEventListener(name, callback, capture) { this.events[name] = { callback, capture }; }
						setText(text) { this.textContent = text; }
						querySelectorAll() { return []; }
						empty() { this.children = []; }
					}
					export class Modal {
						constructor(app) { this.app = app; this.contentEl = new Element(); this.titleEl = new Element(); this.modalEl = new Element(); }
						close() { this.closed = true; this.onClose(); }
					}
					export class MarkdownView {
						file = null;
						saves = 0;
						value = "";
						cleanup = [];
						constructor(leaf) {
							this.leaf = leaf;
							this.app = leaf.app;
							this.containerEl = new Element();
							this.editor = {
								getValue: () => this.value,
								setValue: value => { this.value = value; this.requestSave(); },
								focus: () => { this.focused = true; },
							};
						}
						load() { this.loaded = true; }
						unload() { this.unloaded = true; for (const fn of this.cleanup) fn(); }
						register(fn) { this.cleanup.push(fn); }
						registerDomEvent(el, name, fn) { el.addEventListener(name, fn); }
						async setState(state) { this.state = state; }
						getMode() { return this.state.mode; }
						setViewData(value) { this.value = value; this.initialized = true; }
						async save() { this.saves++; }
					}
					export class Component { load() {} unload() {} }
					export const MarkdownRenderer = { render: async () => {} };
					export const notices = [];
					export class Notice { constructor(message) { notices.push(message); } }
				`,
			}));
		},
	}],
});
const { QuickCaptureModal, notices } = await import(
	`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

async function fixture(submit) {
	const previous = globalThis.activeWindow;
	globalThis.activeWindow = { setTimeout, clearTimeout };
	const previousEditor = { file: { path: "Existing.md" } };
	const app = { workspace: { activeEditor: previousEditor, getMostRecentLeaf: () => leaf } };
	const leaf = { app, view: previousEditor };
	const modal = new QuickCaptureModal(app, {}, submit);
	await modal.onOpen();
	return {
		modal,
		editor: modal.captureEditor,
		app,
		previousEditor,
		close() {
			if (!modal.closed) modal.close();
			if (previous === undefined) delete globalThis.activeWindow;
			else globalThis.activeWindow = previous;
		},
	};
}

test("keeps native Markdown drafts fileless, uses Live Preview, and unloads on cancel", async () => {
	const submitted = [];
	const f = await fixture((...args) => { submitted.push(args); });
	try {
		assert.deepEqual(f.editor.state, { mode: "source", source: false });
		assert.equal(f.editor.initialized, true);
		f.editor.editor.setValue("i **Draft** with [[A note]]");
		await f.editor.save();
		assert.equal(f.editor.saves, 0);
		assert.equal(f.editor.file, null);
		f.modal.close();
		assert.equal(f.editor.unloaded, true);
		assert.deepEqual(submitted, []);
	} finally { f.close(); }
});

test("routes native formatting commands to the draft and restores the previous editor on close", async () => {
	const f = await fixture(async () => {});
	try {
		f.editor.containerEl.events.focusin.callback();
		assert.equal(f.app.workspace.activeEditor.editor, f.editor.editor);
		assert.equal(f.app.workspace.activeEditor.file, null);
		assert.equal(f.app.workspace.activeEditor.getMode(), "source");
		f.modal.close();
		assert.equal(f.app.workspace.activeEditor, f.previousEditor);
	} finally { f.close(); }
});

test("submits Markdown, multiline content, prefixes and the selected date unchanged", async () => {
	for (const [input, storedChar, text] of [
		["t **Task** [[Note|Alias]]\ncontinuation", " ", "**Task** [[Note|Alias]]\ncontinuation"],
		["1 My *one-line* entry", "1", "My *one-line* entry"],
		['q A quotation', '"', "A quotation"],
		["An unprefixed note", "i", "An unprefixed note"],
	]) {
		const submitted = [];
		const f = await fixture(async (...args) => { submitted.push(args); });
		try {
			f.editor.editor.setValue(input);
			f.modal.dateInput.value = "2026-10-21";
			await f.modal.submit();
			assert.deepEqual(submitted, [[storedChar, text, "2026-10-21"]]);
			assert.equal(f.modal.closed, true);
		} finally { f.close(); }
	}
});

test("leaves plain Enter to the editor and suggestions; modifier Enter submits once", async () => {
	let calls = 0;
	let finish;
	const f = await fixture(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
	try {
		f.editor.editor.setValue("i A note");
		const listener = f.modal.contentEl.children[0].events.keydown;
		assert.equal(listener.capture, true);
		let prevented = false;
		const event = { key: "Enter", preventDefault() { prevented = true; }, stopPropagation() {} };
		listener.callback(event);
		assert.equal(prevented, false);
		assert.equal(calls, 0);
		listener.callback({ ...event, ctrlKey: true });
		listener.callback({ ...event, metaKey: true });
		assert.equal(prevented, true);
		assert.equal(calls, 1);
		finish();
		await Promise.resolve();
		assert.equal(f.modal.closed, true);
	} finally { f.close(); }
});

test("retains the draft and reports submission failures", async () => {
	const f = await fixture(async () => { throw new Error("Read-only destination"); });
	const previous = console.error;
	console.error = () => {};
	try {
		f.editor.editor.setValue("i Keep [[this draft]]");
		await f.modal.submit();
		assert.equal(f.modal.closed, undefined);
		assert.equal(f.editor.editor.getValue(), "i Keep [[this draft]]");
		assert.equal(f.modal.addButton.disabled, false);
		assert.match(notices.at(-1), /Could not save capture: Read-only destination/);
	} finally {
		console.error = previous;
		f.close();
	}
});
