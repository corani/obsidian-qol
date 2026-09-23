export interface BlockConfig {
	period: "day" | "week" | "month";
	title?: string;
	showTitle?: boolean;
	date?: string;
	living?: boolean;
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
				if (value === "day" || value === "week" || value === "month") config.period = value;
				else throw new ParseError(`Invalid period "${value}" -- must be "day", "week", or "month".`);
				break;
			case "title":
				config.title = value;
				break;
			case "date":
				config.date = value;
				break;
			case "living":
				config.living = value.toLowerCase() === "true";
				break;
			case "showtitle":
				config.showTitle = value.toLowerCase() !== "false";
				break;
		}
	}

	if (!config.period) {
		throw new ParseError('Missing required field "period" -- must be "day", "week", or "month".');
	}

	return config as BlockConfig;
}
