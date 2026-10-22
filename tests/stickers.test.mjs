import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
	entryPoints: ["src/stickers/model.ts"],
	bundle: true,
	write: false,
	format: "esm",
	platform: "node",
});
const { parseSticker, resolveNoteLink, findLinks, externalLinkIcon, folderNotePath, parseNavigationOrder,
	orderEntries, mergeNavigationOrder, reorderPaths, renamePath } = await import(
	`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

test("reads make.md emoji and Lucide formats, including multi-codepoint emoji", () => {
	assert.deepEqual(parseSticker("1f4dd"), { kind: "emoji", value: "📝" });
	assert.deepEqual(parseSticker("emoji//1f9e0"), { kind: "emoji", value: "🧠" });
	assert.deepEqual(parseSticker("1f5d3-fe0f"), { kind: "emoji", value: "🗓️" });
	assert.deepEqual(parseSticker("lucide//library"), { kind: "icon", value: "library" });
	assert.deepEqual(parseSticker("lucide//lucide-book"), { kind: "icon", value: "book" });
	assert.deepEqual(parseSticker("👩‍💻"), { kind: "emoji", value: "👩‍💻" });
	for (const raw of [null, {}, "", "emoji//garbage", "not an icon", "110000", "d800", "00", "lucide//"]) {
		assert.equal(parseSticker(raw), null, String(raw));
	}
});

test("always resolves aliased links through the metadata cache, including headings and table pipes", () => {
	const target = { path: "Brain/202610221122 The Plottery.md" };
	const calls = [];
	const source = "Journal/Daily/2026-10-22.md";
	const app = {
		metadataCache: {
			getFirstLinkpathDest(path, context) {
				calls.push([path, context]);
				return path === "Missing" ? null : target;
			},
		},
		vault: { getFileByPath: path => ({ path }) },
	};
	for (const text of [
		"202610221122 The Plottery",
		"202610221122 The Plottery|The Plottery",
		"202610221122 The Plottery#Heading|The Plottery",
		"202610221122 The Plottery\\|The Plottery",
	]) {
		assert.equal(resolveNoteLink(app, text, source), target);
		assert.deepEqual(calls.at(-1), ["202610221122 The Plottery", source]);
	}
	assert.equal(resolveNoteLink(app, "Missing|Alias", source), null);
	assert.deepEqual(resolveNoteLink(app, "#Heading|Here", source), { path: source });
	resolveNoteLink(app, "../Weekly/2026-W43|This week", source);
	assert.deepEqual(calls.at(-1), ["../Weekly/2026-W43", source]);
});

test("finds internal and external links without decorating embeds or escaped links", () => {
	const line = "[[Note|Alias]] [Name](Folder/Other%20Note.md#Heading) ![[Embed]] "
		+ "[Web](https://example.com) ![Image](photo.png) \\[[Escaped]] [Mail](mailto:a@b.com) [Space](<A B.md>)";
	assert.deepEqual(findLinks(line), [
		{ from: 0, target: "Note|Alias", icon: null },
		{ from: line.indexOf("[Name]"), target: "Folder/Other Note.md#Heading", icon: null },
		{ from: line.indexOf("[Web]"), target: "https://example.com", icon: "globe" },
		{ from: line.indexOf("[Mail]"), target: "mailto:a@b.com", icon: "mail" },
		{ from: line.indexOf("[Space]"), target: "A B.md", icon: null },
	]);
	assert.deepEqual(findLinks("[bad](%FF) [bad](%ZZ)"), []);
	const bare = "https://example.com. <file:///tmp/a.pdf>";
	assert.deepEqual(findLinks(bare), [
		{ from: 0, target: "https://example.com", icon: "globe" },
		{ from: bare.indexOf("<"), target: "file:///tmp/a.pdf", icon: "file-text" },
	]);
});

test("assigns immutable icons by external link type rather than attempting a note lookup", () => {
	for (const [target, icon] of [
		["https://example.com/paper.pdf", "globe"], ["mailto:user@example.com", "mail"],
		["tel:+123456789", "phone"], ["file:///tmp/", "folder"],
		["file:///C:/Docs/Report.PDF#page=2", "file-text"],
		["file:///tmp/photo.png", "image"], ["file:///tmp/audio.flac", "music"],
		["file:///tmp/clip.mp4", "video"], ["smb://server/share/archive.zip", "archive"],
		["file:///tmp/note.txt", "file"], ["obsidian://open?vault=Other", "external-link"],
		["Notes/Example.md", null],
	]) assert.equal(externalLinkIcon(target), icon, target);
});

test("uses same-name folder notes without confusing neighboring folders", () => {
	assert.equal(folderNotePath("Brain"), "Brain/Brain.md");
	assert.equal(folderNotePath("Journal/Daily"), "Journal/Daily/Daily.md");
	assert.equal(folderNotePath("/"), "Vault.md");
	assert.equal(renamePath("Brain/Sub/Note.md", "Brain", "Knowledge"), "Knowledge/Sub/Note.md");
	assert.equal(renamePath("Brainstorm/Note.md", "Brain", "Knowledge"), "Brainstorm/Note.md");
});

test("orders mixed files and folders by parent-relative names, then appends unlisted names alphabetically", () => {
	const items = ["Brain", "Journal", "Tasks.md", "New 10", "New 2", "Books"].map(name => ({ name }));
	assert.deepEqual(orderEntries(items, ["Tasks.md", "Journal", "Missing", "Brain"]).map(item => item.name),
		["Tasks.md", "Journal", "Brain", "Books", "New 2", "New 10"]);
	const paths = items.map(item => item.name);
	assert.deepEqual(reorderPaths(paths, "Tasks.md", "Brain", false), ["Tasks.md", "Brain", "Journal", "New 10", "New 2", "Books"]);
	assert.equal(reorderPaths(paths, "Missing", "Books", false), paths);
	assert.equal(reorderPaths(paths, "Journal", "Brain", true), paths);
	assert.equal(items[0].name, "Brain");
});

test("validates parent lists and preserves hidden or not-yet-created entries on reorder", () => {
	assert.deepEqual(parseNavigationOrder(undefined), []);
	assert.deepEqual(parseNavigationOrder(["Tasks.md", "Brain", "Brain"]), ["Tasks.md", "Brain"]);
	for (const value of ["Brain", [123], ["Parent/Child"], [".."]]) {
		assert.throws(() => parseNavigationOrder(value), /qol-nav-sort must be a list/);
	}
	assert.deepEqual(mergeNavigationOrder(["Brain", "Hidden", "Tasks.md", "Future"],
		["Tasks.md", "Books", "Brain"]), ["Tasks.md", "Hidden", "Books", "Future", "Brain"]);
});
