export function extractSection(content: string, sectionHeading: string): string[] {
	const target = sectionHeading.toLowerCase();
	const headingRe = /^#+\s+(.+)$/;
	const lines = content.split("\n").map(l => l.replace(/\r$/, ""));
	const result: string[] = [];
	let inside = false;
	let inOneline = false;

	for (const line of lines) {
		if (inside) {
			if (line.trimStart().startsWith("```oneline")) {
				inOneline = true;
				continue;
			}
			if (inOneline) {
				if (line.trimStart().startsWith("```")) inOneline = false;
				continue;
			}
		}

		const m = line.match(headingRe);
		if (m) {
			if (inside) break;
			if (m[1].trim().toLowerCase() === target) inside = true;
			continue;
		}
		if (inside) result.push(line);
	}

	// Strip leading and trailing blank lines
	while (result.length && result[0].trim() === "") result.shift();
	while (result.length && result[result.length - 1].trim() === "") result.pop();

	return result;
}
