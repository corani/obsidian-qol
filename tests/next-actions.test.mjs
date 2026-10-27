import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
	entryPoints: ["src/next-actions/model.ts"],
	bundle: true,
	write: false,
	format: "esm",
	platform: "node",
	plugins: [{
		name: "mock-obsidian",
		setup(build) {
			build.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "mock" }));
			build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
				contents: "export const parseYaml = JSON.parse;",
			}));
		},
	}],
});
const { parseNextActionsConfig, matchesFilter, resolveNextActionFiles, nextActionTitle, extractNextActions } = await import(
	`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

test("validates typed property filters and rejects nested operators and malformed configuration", () => {
	assert.deepEqual(parseNextActionsConfig(JSON.stringify({
		folder: "Brain/", filter: { type: "project", state: "in progress", private: false, tags: ["goal/*"], count: 0 },
	})), { folder: "Brain", section: "Next Action", filter: { type: "project", state: "in progress", private: false, tags: ["goal/*"], count: 0 } });
	assert.deepEqual(parseNextActionsConfig('{"folder":"Brain"}'), { folder: "Brain", section: "Next Action", filter: {} });
	for (const value of [
		null, [], {}, { folder: "../Brain" }, { folder: "/Brain" }, { folder: "Brain", unknown: true },
		{ folder: "Brain", filter: [] }, { folder: "Brain", filter: { private: { not: true } } },
		{ folder: "Brain", filter: { tags: ["goal/*", {}] } }, { folder: "Brain", filter: { tags: null } },
		{ folder: "Brain", section: "" }, { folder: "Brain", section: "  " },
		{ folder: "Brain", section: null }, { folder: "Brain", section: 42 },
	]) {
		assert.throws(() => parseNextActionsConfig(JSON.stringify(value)));
	}
});

test("ANDs exact typed filters and uses datatype defaults only for missing or null properties", () => {
	const filter = { type: "project", state: "in progress", private: false, priority: 0, owner: "" };
	assert.equal(matchesFilter({ type: "project", state: "in progress" }, filter), true);
	assert.equal(matchesFilter({ type: "project", state: "in progress", private: null, priority: null }, filter), true);
	assert.equal(matchesFilter({ type: "project", state: "in progress", private: true }, filter), false);
	assert.equal(matchesFilter({ type: "project", state: "in progress", private: "false" }, filter), false);
	assert.equal(matchesFilter({ type: "project", state: "in progress", priority: "0" }, filter), false);
	assert.equal(matchesFilter({ type: "project", state: "done" }, filter), false);
	assert.equal(matchesFilter(Object.create({ private: true }), { private: false }), true);
});

test("matches any array element against any filter pattern with generic prefixes and tag normalization", () => {
	assert.equal(matchesFilter({ tags: ["other", "#goal/2026"] }, { tags: ["goal/*"] }), true);
	assert.equal(matchesFilter({ tags: ["goal/2026"] }, { tags: ["#goal/*"] }), true);
	assert.equal(matchesFilter({ tags: ["project", "work"] }, { tags: ["goal/*", "work"] }), true);
	assert.equal(matchesFilter({ owner: "Team A" }, { owner: "Team*" }), true);
	assert.equal(matchesFilter({ ratings: [2, 4] }, { ratings: [4] }), true);
	assert.equal(matchesFilter({ ratings: ["4"] }, { ratings: [4] }), false);
	for (const properties of [{}, { tags: null }, { tags: [] }, { tags: "goal/2026" }, { tags: ["goals/2026"] }]) {
		assert.equal(matchesFilter(properties, { tags: ["goal/*"] }), false);
	}
	assert.equal(matchesFilter({ tags: ["goal/2026"] }, { tags: "goal/*" }), false);
});

test("resolves matching notes in the folder and subfolders, sorts by filename, and uses first aliases", () => {
	const note = (path, frontmatter) => ({ path, name: path.split("/").pop(), basename: path.split("/").pop().slice(0, -3), frontmatter });
	const notes = [
		note("Brain/Z.md", { type: "project", aliases: ["Friendly title"] }),
		note("Brain/Sub/A.md", { type: "project", aliases: "Another title" }),
		note("Brain/B.md", { type: "project" }),
		note("Brain/C.md", { type: "project", private: true }),
		note("Brainstorm/A.md", { type: "project" }),
		note("Elsewhere/A.md", { type: "project" }),
	];
	const app = { vault: { getMarkdownFiles: () => notes }, metadataCache: { getFileCache: file => ({ frontmatter: file.frontmatter }) } };
	const files = resolveNextActionFiles(app, { folder: "Brain", filter: { type: "project", private: false } });
	assert.deepEqual(files.map(f => f.path), ["Brain/Sub/A.md", "Brain/B.md", "Brain/Z.md"]);
	assert.deepEqual(files.map(f => nextActionTitle(app, f)), ["Another title", "B", "Friendly title"]);
});

test("keeps unchecked actions with source identities and promotes children whose completed ancestors are hidden", () => {
	const content = [
		"## Next Actions", "- [ ] Open parent", "\t- [x] Hidden intermediate", "\t\t- [ ] Open grandchild",
		"- [x] Completed parent", "\t- [ ] Promoted child", "\t\t- [ ] Nested child",
		"- [/] In progress", "```md", "- [ ] Example", "```", "## Other", "- [ ] Outside",
	].join("\n");
	assert.deepEqual(extractNextActions(content).map(t => [t.line, t.text, t.indent, t.raw]), [
		[1, "Open parent", 0, "- [ ] Open parent"],
		[3, "Open grandchild", 1, "\t\t- [ ] Open grandchild"],
		[5, "Promoted child", 0, "\t- [ ] Promoted child"],
		[6, "Nested child", 1, "\t\t- [ ] Nested child"],
	]);
	assert.deepEqual(extractNextActions("## Other\n- [ ] Not a next action"), []);
});

test("extracts a configured section instead of Next Action while retaining case-insensitive prefix matching", () => {
	const config = parseNextActionsConfig('{"folder":"Brain","section":"  Follow Up  "}');
	assert.equal(config.section, "Follow Up");
	const content = "## Next Action\n- [ ] Ignore\n## FOLLOW UP this week\n- [ ] Include\n## Other\n- [ ] Ignore too";
	assert.deepEqual(extractNextActions(content, config.section).map(t => [t.line, t.text]), [[3, "Include"]]);
	assert.deepEqual(extractNextActions(content, "Missing"), []);
});
