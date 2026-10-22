import { MarkdownFileInfo, MarkdownView, WorkspaceLeaf } from "obsidian";

export class CaptureEditor extends MarkdownView {
	constructor(leaf: WorkspaceLeaf, onChange: () => void) {
		super(leaf);
		this.allowNoFile = true;
		this.navigation = false;
		this.containerEl.addClass("qol-capture-editor");
		this.requestSave = onChange;
		const workspace = this.app.workspace;
		const previous = workspace.activeEditor;
		const context: MarkdownFileInfo & Pick<MarkdownView, "getMode"> = {
			app: this.app, file: null, editor: this.editor, hoverPopover: null,
			getMode: () => this.getMode(),
		};
		this.registerDomEvent(this.containerEl, "focusin", () => { workspace.activeEditor = context; });
		this.registerDomEvent(this.containerEl, "focusout", event => {
			if (!(event.relatedTarget instanceof Node && this.containerEl.contains(event.relatedTarget))
				&& workspace.activeEditor === context) workspace.activeEditor = null;
		});
		this.register(() => {
			if (workspace.activeEditor === context || workspace.activeEditor === null) {
				workspace.activeEditor = null;
				workspace.activeEditor = previous;
			}
		});
	}

	// The draft must never participate in the file view's autosave lifecycle.
	override async save(): Promise<void> {}
}
