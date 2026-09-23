export interface BlockConfig {
	period: "day" | "week";
	title?: string;
	showTitle?: boolean;
	section?: string;
	limit?: number;
	date?: string;
}

export class ParseError extends Error {}

export function parseBlockConfig(source: string): BlockConfig {
	const config: Partial<BlockConfig> = {};

	for (const raw of source.split("\n")) {
		const line = raw.replace(/#.*$/, "").trim();
		if (!line) continue;

		const colon = line.indexOf(":");
		if (colon === -1) continue;

		const key = line.slice(0, colon).trim().toLowerCase();
		const value = line.slice(colon + 1).trim();

		switch (key) {
			case "period":
				if (value === "day" || value === "week") config.period = value;
				else throw new ParseError(`Invalid period "${value}" -- must be "day" or "week".`);
				break;
			case "title":
				config.title = value;
				break;
			case "showtitle":
				config.showTitle = value.toLowerCase() !== "false";
				break;
			case "section":
				config.section = value;
				break;
			case "limit": {
				const n = parseInt(value, 10);
				if (!isNaN(n) && n > 0) config.limit = n;
				break;
			}
			case "date":
				config.date = value;
				break;
		}
	}

	if (!config.period) {
		throw new ParseError('Missing required field "period" -- must be "day" or "week".');
	}

	return config as BlockConfig;
}
