export const DEFAULT_TIMER_PRESETS = [5, 15, 25];
export const MAX_TIMER_SECONDS = 999 * 60 + 59;

export function formatDuration(seconds: number): string {
	const whole = Math.max(0, Math.ceil(seconds));
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Bare numbers mean minutes; m:ss also allows durations under one minute. */
export function parseDuration(value: string): number | null {
	const match = /^(\d{1,3})(?::([0-5]\d))?$/.exec(value.trim());
	if (!match) return null;
	const seconds = Number(match[1]) * 60 + Number(match[2] ?? 0);
	return seconds > 0 && seconds <= MAX_TIMER_SECONDS ? seconds : null;
}

export function parsePresets(value: string): number[] | null {
	const parts = value.split(",").map(part => part.trim());
	if (parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) < 1)) return null;
	return parts.map(Number);
}

export function normalizePresets(value: unknown): number[] {
	return Array.isArray(value) && value.length > 0
		&& value.every(item => Number.isInteger(item) && item >= 1 && item <= 999)
		? [...value] : [...DEFAULT_TIMER_PRESETS];
}

export class Countdown {
	duration: number;
	remaining: number;
	private deadline: number | null = null;
	private listeners = new Set<() => void>();

	constructor(seconds: number, private complete: () => void = () => {}, private now = () => Date.now()) {
		this.duration = seconds;
		this.remaining = seconds;
	}

	get running(): boolean { return this.deadline !== null; }

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}

	private notify(): void { this.listeners.forEach(listener => listener()); }

	load(seconds: number): void {
		if (!Number.isInteger(seconds) || seconds <= 0 || seconds > MAX_TIMER_SECONDS) return;
		this.deadline = null;
		this.duration = seconds;
		this.remaining = seconds;
		this.notify();
	}

	start(): void {
		if (this.running) return;
		if (this.remaining === 0) this.remaining = this.duration;
		this.deadline = this.now() + this.remaining * 1000;
		this.notify();
	}

	pause(): void {
		this.tick();
		this.deadline = null;
		this.notify();
	}

	reset(): void { this.load(this.duration); }

	tick(): void {
		if (this.deadline === null) return;
		// Use elapsed wall time so a background tab or sleeping computer cannot cause drift.
		this.remaining = Math.max(0, Math.min(this.duration, (this.deadline - this.now()) / 1000));
		const finished = this.remaining === 0;
		if (finished) this.deadline = null;
		this.notify();
		if (finished) this.complete();
	}
}
