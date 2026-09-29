import { App, TFile } from "obsidian";
import { ConfirmModal } from "./modal";

function getDailyNoteSettings(app: App): { folder: string; format: string; template: string } {
	const plugin = (app as any).internalPlugins?.plugins?.["daily-notes"]?.instance;
	return {
		folder:   plugin?.options?.folder   ?? "Journal/Daily",
		format:   plugin?.options?.format   ?? "YYYY-MM-DD",
		template: plugin?.options?.template ?? "",
	};
}

function formatDate(date: Date, format: string): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return format
		.replace("YYYY", String(date.getFullYear()))
		.replace("MM",   pad(date.getMonth() + 1))
		.replace("DD",   pad(date.getDate()));
}

function parseDateStr(dateStr: string): Date {
	const [y, m, d] = dateStr.split("-").map(Number);
	return new Date(y, m - 1, d);
}

// Wait for Templater to finish processing a new file (max 5s timeout).
function waitForTemplater(app: App): Promise<void> {
	return new Promise(resolve => {
		const timer = setTimeout(resolve, 5000);
		const handler = () => { clearTimeout(timer); resolve(); };
		(app.workspace as any).on("templater:all-templates-executed", handler);
		// one-shot: remove listener after first fire
		const orig = handler;
		(app.workspace as any).once?.("templater:all-templates-executed", orig);
		setTimeout(() => (app.workspace as any).off?.("templater:all-templates-executed", orig), 5100);
	});
}

export async function getOrCreateDailyNote(app: App, dateStr: string): Promise<TFile | null> {
	const { folder, format, template } = getDailyNoteSettings(app);
	const date = parseDateStr(dateStr);
	const filename = formatDate(date, format);
	const path = `${folder.replace(/\/$/, "")}/${filename}.md`;

	const existing = app.vault.getFileByPath(path);
	if (existing) return existing;

	return new Promise(resolve => {
		new ConfirmModal(
			app,
			`Daily note "${filename}" does not exist. Create it?`,
			async () => {
				let initialContent = "";
				if (template) {
					const templateFile = app.vault.getFileByPath(
						template.endsWith(".md") ? template : `${template}.md`
					);
					if (templateFile) initialContent = await app.vault.read(templateFile);
				}

				// Register Templater listener before creating so we don't miss the event
				const templaterDone = waitForTemplater(app);
				const file = await app.vault.create(path, initialContent);
				await templaterDone;

				resolve(file);
			},
			() => resolve(null),
		).open();
	});
}

// Build the formatted lines for a captured item.
// For checkbox items, first line is `- [char] text[0]` and continuations are indented.
// For plain text (One Line), all textarea lines are joined with a space.
function buildLines(line: string, plainText: boolean): string[] {
	const parts = line.split("\n").map(l => l.trimEnd()).filter(l => l.length > 0);
	if (parts.length === 0) return [line];
	if (plainText) return [parts.join(" ")];
	const [first, ...rest] = parts;
	return [first, ...rest.map(l => `  ${l}`)];
}

export async function appendToSection(
	app: App,
	file: TFile,
	sectionName: string,
	line: string,
	plainText = false,
): Promise<void> {
	const content = await app.vault.read(file);
	const lines = content.split("\n");

	// Find section heading (## SectionName, case-insensitive)
	const headingRe = new RegExp(`^##\\s+${sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
	let headingIdx = lines.findIndex(l => headingRe.test(l));

	if (headingIdx === -1) {
		// Section doesn't exist -- insert before ## Stats if present, else at end
		const statsIdx = lines.findIndex(l => /^##\s+Stats\s*$/i.test(l));
		const insertAt = statsIdx !== -1 ? statsIdx : lines.length;
		const newLines = buildLines(line, plainText);
		lines.splice(insertAt, 0, `## ${sectionName}`, "", ...newLines, "");
		await app.vault.modify(file, lines.join("\n"));
		return;
	}

	// Find section end: next heading at the SAME level (##) or higher (#), not deeper (###+).
	// Sub-sections (###, ####, etc.) are part of this section and must not be treated as the end.
	let sectionEnd = lines.length;
	for (let i = headingIdx + 1; i < lines.length; i++) {
		if (/^#{1,2}\s/.test(lines[i])) { sectionEnd = i; break; }
	}

	// Find the direct list block: the region between the heading and the first sub-heading
	// (or section end). This is the only area we touch; sub-sections are left untouched.
	let directEnd = sectionEnd;
	for (let i = headingIdx + 1; i < sectionEnd; i++) {
		if (/^#{3,}\s/.test(lines[i])) { directEnd = i; break; }
	}

	// Find the insertion anchor in the direct block.
	// For checkbox lists: last top-level bullet (`- `) including all its sub-items.
	// For plain text (One Line): last non-blank content line.
	let listEnd = -1;
	if (plainText) {
		for (let i = headingIdx + 1; i < directEnd; i++) {
			if (lines[i].trim() !== "") listEnd = i;
		}
	} else {
		for (let i = headingIdx + 1; i < directEnd; i++) {
			if (lines[i].startsWith("- ")) {
				// Advance past continuation/sub-item lines belonging to this bullet
				let j = i + 1;
				while (j < directEnd && lines[j].length > 0 && !lines[j].startsWith("- ") && !/^#{1,}\s/.test(lines[j])) {
					j++;
				}
				listEnd = j - 1;
				i = j - 1;
			}
		}
	}

	const newLines = buildLines(line, plainText);

	if (listEnd !== -1) {
		lines.splice(listEnd + 1, 0, ...newLines);
	} else {
		lines.splice(headingIdx + 1, 0, "", ...newLines, "");
	}

	// Re-scan directEnd after the splice (indices shifted).
	let directEndAfter = lines.length;
	for (let i = headingIdx + 1; i < lines.length; i++) {
		if (/^#{1,2}\s/.test(lines[i])) { directEndAfter = i; break; }
	}
	for (let i = headingIdx + 1; i < directEndAfter; i++) {
		if (/^#{3,}\s/.test(lines[i])) { directEndAfter = i; break; }
	}

	// Normalize blank lines in the direct block [headingIdx+1, directEndAfter) only.
	// Exactly one blank line after the heading, exactly one before directEndAfter,
	// no consecutive blank lines inside. Everything outside this range is untouched.
	const before = lines.slice(0, headingIdx + 1);
	const region = lines.slice(headingIdx + 1, directEndAfter);
	const after  = lines.slice(directEndAfter);

	let start = 0, end = region.length - 1;
	while (start <= end && region[start].trim() === "") start++;
	while (end >= start && region[end].trim() === "") end--;
	const core = region.slice(start, end + 1);

	const collapsed: string[] = [];
	let prevBlank = false;
	for (const l of core) {
		const blank = l.trim() === "";
		if (blank && prevBlank) continue;
		collapsed.push(l);
		prevBlank = blank;
	}

	const normalized = collapsed.length > 0 ? ["", ...collapsed, ""] : [];
	await app.vault.modify(file, [...before, ...normalized, ...after].join("\n"));
}
