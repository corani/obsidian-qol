import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import type { GoalTask } from "./model";

export async function renderTaskList(
	app: App,
	file: TFile,
	tasks: GoalTask[],
	container: HTMLElement,
	component: Component,
	isCurrent: () => boolean,
	onToggle: (task: GoalTask, checkbox: HTMLInputElement) => void,
): Promise<void> {
	const list = container.createEl("ul", { cls: "qol-goals-list" });
	const parents: { indent: number; item: HTMLLIElement; list?: HTMLUListElement }[] = [];
	for (const task of tasks) {
		if (!isCurrent()) return;
		while (parents.length && parents[parents.length - 1].indent >= task.indent) parents.pop();
		const parent = parents[parents.length - 1];
		const target = parent
			? (parent.list ??= parent.item.createEl("ul", { cls: "qol-goals-list" })) : list;
		const item = target.createEl("li", { cls: "qol-goals-task" });
		item.dataset.task = task.status;
		const row = item.createDiv({ cls: "qol-goals-row" });
		const checkbox = row.createEl("input", { cls: "task-list-item-checkbox", type: "checkbox" });
		checkbox.checked = task.status !== " ";
		checkbox.setAttribute("aria-label", task.text);
		const body = row.createDiv({ cls: "qol-goals-text" });
		await MarkdownRenderer.render(app, task.text, body, file.path, component);
		if (!isCurrent()) return;
		component.registerDomEvent(checkbox, "click", event => event.stopPropagation());
		component.registerDomEvent(checkbox, "change", () => onToggle(task, checkbox));
		parents.push({ indent: task.indent, item });
	}
}
