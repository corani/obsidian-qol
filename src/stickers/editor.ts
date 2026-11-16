import { syntaxTree } from "@codemirror/language";
import { StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { editorInfoField } from "obsidian";
import type { StickerManager } from "./manager";
import { findLinks, imageFileIcon } from "./model";

export const refreshStickers = StateEffect.define<null>();

class StickerWidget extends WidgetType {
	constructor(private manager: StickerManager, private path: string, private raw: string) { super(); }

	eq(other: StickerWidget): boolean { return this.path === other.path && this.raw === other.raw; }

	toDOM(view: EditorView): HTMLElement {
		return this.manager.createSticker(view.dom.ownerDocument, this.path, this.raw, "qol-link-sticker");
	}

	ignoreEvent(): boolean { return true; }
}

class DefaultIconWidget extends WidgetType {
	constructor(private manager: StickerManager, private icon: string) { super(); }
	eq(other: DefaultIconWidget): boolean { return this.icon === other.icon; }
	toDOM(view: EditorView): HTMLElement {
		return this.manager.createDefaultSticker(view.dom.ownerDocument, this.icon);
	}
}

export function stickerExtension(manager: StickerManager) {
	return ViewPlugin.fromClass(class {
		decorations: DecorationSet;

		constructor(private view: EditorView) {
			manager.editors.add(view);
			this.decorations = this.build();
		}

		update(update: ViewUpdate): void {
			if (update.docChanged || update.viewportChanged || update.transactions.some(transaction =>
				transaction.effects.some(effect => effect.is(refreshStickers)))
				|| syntaxTree(update.startState) !== syntaxTree(update.state)) {
				this.decorations = this.build();
			}
		}

		build(): DecorationSet {
			if (!manager.settings.enabled || !manager.settings.editor) return Decoration.none;
			const source = this.view.state.field(editorInfoField, false)?.file?.path;
			if (!source) return Decoration.none;
			const widgets = [];
			const seen = new Set<number>();
			for (const range of this.view.visibleRanges) {
				let position = this.view.state.doc.lineAt(range.from).from;
				while (position <= range.to) {
					const line = this.view.state.doc.lineAt(position);
					for (const link of findLinks(line.text)) {
						const from = line.from + link.from;
						if (seen.has(from)) continue;
						seen.add(from);
						let node = syntaxTree(this.view.state).resolveInner(from + 2, 1);
						let excluded = false;
						for (;;) {
							if (/code|comment/i.test(node.name)) { excluded = true; break; }
							if (!node.parent) break;
							node = node.parent;
						}
						if (excluded) continue;
						const file = link.icon ? null : manager.resolveLink(link.target, source);
						const icon = link.icon ?? (file && imageFileIcon(file.extension));
						if (icon) {
							widgets.push(Decoration.widget({
								widget: new DefaultIconWidget(manager, icon), side: -1,
							}).range(from));
							continue;
						}
						const raw = file && manager.rawSticker(file);
						if (file && raw) widgets.push(Decoration.widget({
							widget: new StickerWidget(manager, file.path, raw), side: -1,
						}).range(from));
					}
					if (line.to === this.view.state.doc.length) break;
					position = line.to + 1;
				}
			}
			return Decoration.set(widgets, true);
		}

		destroy(): void { manager.editors.delete(this.view); }
	}, { decorations: plugin => plugin.decorations });
}
