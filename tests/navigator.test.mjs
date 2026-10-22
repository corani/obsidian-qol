import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
	stdin: {
		contents: 'export { NavigatorView } from "./src/navigator/view"; export { TFile, TFolder } from "obsidian";',
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
					export class ItemView {
						constructor(leaf) {
							this.app = leaf.app;
							this.containerEl = new HTMLElement();
							this.contentEl = this.containerEl.createDiv();
						}
						async open(parent) {
							parent.appendChild(this.containerEl);
							await this.onOpen();
						}
					}
					export class TFile {
						constructor(path) { this.path = path; this.name = path.split("/").at(-1); this.basename = this.name.replace(/\\.md$/, ""); this.extension = "md"; }
					}
					export class TFolder {
						constructor(path, children = []) { this.path = path; this.name = path; this.children = children; }
					}
					export class Menu {}
					export class Notice {}
					export const setIcon = () => {};
				`,
			}));
		},
	}],
});
const { NavigatorView, TFile, TFolder } = await import(
	`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

class Element {
	children = [];
	dataset = {};
	events = {};
	ownerDocument = { activeElement: null };
	scrollTop = 0;
	offsetHeight = 28;
	classes = new Set();
	classList = {
		add: (...names) => names.forEach(name => this.classes.add(name)),
		remove: (...names) => names.forEach(name => this.classes.delete(name)),
		contains: name => this.classes.has(name),
	};
	constructor(options = {}) { this.textContent = options.text; this.className = options.cls; }
	appendChild(child) { this.children.push(child); }
	createDiv(options) { return this.createEl("div", options); }
	createSpan(options) { return this.createEl("span", options); }
	createEl(_tag, options) { const child = new Element(options); this.appendChild(child); return child; }
	addClass(name) { this.className = name; }
	empty() { this.children = []; }
	setAttribute() {}
	addEventListener(name, callback) { this.events[name] = callback; }
	getBoundingClientRect() { return { top: 0 }; }
}

function fixture(order = []) {
	const folderNote = new TFile("Brain/Brain.md");
	const note = new TFile("Loose.md");
	const folder = new TFolder("Brain");
	const root = new TFolder("/", [note, folder]);
	for (const file of root.children) file.parent = root;
	const opened = [];
	const saved = [];
	const edited = [];
	const app = {
		vault: {
			getRoot: () => root,
			getAbstractFileByPath: path => root.children.find(file => file.path === path),
		},
		workspace: { getLeaf: () => ({ openFile: async file => { opened.push(file.path); } }) },
	};
	const plugin = {
		settings: { navigator: { hiddenPaths: [], expanded: [] } },
		stickers: {
			folderNote: file => file === folder ? folderNote : null,
			navigationOrder: () => order,
			rawSticker: () => null,
			createSticker: (_document, path, _raw, cls) => {
				const icon = new Element({ cls });
				icon.addEventListener("click", event => {
					event.stopImmediatePropagation();
					edited.push(path);
				});
				return icon;
			},
			saveNavigationOrder: async (parent, entries) => { saved.push({ parent: parent.path, names: entries.map(file => file.name) }); },
			scheduleRefresh() {},
		},
	};
	return { view: new NavigatorView({ app }, plugin), opened, saved, edited, root };
}

test("loads Navigator through the host lifecycle, follows mixed parent order and opens notes", async () => {
	globalThis.HTMLElement = Element;
	try {
		const { view, opened } = fixture(["Loose.md", "Brain"]);
		const parent = new Element();
		await view.open(parent);
		assert.equal(parent.children[0], view.containerEl);
		const tree = view.contentEl.children[1];
		assert.equal(tree.children.length, 2);
		const folderRow = tree.children[1].children[0];
		const noteRow = tree.children[0].children[0];
		assert.equal(noteRow.dataset.qolPath, "Loose.md");
		folderRow.events.click({ ctrlKey: false, metaKey: false });
		noteRow.events.click({ ctrlKey: false, metaKey: false });
		assert.deepEqual(opened, ["Brain/Brain.md", "Loose.md"]);
	} finally {
		delete globalThis.HTMLElement;
	}
});

test("default note and folder icons set stickers instead of opening their rows", async () => {
	globalThis.HTMLElement = Element;
	try {
		const { view, opened, edited } = fixture();
		await view.open(new Element());
		const tree = view.contentEl.children[1];
		for (const item of tree.children) {
			const row = item.children[0];
			let stopped = false;
			row.children[1].events.click({ stopImmediatePropagation() { stopped = true; } });
			if (!stopped) row.events.click({ ctrlKey: false, metaKey: false });
		}
		assert.deepEqual(edited, ["Brain", "Loose.md"]);
		assert.deepEqual(opened, []);
	} finally {
		delete globalThis.HTMLElement;
	}
});

test("dragging files shows the before/after indicator, defers redraws and saves only the parent order", async () => {
	globalThis.HTMLElement = Element;
	globalThis.Node = Element;
	try {
		const { view, saved } = fixture();
		await view.open(new Element());
		const tree = view.contentEl.children[1];
		const folderRow = tree.children[0].children[0];
		const noteRow = tree.children[1].children[0];
		const data = new Map();
		const transfer = {
			types: ["application/x-qol-navigator"],
			setData: (key, value) => data.set(key, value),
			getData: key => data.get(key),
		};
		const event = { dataTransfer: transfer, preventDefault() {}, stopPropagation() {}, clientY: 2 };
		assert.equal(noteRow.draggable, true);
		noteRow.events.dragstart(event);
		view.refresh();
		assert.equal(view.contentEl.children[1], tree);
		folderRow.events.dragover(event);
		assert.equal(folderRow.classList.contains("qol-nav-drop-before"), true);
		folderRow.events.dragover({ ...event, clientY: 25 });
		assert.equal(folderRow.classList.contains("qol-nav-drop-before"), false);
		assert.equal(folderRow.classList.contains("qol-nav-drop-after"), true);
		folderRow.events.dragleave({ relatedTarget: null });
		assert.equal(folderRow.classList.contains("qol-nav-drop-after"), false);
		folderRow.events.dragover(event);
		folderRow.events.drop(event);
		await new Promise(setImmediate);
		assert.deepEqual(saved, [{ parent: "/", names: ["Loose.md", "Brain"] }]);
		assert.equal(folderRow.classList.contains("qol-nav-drop-before"), false);
		assert.notEqual(view.contentEl.children[1], tree);
	} finally {
		delete globalThis.HTMLElement;
		delete globalThis.Node;
	}
});
