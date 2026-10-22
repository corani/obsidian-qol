import esbuild from "esbuild";
import builtins from "builtin-modules";
import { copyFileSync, mkdirSync, readFileSync } from "fs";

const prod = process.argv[2] === "production";
const outdir = "dist";

mkdirSync(outdir, { recursive: true });
copyFileSync("manifest.json", `${outdir}/manifest.json`);
copyFileSync("styles.css", `${outdir}/styles.css`);

const ctx = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	banner: { js: `/*! Emoji data: emojibase-data\n${readFileSync("node_modules/emojibase-data/LICENSE", "utf8")}\n*/` },
	external: ["obsidian", "electron", "@codemirror/*", ...builtins],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: `${outdir}/main.js`,
});

if (prod) {
	await ctx.rebuild();
	ctx.dispose();
} else {
	await ctx.watch();
}
