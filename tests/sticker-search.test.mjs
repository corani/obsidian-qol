import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
	entryPoints: ["src/stickers/search.ts", "src/stickers/model.ts"],
	bundle: true,
	write: false,
	format: "esm",
	platform: "node",
	outdir: "out",
});
const load = file => import(`data:text/javascript;base64,${Buffer.from(file.text).toString("base64")}`);
const { emojiOptions, searchStickers, stickerOption } = await load(outputFiles.find(file => file.path.endsWith("/search.js")));
const { parseSticker } = await load(outputFiles.find(file => file.path.endsWith("/model.js")));

test("finds emoji by partial names, keywords, hex codes and pasted characters", () => {
	for (const query of ["scissor", "scissors", "cutting", "2702", "2702-fe0f", "✂️"]) {
		assert.ok(searchStickers(emojiOptions, query).some(option => parseSticker(option.value).value === "✂️"), query);
	}
	for (const query of ["book", "open book", "reading", "1F4D6", "emoji//1f4d6", "📖"]) {
		assert.ok(searchStickers(emojiOptions, query).some(option => option.value === "1f4d6"), query);
	}
});

test("narrows multiword searches and ranks names ahead of incidental keyword matches", () => {
	assert.equal(searchStickers(emojiOptions, "  OPEN   BOOK  ")[0].value, "1f4d6");
	assert.equal(searchStickers(emojiOptions, "scissors")[0].label, "scissors");
	assert.ok(searchStickers(emojiOptions, "blue book").some(option => option.value === "1f4d8"));
	assert.deepEqual(searchStickers(emojiOptions, "scissors book"), []);
	assert.deepEqual(searchStickers(emojiOptions, "no-such-emoji"), []);
});

test("includes usable skin-tone variants, flags and joined sequences", () => {
	for (const query of ["waving hand dark", "flag germany", "woman technologist"]) {
		assert.ok(searchStickers(emojiOptions, query).length > 0, query);
	}
	for (const option of emojiOptions) {
		assert.equal(parseSticker(option.value)?.kind, "emoji", option.label);
	}
});

test("keeps Lucide search and bounds the rendered result count", () => {
	const options = [...emojiOptions, stickerOption("lucide//scissors", "lucide-scissors")];
	assert.ok(searchStickers(options, "scissor").some(option => option.value === "lucide//scissors"));
	assert.equal(searchStickers(options, "lucide//scissors")[0].value, "lucide//scissors");
	assert.equal(searchStickers(options, "").length, 80);
	assert.ok(searchStickers(options, "face").length <= 80);
});
