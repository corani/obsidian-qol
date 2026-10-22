import { ItemView, Menu, Notice, setIcon, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import type QolPlugin from "../main";
import { orderEntries, reorderPaths } from "../stickers/model";

export const NAVIGATOR_TYPE = "qol-navigator";
const DRAG_TYPE = "application/x-qol-navigator";

export class NavigatorView extends ItemView {
	private reordering = false;
	private draggedPath: string | null = null;
	private dropIndicator: HTMLElement | null = null;
	private refreshAfterDrag = false;
	constructor(leaf: WorkspaceLeaf, private plugin: QolPlugin) { super(leaf); }

	getViewType(): string { return NAVIGATOR_TYPE; }
	getDisplayText(): string { return "Navigator"; }
	getIcon(): string { return "folder-tree"; }

	async onOpen(): Promise<void> { this.refresh(); }
	async onClose(): Promise<void> {
		this.clearDropIndicator();
		this.contentEl.empty();
	}

	private get settings() { return this.plugin.settings.navigator; }
	private children(folder: TFolder): TAbstractFile[] {
		const note = this.plugin.stickers.folderNote(folder);
		const children = folder.children.filter(file => {
			if (file === note || file.path.split("/").some(part => part.startsWith("."))) return false;
			if (file instanceof TFile && ["mdb", "mdc"].includes(file.extension)) return false;
			return !this.settings.hiddenPaths.some(path => file.path === path || file.path.startsWith(`${path}/`));
		});
		return orderEntries(children, this.plugin.stickers.navigationOrder(folder));
	}

	refresh(): void {
		if (this.draggedPath) {
			this.refreshAfterDrag = true;
			return;
		}
		const focused = this.contentEl.ownerDocument.activeElement;
		const focusedPath = focused instanceof HTMLElement ? focused.dataset.qolPath : undefined;
		const scroll = this.contentEl.scrollTop;
		this.contentEl.empty();
		this.contentEl.addClass("qol-navigator");
		const header = this.contentEl.createDiv({ cls: "qol-navigator-header" });
		header.createSpan({ text: "Navigator" });
		const collapse = header.createEl("button", { attr: { "aria-label": "Collapse all folders" } });
		setIcon(collapse, "fold-vertical");
		collapse.addEventListener("click", () => {
			this.settings.expanded = [];
			this.persist();
		});
		const tree = this.contentEl.createDiv({ attr: { role: "tree", "aria-label": "Vault files" } });
		for (const file of this.children(this.app.vault.getRoot())) this.renderItem(tree, file);
		this.contentEl.scrollTop = scroll;
		if (focusedPath) Array.from(this.contentEl.querySelectorAll<HTMLElement>("[data-qol-path]"))
			.find(row => row.dataset.qolPath === focusedPath)?.focus({ preventScroll: true });
	}

	private renderItem(parent: HTMLElement, file: TAbstractFile): void {
		const folder = file instanceof TFolder;
		const expanded = folder && this.settings.expanded.includes(file.path);
		const item = parent.createDiv({ cls: "qol-nav-item" });
		const row = item.createDiv({ cls: "qol-nav-row", attr: { role: "treeitem", tabindex: "0" } });
		row.dataset.qolPath = file.path;
		row.draggable = true;
		if (folder) row.setAttribute("aria-expanded", String(expanded));
		const toggle = row.createEl("button", {
			cls: "qol-nav-toggle", attr: { tabindex: "-1", "aria-label": expanded ? "Collapse folder" : "Expand folder" },
		});
		if (folder) {
			setIcon(toggle, expanded ? "chevron-down" : "chevron-right");
			toggle.addEventListener("click", event => { event.stopPropagation(); this.toggle(file); });
		} else {
			toggle.disabled = true;
		}
		const raw = this.plugin.stickers.rawSticker(file);
		if (raw || folder || (file instanceof TFile && file.extension === "md")) {
			row.appendChild(this.plugin.stickers.createSticker(
				row.ownerDocument, file.path, raw, "qol-nav-icon", folder ? "folder" : "file"));
		}
		else {
			const icon = row.createSpan({ cls: "qol-nav-icon" });
			setIcon(icon, folder ? "folder" : "file");
		}
		row.createSpan({ cls: "qol-nav-name", text: file instanceof TFile ? file.basename : file.name });
		row.title = file.path;
		row.addEventListener("click", event => {
			if (folder) {
				const note = this.plugin.stickers.folderNote(file);
				if (note) this.openNote(note, event.ctrlKey || event.metaKey);
				else this.toggle(file);
			} else if (file instanceof TFile) this.openNote(file, event.ctrlKey || event.metaKey);
		});
		row.addEventListener("keydown", event => {
			if (event.target !== row) return;
			if (event.key === "Enter") { event.preventDefault(); row.click(); }
			if (folder && (event.key === " " || event.key === "ArrowRight" || event.key === "ArrowLeft")) {
				event.preventDefault();
				const expand = event.key === " " ? !expanded : event.key === "ArrowRight";
				if (expand !== expanded) this.toggle(file);
			}
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				const rows = Array.from(this.contentEl.querySelectorAll<HTMLElement>(".qol-nav-row"));
				rows[rows.indexOf(row) + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
			}
		});
		row.addEventListener("contextmenu", event => {
			event.preventDefault();
			const menu = new Menu();
			this.app.workspace.trigger("file-menu", menu, file, "qol-navigator");
			if (!this.plugin.settings.stickers.enabled) this.plugin.stickers.addMenu(menu, file);
			if (folder) menu.addItem(entry => entry
				.setTitle(this.plugin.stickers.folderNote(file) ? "Open folder note" : "Create folder note")
				.setIcon("file-plus").onClick(async () => {
					try { await this.app.workspace.getLeaf(false).openFile(await this.plugin.stickers.ensureFolderNote(file)); }
					catch (error) { this.plugin.reportError("Could not open folder note", error); }
				}));
			if (file.parent) {
				const siblings = this.children(file.parent);
				const index = siblings.indexOf(file);
				for (const [offset, title] of [[-1, "Move up"], [1, "Move down"]] as const) {
					const target = siblings[index + offset];
					menu.addItem(entry => entry.setTitle(title).setIcon(offset < 0 ? "arrow-up" : "arrow-down")
						.setDisabled(!target || this.reordering).onClick(() => { if (target) void this.reorder(file, target, offset > 0); }));
				}
			}
			menu.showAtMouseEvent(event);
		});
		row.addEventListener("dragstart", event => {
			if (this.reordering) {
				event.preventDefault();
				new Notice("Please wait for the current order to finish saving.");
				return;
			}
			this.draggedPath = file.path;
			event.dataTransfer?.setData(DRAG_TYPE, file.path);
			if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
		});
		row.addEventListener("dragover", event => {
			const source = this.draggedPath && this.app.vault.getAbstractFileByPath(this.draggedPath);
			if (source && source !== file && source.parent === file.parent
				&& event.dataTransfer?.types.includes(DRAG_TYPE)) {
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
				this.clearDropIndicator();
				this.dropIndicator = row;
				row.classList.add(this.dropAfter(row, event.clientY) ? "qol-nav-drop-after" : "qol-nav-drop-before");
			} else {
				this.clearDropIndicator();
				if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
			}
		});
		row.addEventListener("dragleave", event => {
			if (event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) return;
			if (this.dropIndicator === row) this.clearDropIndicator();
		});
		row.addEventListener("dragend", () => this.finishDrag());
		row.addEventListener("drop", event => {
			const path = event.dataTransfer?.getData(DRAG_TYPE);
			if (!path) return;
			event.preventDefault();
			event.stopPropagation();
			const after = this.dropAfter(row, event.clientY);
			this.finishDrag();
			const source = this.app.vault.getAbstractFileByPath(path);
			if (source) void this.reorder(source, file, after);
		});
		if (folder && expanded) {
			const group = item.createDiv({ cls: "qol-nav-children", attr: { role: "group" } });
			for (const child of this.children(file)) this.renderItem(group, child);
		}
	}

	private openNote(file: TFile, newTab: boolean): void {
		void this.app.workspace.getLeaf(newTab ? "tab" : false).openFile(file)
			.catch(error => this.plugin.reportError("Could not open note", error));
	}

	private toggle(folder: TFolder): void {
		this.settings.expanded = this.settings.expanded.includes(folder.path)
			? this.settings.expanded.filter(path => path !== folder.path) : [...this.settings.expanded, folder.path];
		this.persist();
	}

	private dropAfter(row: HTMLElement, y: number): boolean {
		return y > row.getBoundingClientRect().top + row.offsetHeight / 2;
	}

	private clearDropIndicator(): void {
		this.dropIndicator?.classList.remove("qol-nav-drop-before", "qol-nav-drop-after");
		this.dropIndicator = null;
	}

	private finishDrag(): void {
		this.clearDropIndicator();
		this.draggedPath = null;
		if (this.refreshAfterDrag) {
			this.refreshAfterDrag = false;
			this.refresh();
		}
	}

	private async reorder(source: TAbstractFile, target: TAbstractFile, after: boolean): Promise<void> {
		if (this.reordering) {
			new Notice("Please wait for the current order to finish saving.");
			return;
		}
		if (!source.parent || source.parent !== target.parent) {
			new Notice("Reorder within the same folder. Navigator does not move files between folders.");
			return;
		}
		const entries = this.children(source.parent);
		const paths = entries.map(file => file.path);
		const ordered = reorderPaths(paths, source.path, target.path, after);
		if (ordered === paths) return;
		const byPath = new Map(entries.map(entry => [entry.path, entry]));
		const next = ordered.map(path => byPath.get(path)).filter((entry): entry is TAbstractFile => entry !== undefined);
		this.reordering = true;
		try {
			await this.plugin.stickers.saveNavigationOrder(source.parent, next);
		} catch (error) {
			this.plugin.reportError("Could not save Navigator order", error);
		} finally {
			this.reordering = false;
			this.plugin.stickers.scheduleRefresh();
		}
	}

	private persist(): void {
		this.refresh();
		void this.plugin.saveSettings().catch(error => this.plugin.reportError("Could not save Navigator settings", error));
	}
}
