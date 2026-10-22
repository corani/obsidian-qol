import type { App, TFile } from "obsidian";

export type Sticker = { kind: "emoji" | "icon"; value: string };

export function parseSticker(value: unknown): Sticker | null {
	if (typeof value !== "string" || !value.trim()) return null;
	const text = value.trim();
	if (text.startsWith("lucide//")) {
		const name = text.slice(8).replace(/^lucide-/, "");
		return /^[a-z0-9-]+$/.test(name) ? { kind: "icon", value: name } : null;
	}
	const hex = text.replace(/^emoji\/\//, "");
	if (/^[0-9a-f]{2,6}(-[0-9a-f]{2,6})*$/i.test(hex)) {
		const points = hex.split("-").map(part => parseInt(part, 16));
		if (points.some(point => point > 0x10ffff || point < 0x20 || (point >= 0xd800 && point <= 0xdfff))) return null;
		return { kind: "emoji", value: String.fromCodePoint(...points) };
	}
	if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\ufe0f?\u20e3/u.test(text)
		&& !/[\p{Letter}\p{Control}]/u.test(text)) {
		return { kind: "emoji", value: text };
	}
	return null;
}

export function wikiTarget(text: string): string {
	return text.split(/\\?\|/, 1)[0].trim();
}

export function resolveNoteLink(app: App, text: string, source: string): TFile | null {
	const path = wikiTarget(text).split("#", 1)[0];
	return path ? app.metadataCache.getFirstLinkpathDest(path, source) : app.vault.getFileByPath(source);
}

export function externalLinkIcon(target: string): string | null {
	if (/^(?:https?:\/\/|\/\/|www\.)/i.test(target)) return "globe";
	if (/^mailto:/i.test(target)) return "mail";
	if (/^tel:/i.test(target)) return "phone";
	if (/^(?:file|smb|afp|nfs):/i.test(target)) {
		const path = target.split(/[?#]/, 1)[0];
		if (/[/\\]$/.test(path)) return "folder";
		const extension = path.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
		if (extension === "pdf") return "file-text";
		if (extension && ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "heic"].includes(extension)) return "image";
		if (extension && ["mp3", "wav", "ogg", "flac", "m4a"].includes(extension)) return "music";
		if (extension && ["mp4", "mkv", "mov", "webm", "avi"].includes(extension)) return "video";
		if (extension && ["zip", "gz", "tar", "7z", "rar"].includes(extension)) return "archive";
		return "file";
	}
	return /^[a-z][a-z0-9+.-]*:/i.test(target) ? "external-link" : null;
}

export interface LinkToken {
	from: number;
	target: string;
	icon: string | null;
}

export function findLinks(line: string): LinkToken[] {
	const links: LinkToken[] = [];
	const pattern = /(!)?\[\[([^\]\n]+)\]\]|(!)?\[[^\]\n]*\]\((<[^>\n]+>|(?:\\.|[^()\s])+)(?:\s+"[^"\n]*")?\)|<((?:[a-z][a-z0-9+.-]*:\/\/|mailto:)[^>\s]+)>|((?:https?:\/\/|file:\/\/|mailto:|www\.)[^\s<>\[\]]+)/gi;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(line))) {
		const preceding = line.slice(0, match.index).match(/\\+$/)?.[0].length ?? 0;
		if (match[1] || match[3] || preceding % 2) continue;
		let target = match[2] ?? match[4]?.replace(/^<|>$/g, "") ?? match[5] ?? match[6];
		if (match[6]) {
			target = target.replace(/[.,;:!?]+$/, "");
			while (target.endsWith(")") && (target.match(/\)/g)?.length ?? 0) > (target.match(/\(/g)?.length ?? 0)) {
				target = target.slice(0, -1);
			}
		}
		const icon = match[2] ? null : externalLinkIcon(target);
		if (match[4] && !icon) {
			try { target = decodeURIComponent(target); }
			catch (error) {
				if (error instanceof URIError) continue;
				throw error;
			}
		}
		links.push({ from: match.index, target, icon });
	}
	return links;
}

export function folderNotePath(folder: string): string {
	const path = folder.replace(/^\/|\/$/g, "");
	return path ? `${path}/${path.slice(path.lastIndexOf("/") + 1)}.md` : "Vault.md";
}

export function parseNavigationOrder(value: unknown): string[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value) || value.some(name => typeof name !== "string" || !name
		|| /[/\\]/.test(name) || name === "." || name === "..")) {
		throw new Error("qol-nav-sort must be a list of child names, such as Brain or Tasks.md.");
	}
	return [...new Set<string>(value)];
}

export function orderEntries<T extends { name: string }>(items: T[], order: string[]): T[] {
	const positions = new Map(order.map((name, index) => [name, index]));
	return [...items].sort((a, b) => {
		const rankA = positions.get(a.name) ?? Infinity;
		const rankB = positions.get(b.name) ?? Infinity;
		return (rankA - rankB) || a.name.localeCompare(b.name, undefined, { numeric: true });
	});
}

export function mergeNavigationOrder(saved: string[], visible: string[]): string[] {
	const names = new Set(visible);
	let index = 0;
	const merged = saved.map(name => names.has(name) ? visible[index++] : name);
	return [...merged, ...visible.slice(index)];
}

export function reorderPaths(paths: string[], source: string, target: string, after: boolean): string[] {
	if (source === target || !paths.includes(source) || !paths.includes(target)) return paths;
	const next = paths.filter(path => path !== source);
	next.splice(next.indexOf(target) + (after ? 1 : 0), 0, source);
	return next.every((path, index) => path === paths[index]) ? paths : next;
}

export function renamePath(path: string, oldPath: string, newPath: string): string {
	return path === oldPath ? newPath
		: path.startsWith(`${oldPath}/`) ? newPath + path.slice(oldPath.length) : path;
}
