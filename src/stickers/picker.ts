import { App, getIcon, getIconIds, Modal, Notice, Setting } from "obsidian";
import { parseSticker } from "./model";
import { emojiOptions, searchStickers, stickerOption } from "./search";

export function paintSticker(el: HTMLElement, raw: unknown): boolean {
	el.empty();
	const sticker = parseSticker(raw);
	if (!sticker) return false;
	if (sticker.kind === "emoji") el.setText(sticker.value);
	else {
		const icon = getIcon(sticker.value);
		if (!icon) return false;
		el.appendChild(icon);
	}
	return true;
}

export class StickerPicker extends Modal {
	constructor(
		app: App,
		private label: string,
		private current: unknown,
		private save: (value: string | null) => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(`Sticker: ${this.label}`);
		const preview = this.contentEl.createDiv({ cls: "qol-sticker-preview" });
		let value = typeof this.current === "string" ? this.current : "";
		const options = [
			...emojiOptions,
			...getIconIds().map(id => stickerOption(`lucide//${id.replace(/^lucide-/, "")}`, id)),
		];
		const results = this.contentEl.createDiv({ cls: "qol-sticker-options" });
		const update = () => {
			paintSticker(preview, value);
			results.empty();
			for (const option of searchStickers(options, value)) {
				const button = results.createEl("button", { attr: { type: "button", "aria-label": option.label } });
				button.title = option.label;
				paintSticker(button, option.value);
				button.addEventListener("click", () => { void commit(option.value); });
			}
		};
		let saving = false;
		const commit = async (next: string | null) => {
			if (saving) return;
			const parsed = next === null ? null : parseSticker(next);
			if (next !== null && (!parsed || (parsed.kind === "icon" && !getIcon(parsed.value)))) {
				new Notice("Choose an emoji, an emoji hex code, or a Lucide icon (lucide//icon-name).");
				return;
			}
			saving = true;
			try {
				await this.save(next?.trim() ?? null);
				this.close();
			} catch (error) {
				console.error("QOL: Could not save sticker", error);
				new Notice(`Could not save sticker: ${error instanceof Error ? error.message : String(error)}`);
			} finally {
				saving = false;
			}
		};
		const input = new Setting(this.contentEl)
			.setName("Search or enter a sticker")
			.setDesc("Search emoji and icons by name or keyword, paste an emoji, or enter a code such as 1f4dd or lucide//book.")
			.addText(text => {
				text.setValue(value).onChange(next => { value = next; update(); });
				text.inputEl.addEventListener("keydown", event => {
					if (event.key === "Enter") { event.preventDefault(); void commit(value); }
				});
			});
		this.contentEl.insertBefore(input.settingEl, results);
		new Setting(this.contentEl)
			.addButton(button => button.setButtonText("Remove").onClick(() => { void commit(null); }))
			.addButton(button => button.setButtonText("Save").setCta().onClick(() => { void commit(value); }));
		update();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
