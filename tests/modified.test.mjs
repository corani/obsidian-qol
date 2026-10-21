import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
	entryPoints: ["src/modified/resolver.ts"],
	bundle: true,
	write: false,
	format: "esm",
	platform: "node",
});
const { resolveAnchorDate, resolveFiles } = await import(
	`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

const contextPath = "Journal/Daily/2026-10-21.md";
const config = { period: "day" };
const settings = { defaultLimit: null };

function mockApp(frontmatter, notes = []) {
	const context = { path: contextPath };
	return {
		vault: {
			getFileByPath: path => path === contextPath ? context : null,
			getMarkdownFiles: () => notes,
		},
		metadataCache: {
			getFileCache: file => ({
				frontmatter: file === context ? frontmatter : file.frontmatter,
			}),
		},
	};
}

test("uses the subject date instead of stale creation frontmatter", () => {
	const app = mockApp({ date: "2026-10-21", created: "2026-09-24 09:35" });
	assert.equal(
		resolveAnchorDate(app, contextPath, config).getTime(),
		new Date(2026, 9, 21).getTime(),
	);
});

test("falls back to creation frontmatter when the subject date is missing or invalid", () => {
	for (const date of [undefined, "not a date"]) {
		const app = mockApp({ date, created: "2026-09-24 09:35" });
		assert.equal(
			resolveAnchorDate(app, contextPath, config).getTime(),
			new Date(2026, 8, 24, 9, 35).getTime(),
		);
	}
});

test("keeps explicit block dates ahead of subject dates", () => {
	const app = mockApp({ date: "2026-10-21", created: "2026-09-24 09:35" });
	assert.equal(
		resolveAnchorDate(app, contextPath, { ...config, date: "2026-10-20" }).getTime(),
		new Date(2026, 9, 20).getTime(),
	);
});

test("falls back to the filename when neither frontmatter date is usable", () => {
	const app = mockApp({ date: "invalid", created: "invalid" });
	assert.equal(
		resolveAnchorDate(app, contextPath, config).getTime(),
		new Date(2026, 9, 21).getTime(),
	);
});

test("both lists use the subject period, not the context note's creation period", () => {
	const note = (path, created, updated) => ({
		path,
		basename: path.replace(/\.md$/, ""),
		frontmatter: { created, updated },
		stat: { ctime: 0, mtime: 0 },
	});
	const created = note("New.md", "2026-10-21 10:00", "2026-10-21 11:00");
	const modified = note("Edited.md", "2026-09-24 10:00", "2026-10-21 12:00");
	const old = note("Old.md", "2026-09-24 10:00", "2026-09-24 12:00");
	const app = mockApp(
		{ date: "2026-10-21", created: "2026-09-24 09:35" },
		[old, modified, created],
	);

	for (const period of ["day", "week", "month"]) {
		const result = resolveFiles(app, settings, contextPath, { period });
		assert.deepEqual(result.created.map(entry => entry.file.path), ["New.md"]);
		assert.deepEqual(result.modified.map(entry => entry.file.path), ["Edited.md"]);
		assert.equal(result.createdTotal, 1);
		assert.equal(result.modifiedTotal, 1);
	}
});
