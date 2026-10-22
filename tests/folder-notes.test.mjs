import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
	stdin: {
		contents: 'export { StickerManager } from "./src/stickers/manager"; export { TFolder } from "obsidian";',
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
			build.onResolve({ filter: /^\.\/editor$/ }, () => ({ path: "editor", namespace: "mock" }));
			build.onLoad({ filter: /^editor$/, namespace: "mock" }, () => ({
				contents: "export const refreshStickers = {}; export const stickerExtension = () => [];",
			}));
			build.onLoad({ filter: /^obsidian$/, namespace: "mock" }, () => ({
				contents: `
					export class Component {}
					export class TFile {}
					export class TFolder { constructor(path) { this.path = path; this.name = path.split("/").at(-1); } }
					export class MarkdownView {}
					export class Menu {}
					export class Notice {}
					export class Modal {}
					export class Setting {}
					export const getIcon = () => null;
					export const getIconIds = () => [];
					export const setIcon = () => {};
				`,
			}));
		},
	}],
});
const { StickerManager, TFolder } = await import(
	`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

function fixture(initialNotes) {
	const notes = new Map(initialNotes.map(([path, frontmatter]) => [path, { path, frontmatter }]));
	const writes = [];
	const app = {
		vault: {
			getFileByPath: path => notes.get(path) ?? null,
			getAbstractFileByPath: path => notes.get(path) ?? null,
			async create(path, body) {
				const note = { path, body, frontmatter: {} };
				notes.set(path, note);
				return note;
			},
		},
		metadataCache: { getFileCache: note => ({ frontmatter: note.frontmatter }) },
		fileManager: {
			async processFrontMatter(note, update) { writes.push(note.path); update(note.frontmatter); },
			async renameFile(note, path) { notes.delete(note.path); note.path = path; notes.set(path, note); },
		},
	};
	return { manager: new StickerManager({ app }), app, notes, writes };
}

test("reordering writes only the parent note and preserves stickers, hidden entries and unrelated properties", async () => {
	const { manager, notes, writes } = fixture([
		["Vault.md", { "qol-nav-sort": ["Hidden", "Brain"], tags: ["moc"], sticker: "1f4dd" }],
		["Brain/Brain.md", { sticker: "emoji//1f9e0", aliases: ["Brain"] }],
	]);
	await manager.saveNavigationOrder(new TFolder("/"),
		[{ name: "Tasks.md" }, new TFolder("Brain"), new TFolder("Books")]);
	assert.deepEqual(writes, ["Vault.md"]);
	assert.deepEqual(notes.get("Vault.md").frontmatter, {
		"qol-nav-sort": ["Hidden", "Tasks.md", "Brain", "Books"], tags: ["moc"], sticker: "1f4dd",
	});
	assert.deepEqual(notes.get("Brain/Brain.md").frontmatter, { sticker: "emoji//1f9e0", aliases: ["Brain"] });
	assert.equal(notes.has("Books/Books.md"), false);
});

test("creates only the parent folder note when an order is saved for the first time", async () => {
	const { manager, notes, writes } = fixture([]);
	await manager.saveNavigationOrder(new TFolder("Journal"), [{ name: "Daily" }, { name: "Weekly" }]);
	assert.deepEqual(writes, ["Journal/Journal.md"]);
	assert.equal(notes.size, 1);
	assert.deepEqual(notes.get("Journal/Journal.md").frontmatter["qol-nav-sort"], ["Daily", "Weekly"]);
	await manager.saveNavigationOrder(new TFolder("/"), [{ name: "Journal" }]);
	assert.equal(notes.get("Vault.md").body, "# Vault\n");
});

test("a failed folder-note write is surfaced rather than treated as a saved order", async () => {
	const { manager, app } = fixture([]);
	app.vault.create = async () => { throw new Error("Read-only folder"); };
	await assert.rejects(manager.saveNavigationOrder(new TFolder("/"), [new TFolder("Brain")]), /Read-only folder/);
});

test("keeps same-name folder notes after folder renames without overwriting existing notes", async () => {
	const { manager, notes } = fixture([["Knowledge/Brain.md", { sticker: "1f4dd", "qol-nav-sort": ["A.md"] }]]);
	await manager.followFolderRename(new TFolder("Knowledge"), "Brain");
	assert.equal(notes.has("Knowledge/Brain.md"), false);
	assert.deepEqual(notes.get("Knowledge/Knowledge.md").frontmatter, { sticker: "1f4dd", "qol-nav-sort": ["A.md"] });
	notes.set("Knowledge/Old.md", { path: "Knowledge/Old.md", frontmatter: {} });
	await assert.rejects(manager.followFolderRename(new TFolder("Knowledge"), "Old"), /already exists/);
	assert.equal(notes.has("Knowledge/Old.md"), true);
});

test("keeps parent-relative order references consistent on rename, move and deletion", async () => {
	const { manager, notes, writes } = fixture([
		["Vault.md", { "qol-nav-sort": ["Brain", "Tasks.md", "Moved"] }],
		["Brain/Brain.md", { "qol-nav-sort": ["Old.md", "Keep.md"] }],
	]);
	await manager.updateNavigationReference("Brain/Old.md", "Brain/New.md");
	assert.deepEqual(notes.get("Brain/Brain.md").frontmatter["qol-nav-sort"], ["New.md", "Keep.md"]);
	await manager.updateNavigationReference("Brain", "Knowledge");
	await manager.updateNavigationReference("Tasks.md");
	await manager.updateNavigationReference("Moved", "Other/Moved");
	assert.deepEqual(notes.get("Vault.md").frontmatter["qol-nav-sort"], ["Knowledge"]);
	const count = writes.length;
	await manager.updateNavigationReference("Unlisted.md", "Renamed.md");
	assert.equal(writes.length, count);
});
