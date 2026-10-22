import { Component, MarkdownView, Menu, Notice, setIcon, TAbstractFile, TFile, TFolder } from "obsidian";
import type { EditorView } from "@codemirror/view";
import type QolPlugin from "../main";
import { externalLinkIcon, folderNotePath, mergeNavigationOrder, parseNavigationOrder, parseSticker, resolveNoteLink } from "./model";
import { paintSticker, StickerPicker } from "./picker";
import { refreshStickers, stickerExtension } from "./editor";

export class StickerManager extends Component {
	readonly editors = new Set<EditorView>();
	private documents = new Set<Document>();
	private timer: ReturnType<typeof setTimeout> | null = null;
	private invalidNavigationOrder = new Set<string>();

	constructor(private plugin: QolPlugin) { super(); }

	get settings() { return this.plugin.settings.stickers; }
	get app() { return this.plugin.app; }

	onload(): void {
		this.plugin.registerEditorExtension(stickerExtension(this));
		this.plugin.registerMarkdownPostProcessor((el, context) => this.decorateReading(el, context.sourcePath));
		this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleRefresh()));
		this.registerEvent(this.app.metadataCache.on("resolved", () => this.scheduleRefresh()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleRefresh()));
		this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleRefresh()));
		this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
			if (this.settings.enabled && (file instanceof TFolder || (file instanceof TFile && file.extension === "md"))) {
				this.addMenu(menu, file);
			}
		}));
		this.plugin.addCommand({
			id: "set-sticker", name: "Set/change note sticker",
			checkCallback: checking => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) this.edit(file);
				return true;
			},
		});
		this.scheduleRefresh();
	}

	folderNote(folder: TFolder): TFile | null {
		return this.app.vault.getFileByPath(folderNotePath(folder.path));
	}

	navigationOrder(folder: TFolder): string[] {
		const note = this.folderNote(folder);
		if (!note) return [];
		try {
			const order = parseNavigationOrder(this.app.metadataCache.getFileCache(note)?.frontmatter?.["qol-nav-sort"]);
			this.invalidNavigationOrder.delete(note.path);
			return order;
		} catch (error) {
			if (!this.invalidNavigationOrder.has(note.path)) {
				this.invalidNavigationOrder.add(note.path);
				this.plugin.reportError(`Invalid Navigator order in ${note.path}; showing alphabetical order`, error);
			}
			return [];
		}
	}

	async saveNavigationOrder(parent: TFolder, entries: TAbstractFile[]): Promise<void> {
		const note = await this.ensureFolderNote(parent);
		await this.app.fileManager.processFrontMatter(note, frontmatter => {
			const saved = parseNavigationOrder(frontmatter["qol-nav-sort"]);
			frontmatter["qol-nav-sort"] = mergeNavigationOrder(saved, entries.map(entry => entry.name));
		});
	}

	async updateNavigationReference(oldPath: string, newPath?: string): Promise<void> {
		const split = oldPath.lastIndexOf("/");
		const parent = oldPath.slice(0, Math.max(0, split));
		const oldName = oldPath.slice(split + 1);
		const note = this.app.vault.getFileByPath(folderNotePath(parent));
		if (!note) return;
		const cached = parseNavigationOrder(this.app.metadataCache.getFileCache(note)?.frontmatter?.["qol-nav-sort"]);
		if (!cached.includes(oldName)) return;
		const newSplit = newPath?.lastIndexOf("/") ?? -1;
		const sameParent = newPath !== undefined && newPath.slice(0, Math.max(0, newSplit)) === parent;
		const newName = sameParent && newPath ? newPath.slice(newSplit + 1) : null;
		await this.app.fileManager.processFrontMatter(note, frontmatter => {
			const saved = parseNavigationOrder(frontmatter["qol-nav-sort"]);
			frontmatter["qol-nav-sort"] = saved.flatMap(name =>
				name !== oldName ? [name] : newName ? [newName] : []);
		});
	}

	async followFolderRename(file: TAbstractFile, oldPath: string): Promise<void> {
		if (!(file instanceof TFolder)) return;
		const oldName = oldPath.slice(oldPath.lastIndexOf("/") + 1);
		if (oldName === file.name) return;
		const note = this.app.vault.getFileByPath(`${file.path}/${oldName}.md`);
		if (!note) return;
		const destination = folderNotePath(file.path);
		if (this.app.vault.getAbstractFileByPath(destination)) {
			throw new Error(`Cannot rename folder note: ${destination} already exists. The original note was left unchanged.`);
		}
		await this.app.fileManager.renameFile(note, destination);
	}

	rawSticker(file: TAbstractFile): string | null {
		const note = file instanceof TFolder ? this.folderNote(file) : file;
		if (!(note instanceof TFile)) return null;
		const raw: unknown = this.app.metadataCache.getFileCache(note)?.frontmatter?.sticker;
		return typeof raw === "string" && parseSticker(raw) ? raw : null;
	}

	resolveLink(text: string, source: string): TFile | null {
		return resolveNoteLink(this.app, text, source);
	}

	async ensureFolderNote(folder: TFolder): Promise<TFile> {
		const existing = this.folderNote(folder);
		if (existing) return existing;
		const path = folderNotePath(folder.path);
		return this.app.vault.create(path, `# ${folder.path === "/" || !folder.path ? "Vault" : folder.name}\n`);
	}

	edit(file: TAbstractFile): void {
		new StickerPicker(this.app, file.name, this.rawSticker(file), async value => {
			const note = file instanceof TFolder
				? value === null ? this.folderNote(file) : await this.ensureFolderNote(file)
				: file;
			if (!note) return;
			if (!(note instanceof TFile) || note.extension !== "md") throw new Error("Stickers require a Markdown note.");
			await this.app.fileManager.processFrontMatter(note, frontmatter => {
				if (value === null) delete frontmatter.sticker;
				else frontmatter.sticker = value;
			});
		}).open();
	}

	addMenu(menu: Menu, file: TAbstractFile): void {
		if (file instanceof TFolder && !folderNotePath(file.path)) return;
		menu.addItem(item => item.setTitle(this.rawSticker(file) ? "Change/remove sticker" : "Set sticker")
			.setIcon("sticker").onClick(() => this.edit(file)));
	}

	createSticker(document: Document, path: string, raw: string | null, cls: string, fallbackIcon = "sticker"): HTMLElement {
		this.documents.add(document);
		const el = document.createElement("span");
		el.className = `qol-sticker ${cls}`;
		el.setAttribute("role", "button");
		el.tabIndex = 0;
		el.setAttribute("aria-label", raw ? "Change sticker" : "Set sticker");
		el.title = raw ? "Change sticker" : "Set sticker";
		if (!paintSticker(el, raw)) setIcon(el, fallbackIcon);
		const open = (event: Event) => {
			event.preventDefault();
			event.stopImmediatePropagation();
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file) this.edit(file);
			else new Notice("This note no longer exists.");
		};
		el.addEventListener("click", open, true);
		el.addEventListener("keydown", event => {
			if (event.key === "Enter" || event.key === " ") open(event);
		});
		el.addEventListener("mousedown", event => event.preventDefault());
		return el;
	}

	createExternalSticker(document: Document, icon: string): HTMLElement {
		this.documents.add(document);
		const el = document.createElement("span");
		el.className = "qol-link-sticker qol-external-sticker";
		el.setAttribute("aria-hidden", "true");
		setIcon(el, icon);
		return el;
	}

	decorateReading(el: HTMLElement, source: string): void {
		this.documents.add(el.ownerDocument);
		el.querySelectorAll<HTMLElement>("a.internal-link, a.external-link").forEach(link => {
			link.dataset.qolSource = source;
			this.decorateLink(link, source);
		});
	}

	private decorateLink(link: HTMLElement, source: string): void {
		link.querySelectorAll(".qol-link-sticker").forEach(el => el.remove());
		if (!this.settings.enabled || !this.settings.reading) return;
		const href = link.getAttribute("data-href") ?? link.getAttribute("href");
		if (!href) return;
		if (link.classList.contains("external-link")) {
			const icon = externalLinkIcon(href) ?? "external-link";
			link.prepend(this.createExternalSticker(link.ownerDocument, icon));
			return;
		}
		const file = this.resolveLink(href, source);
		const raw = file && this.rawSticker(file);
		if (file && raw) link.prepend(this.createSticker(link.ownerDocument, file.path, raw, "qol-link-sticker"));
	}

	scheduleRefresh(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => { this.timer = null; this.refresh(); }, 100);
	}

	refresh(): void {
		for (const editor of this.editors) editor.dispatch({ effects: refreshStickers.of(null) });
		for (const document of this.documents) {
			document.querySelectorAll(".qol-title-sticker, .qol-tab-sticker").forEach(el => el.remove());
			document.querySelectorAll(".qol-tab-has-sticker").forEach(el => el.classList.remove("qol-tab-has-sticker"));
			document.querySelectorAll<HTMLElement>("a[data-qol-source]").forEach(link =>
				this.decorateLink(link, link.dataset.qolSource ?? ""));
		}
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !view.file) continue;
			const file = view.file;
			this.documents.add(view.containerEl.ownerDocument);
			if (!this.settings.enabled) continue;
			const raw = this.rawSticker(file);
			if (this.settings.titles) {
				view.containerEl.querySelectorAll<HTMLElement>(".inline-title").forEach(title => {
					if (!title.closest(".internal-embed")) title.before(
						this.createSticker(title.ownerDocument, file.path, raw, "qol-title-sticker"));
				});
			}
			// Obsidian has no public tab-icon setter; guard this optional DOM integration.
			if (this.settings.tabs && raw && "tabHeaderEl" in leaf && leaf.tabHeaderEl instanceof HTMLElement) {
				const icon = leaf.tabHeaderEl.querySelector<HTMLElement>(".workspace-tab-header-inner-icon");
				if (icon) {
					icon.classList.add("qol-tab-has-sticker");
					icon.appendChild(this.createSticker(icon.ownerDocument, file.path, raw, "qol-tab-sticker"));
				}
			}
		}
		this.plugin.refreshNavigator();
	}

	onunload(): void {
		if (this.timer) clearTimeout(this.timer);
		for (const document of this.documents) {
			document.querySelectorAll(".qol-sticker, .qol-external-sticker").forEach(el => el.remove());
			document.querySelectorAll(".qol-tab-has-sticker").forEach(el => el.classList.remove("qol-tab-has-sticker"));
			document.querySelectorAll<HTMLElement>("[data-qol-source]").forEach(el => delete el.dataset.qolSource);
		}
		this.documents.clear();
	}
}
