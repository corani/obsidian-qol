import esbuild from "esbuild";
import builtins from "builtin-modules";
import { copyFileSync, mkdirSync } from "fs";

const prod = process.argv[2] === "production";
const outdir = "dist";

mkdirSync(outdir, { recursive: true });
copyFileSync("manifest.json", `${outdir}/manifest.json`);
copyFileSync("styles.css", `${outdir}/styles.css`);

const ctx = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: ["obsidian", "electron", ...builtins],
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
