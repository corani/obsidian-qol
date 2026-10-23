import { App, MarkdownRenderer, MarkdownView, Component } from "obsidian";
import { getBacklinks, getOutlinks, ResolvedLink } from "./resolver";
import type { LinksSettings } from "../settings";

const FOOTER_CLS = "links-footer";
const FOOTER_KEY_ATTR = "data-links-key";
const rendering = new WeakMap<MarkdownView, boolean>();
const footerLayouts = new WeakMap<MarkdownView, Component>();

export function alignEditorFooter(footer: HTMLElement, content: HTMLElement, container: HTMLElement): void {
	const contentRect = content.getBoundingClientRect();
	if (contentRect.width === 0) return;
	const containerRect = container.getBoundingClientRect();
	const contentStyle = getComputedStyle(content);
	const containerStyle = getComputedStyle(container);
	const px = (value: string) => parseFloat(value) || 0;
	const left = contentRect.left + px(contentStyle.borderLeftWidth) + px(contentStyle.paddingLeft);
	const right = contentRect.right - px(contentStyle.borderRightWidth) - px(contentStyle.paddingRight);
	const containerLeft = containerRect.left + px(containerStyle.borderLeftWidth) + px(containerStyle.paddingLeft);
	const containerRight = containerRect.right - px(containerStyle.borderRightWidth) - px(containerStyle.paddingRight);
	footer.style.marginInlineStart = `${containerStyle.direction === "rtl" ? containerRight - right : left - containerLeft}px`;
	footer.style.width = `${Math.max(0, right - left)}px`;
}

function watchEditorLayout(view: MarkdownView, footer: HTMLElement, container: Element): void {
	if (!container.matches(".cm-sizer")) return;
	const content = container.querySelector<HTMLElement>(".cm-content");
	if (!content) return;
	const align = () => alignEditorFooter(footer, content, container as HTMLElement);
	align();
	const observer = new ResizeObserver(align);
	observer.observe(content);
	observer.observe(container);
	const lifecycle = view.addChild(new Component());
	lifecycle.register(() => observer.disconnect());
	footerLayouts.set(view, lifecycle);
}

function getTargetContainer(view: MarkdownView): Element | null {
	// Reading mode: .markdown-preview-section that is visible
	const sections = view.contentEl.querySelectorAll(".markdown-preview-section");
	for (const section of sections) {
		const el = section as HTMLElement;
		if (!el.closest(".internal-embed") && el.offsetParent !== null) return el;
	}
	// Editing mode: .cm-sizer
	const sizer = view.contentEl.querySelector(".cm-sizer") as HTMLElement | null;
	if (sizer && sizer.offsetParent !== null) return sizer;
	return null;
}

function applyLimit(links: ResolvedLink[], limit: number): { shown: ResolvedLink[]; hidden: number } {
	if (limit <= 0 || links.length <= limit) return { shown: links, hidden: 0 };
	return { shown: links.slice(0, limit), hidden: links.length - limit };
}

function buildMarkdown(settings: LinksSettings, backlinks: ResolvedLink[], outlinks: ResolvedLink[]): string {
	const { limit, sectionTitle } = settings;
	const lines: string[] = [`## ${sectionTitle}`, ""];

	const addCallout = (type: string, label: string, links: ResolvedLink[]) => {
		if (links.length === 0) return;
		const { shown, hidden } = applyLimit(links, limit);
		lines.push(`> [!${type}]- ${label} (${links.length})`);
		for (const l of shown) lines.push(`> - [[${l.file.path.replace(/\.md$/, "")}|${l.displayTitle}]]`);
		if (hidden > 0) lines.push(`> - *… and ${hidden} more*`);
		lines.push("");
	};

	addCallout("example", "Backlinks", backlinks);
	addCallout("seealso", "Outlinks", outlinks);

	return lines.join("\n");
}

export async function updateView(app: App, view: MarkdownView, settings: LinksSettings, owner: Component): Promise<void> {
	const file = view.file;
	if (!file) return;

	// Skip if a render is already in flight for this view
	if (rendering.get(view)) return;
	rendering.set(view, true);

	try {
		// Wait for the DOM to settle after mode switches
		await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

		const container = getTargetContainer(view);

		const backlinks = getBacklinks(app, file);
		const outlinks = getOutlinks(app, file);
		const key = `${file.path}:${backlinks.length}:${outlinks.length}`;

		// No-op if the visible container already has an up-to-date footer
		const existing = container?.querySelector(`.${FOOTER_CLS}`);
		if (existing?.getAttribute(FOOTER_KEY_ATTR) === key) return;

		// Remove all footers from this view (handles mode switches)
		removeFromView(view);

		if (!container) return;
		if (backlinks.length === 0 && outlinks.length === 0) return;

		const markdown = buildMarkdown(settings, backlinks, outlinks);

		const footerEl = document.createElement("div");
		footerEl.className = FOOTER_CLS;
		footerEl.setAttribute(FOOTER_KEY_ATTR, key);
		container.appendChild(footerEl);
		watchEditorLayout(view, footerEl, container);

		await MarkdownRenderer.render(app, markdown, footerEl, file.path, owner);

		// Wire up internal link clicks -- MarkdownRenderer doesn't do this outside a leaf context
		footerEl.querySelectorAll("a.internal-link").forEach(el => {
			el.addEventListener("click", (evt) => {
				evt.preventDefault();
				const href = el.getAttribute("data-href") ?? el.getAttribute("href");
				if (href) app.workspace.openLinkText(href, file.path, false);
			});
		});
	} finally {
		rendering.set(view, false);
	}
}

export function removeFromView(view: MarkdownView): void {
	const lifecycle = footerLayouts.get(view);
	if (lifecycle) {
		view.removeChild(lifecycle);
		footerLayouts.delete(view);
	}
	view.contentEl.querySelectorAll(`.${FOOTER_CLS}`).forEach(el => el.remove());
}
