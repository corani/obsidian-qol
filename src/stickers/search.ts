import emojiData from "emojibase-data/en/compact.json";

export interface StickerOption {
	value: string;
	label: string;
	search: string;
}

interface EmojiEntry {
	group?: number;
	hexcode: string;
	label: string;
	unicode: string;
	tags?: string[];
	skins?: EmojiEntry[];
}

export function stickerOption(value: string, label: string, keywords: string[] = []): StickerOption {
	return { value, label, search: [value, label, ...keywords].join(" ").toLowerCase() };
}

const catalogue: EmojiEntry[] = emojiData;

export const emojiOptions: StickerOption[] = catalogue
	.filter(emoji => emoji.group !== undefined)
	.flatMap(emoji => [emoji, ...(emoji.skins ?? [])].map(entry => {
		const value = Array.from(entry.unicode, character => character.codePointAt(0)!.toString(16)).join("-");
		return stickerOption(value, entry.label,
			[entry.unicode, entry.hexcode, `emoji//${value}`, ...(emoji.tags ?? [])]);
	}));

export function searchStickers(options: StickerOption[], query: string): StickerOption[] {
	const text = query.trim().toLowerCase();
	if (!text) return options.slice(0, 80);
	const words = text.split(/\s+/);
	const rank = (option: StickerOption) => {
		const label = option.label.toLowerCase();
		if (option.value === text || label === text) return 0;
		if (label.startsWith(text)) return 1;
		if (label.includes(text)) return 2;
		return 3;
	};
	return options.filter(option => words.every(word => option.search.includes(word)))
		.sort((a, b) => rank(a) - rank(b)).slice(0, 80);
}
