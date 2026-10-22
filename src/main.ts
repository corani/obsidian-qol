import { Plugin, MarkdownView, Notice } from "obsidian";
import { QolSettings, DEFAULT_SETTINGS, QolSettingTab } from "./settings";
import { OneLineBlock } from "./oneline/renderer";
import { BirthdaysBlock } from "./birthdays/renderer";
import { ModifiedBlock } from "./modified/renderer";
import { updateView, removeFromView } from "./links/renderer";
import { QuickCaptureModal, isOneLine, isTodo } from "./capture/modal";
import { getOrCreateDailyNote, appendToSection } from "./capture/inserter";
import { StickerManager } from "./stickers/manager";
import { renamePath } from "./stickers/model";
import { NAVIGATOR_TYPE, NavigatorView } from "./navigator/view";

export default class QolPlugin extends Plugin {
	settings: QolSettings = DEFAULT_SETTINGS;
	stickers!: StickerManager;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	async onload() {
		await this.loadSettings();
		this.stickers = this.addChild(new StickerManager(this));
		this.registerView(NAVIGATOR_TYPE, leaf => new NavigatorView(leaf, this));
		this.addSettingTab(new QolSettingTab(this.app, this));
		this.addCommand({ id: "open-navigator", name: "Open Navigator", callback: () => this.openNavigator() });
		this.addRibbonIcon("folder-tree", "Open Navigator", () => { void this.openNavigator(); });
		this.registerEvent(this.app.vault.on("create", () => this.stickers.scheduleRefresh()));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			void this.updateNavigatorPaths(oldPath, file.path)
				.then(() => this.stickers.updateNavigationReference(oldPath, file.path))
				.then(() => this.stickers.followFolderRename(file, oldPath))
				.catch(error => this.reportError("Could not update Navigator after rename", error));
			this.stickers.scheduleRefresh();
		}));
		this.registerEvent(this.app.vault.on("delete", file => {
			void this.updateNavigatorPaths(file.path)
				.then(() => this.stickers.updateNavigationReference(file.path))
				.catch(error => this.reportError("Could not update Navigator paths", error));
			this.stickers.scheduleRefresh();
		}));
		this.app.workspace.onLayoutReady(() => {
			this.stickers.scheduleRefresh();
			if (this.settings.navigator.enabled) void this.openNavigator();
		});

		this.registerMarkdownCodeBlockProcessor("oneline", (source, el, ctx) =>
			ctx.addChild(new OneLineBlock(this.app, this.settings.oneline, source, el, ctx)));

		this.registerMarkdownCodeBlockProcessor("birthdays", (source, el, ctx) =>
			ctx.addChild(new BirthdaysBlock(this.app, this.settings.birthdays, source, el, ctx)));

		this.registerMarkdownCodeBlockProcessor("modified", (source, el, ctx) =>
			ctx.addChild(new ModifiedBlock(this.app, this.settings.modified, source, el, ctx)));

		this.registerLinksEvents();
		this.app.workspace.onLayoutReady(() => this.scheduleLinksUpdate());

		this.addCommand({
			id: "update-timestamp",
			name: "Update timestamp",
			callback: () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return;
				const ts = this.formatTimestamp(this.settings.utilities.timestampFormat);
				this.app.fileManager.processFrontMatter(file, fm => { fm.updated = ts; });
			},
		});

		this.addCommand({
			id: "quick-capture",
			name: "Quick capture to daily note",
			callback: () => {
				new QuickCaptureModal(this.app, this.settings.capture, async (storedChar, text, date) => {
					const file = await getOrCreateDailyNote(this.app, date);
					if (!file) return;
					const oneLine = isOneLine(storedChar);
					const section = oneLine  ? this.settings.oneline.defaultSection
					               : isTodo(storedChar) ? this.settings.capture.todoSection
					               :                      this.settings.capture.notesSection;
					const line = oneLine ? text : `- [${storedChar}] ${text}`;
					await appendToSection(this.app, file, section, line, oneLine);
				}).open();
			},
		});
	}

	onunload() {
		this.closeNavigator();
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.app.workspace.iterateAllLeaves(leaf => {
			if (leaf.view instanceof MarkdownView) removeFromView(leaf.view);
		});
	}

	// Called when Links settings change -- force re-render by clearing all footers
	onLinksSettingChanged() {
		this.app.workspace.iterateAllLeaves(leaf => {
			if (leaf.view instanceof MarkdownView) removeFromView(leaf.view);
		});
		this.scheduleLinksUpdate();
	}

	private formatTimestamp(format: string): string {
		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, "0");
		return format
			.replace("YYYY", String(now.getFullYear()))
			.replace("MM",   pad(now.getMonth() + 1))
			.replace("DD",   pad(now.getDate()))
			.replace("HH",   pad(now.getHours()))
			.replace("mm",   pad(now.getMinutes()))
			.replace("ss",   pad(now.getSeconds()));
	}

	private registerLinksEvents() {
		const schedule = (delay = 100) => this.scheduleLinksUpdate(delay);

		this.registerEvent(this.app.workspace.on("layout-change", () => schedule()));
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => schedule()));
		this.registerEvent(this.app.workspace.on("file-open", () => schedule()));
		this.registerEvent(this.app.metadataCache.on("changed", () => schedule()));
		this.registerEvent(this.app.workspace.on("editor-change", () =>
			schedule(this.settings.links.refreshInterval)));
	}

	private scheduleLinksUpdate(delay = 100) {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => this.updateAllLinkViews(), delay);
	}

	private updateAllLinkViews() {
		if (!this.settings.links.enabled) return;
		this.app.workspace.iterateAllLeaves(leaf => {
			if (leaf.view instanceof MarkdownView) {
				updateView(this.app, leaf.view, this.settings.links, this);
			}
		});
	}

	async loadSettings() {
		const saved = await this.loadData();
		this.settings = {
			oneline:    Object.assign({}, DEFAULT_SETTINGS.oneline,    saved?.oneline),
			birthdays:  Object.assign({}, DEFAULT_SETTINGS.birthdays,  saved?.birthdays),
			modified:   Object.assign({}, DEFAULT_SETTINGS.modified,   saved?.modified),
			links:      Object.assign({}, DEFAULT_SETTINGS.links,      saved?.links),
			capture:    Object.assign({}, DEFAULT_SETTINGS.capture,    saved?.capture),
			utilities:  Object.assign({}, DEFAULT_SETTINGS.utilities,  saved?.utilities),
			stickers: Object.assign({}, DEFAULT_SETTINGS.stickers, saved?.stickers),
			navigator: Object.assign({}, DEFAULT_SETTINGS.navigator, saved?.navigator),
		};
		this.settings.navigator = {
			enabled: this.settings.navigator.enabled,
			hiddenPaths: this.settings.navigator.hiddenPaths,
			expanded: this.settings.navigator.expanded,
		};
		this.settings.navigator.expanded = [...this.settings.navigator.expanded];
		this.settings.navigator.hiddenPaths = [...this.settings.navigator.hiddenPaths];
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async openNavigator(): Promise<void> {
		try {
			if (!this.settings.navigator.enabled) {
				this.settings.navigator.enabled = true;
				await this.saveSettings();
			}
			let leaf = this.app.workspace.getLeavesOfType(NAVIGATOR_TYPE)[0];
			if (!leaf) {
				const left = this.app.workspace.getLeftLeaf(false);
				if (!left) throw new Error("No sidebar leaf is available.");
				leaf = left;
				await leaf.setViewState({ type: NAVIGATOR_TYPE, active: true });
			}
			await this.app.workspace.revealLeaf(leaf);
		} catch (error) { this.reportError("Could not open Navigator", error); }
	}

	closeNavigator(): void {
		this.app.workspace.getLeavesOfType(NAVIGATOR_TYPE).forEach(leaf => leaf.detach());
	}

	refreshNavigator(): void {
		this.app.workspace.getLeavesOfType(NAVIGATOR_TYPE).forEach(leaf => {
			if (leaf.view instanceof NavigatorView) leaf.view.refresh();
		});
	}

	private async updateNavigatorPaths(oldPath: string, newPath?: string): Promise<void> {
		const settings = this.settings.navigator;
		const keep = (path: string) => path !== oldPath && !path.startsWith(`${oldPath}/`);
		const update = (paths: string[]) => newPath
			? paths.map(path => renamePath(path, oldPath, newPath)) : paths.filter(keep);
		settings.expanded = update(settings.expanded);
		settings.hiddenPaths = update(settings.hiddenPaths);
		await this.saveSettings();
	}

	reportError(message: string, error: unknown): void {
		console.error(`QOL: ${message}`, error);
		new Notice(`${message}: ${error instanceof Error ? error.message : String(error)}`);
	}
}
