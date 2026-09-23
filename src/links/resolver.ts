import { App, TFile } from "obsidian";

export interface ResolvedLink {
	file: TFile;
	displayTitle: string;
}

function getDisplayTitle(app: App, file: TFile): string {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (fm) {
		if (fm.name && typeof fm.name === "string") return fm.name;
		if (fm.title && typeof fm.title === "string") return fm.title;
		if (fm.aliases) {
			const a = Array.isArray(fm.aliases) ? fm.aliases[0] : fm.aliases;
			if (a && typeof a === "string") return a;
		}
	}
	return file.basename;
}

export function getBacklinks(app: App, file: TFile): ResolvedLink[] {
	const resolvedLinks = app.metadataCache.resolvedLinks;
	const seen = new Set<string>();
	const result: ResolvedLink[] = [];

	for (const sourcePath in resolvedLinks) {
		if (resolvedLinks[sourcePath][file.path] && !seen.has(sourcePath)) {
			seen.add(sourcePath);
			const sourceFile = app.vault.getFileByPath(sourcePath);
			if (sourceFile) {
				result.push({ file: sourceFile, displayTitle: getDisplayTitle(app, sourceFile) });
			}
		}
	}

	result.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
	return result;
}

export function getOutlinks(app: App, file: TFile): ResolvedLink[] {
	const cache = app.metadataCache.getFileCache(file);
	const seen = new Set<string>();
	const result: ResolvedLink[] = [];

	const addLink = (linktext: string) => {
		const target = app.metadataCache.getFirstLinkpathDest(linktext, file.path);
		if (!target || target.path === file.path || seen.has(target.path)) return;
		seen.add(target.path);
		result.push({ file: target, displayTitle: getDisplayTitle(app, target) });
	};

	for (const link of cache?.links ?? []) addLink(link.link);
	for (const embed of cache?.embeds ?? []) addLink(embed.link);
	for (const link of cache?.frontmatterLinks ?? []) addLink(link.link);

	result.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
	return result;
}
