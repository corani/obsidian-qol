import { Component, Notice } from "obsidian";
import { Countdown } from "./model";

/** Owned by the plugin, so closing the view does not stop the countdown. */
export class TimerController extends Component {
	readonly countdown: Countdown;
	private audio: AudioContext | null = null;

	constructor(seconds: number, private soundEnabled: () => boolean) {
		super();
		this.countdown = new Countdown(seconds, () => {
			new Notice("Timer complete. Time for a breather.", 10000);
			if (this.soundEnabled()) this.chime();
		});
	}

	onload(): void {
		this.registerInterval(window.setInterval(() => this.countdown.tick(), 200));
	}

	/** Unlock audio from the play button's user gesture, including on mobile. */
	start(): void {
		if (this.soundEnabled()) {
			try {
				this.audio ??= new AudioContext();
				void this.audio.resume().catch(() => {});
			} catch { /* The notice still works when audio is unavailable. */ }
		}
		this.countdown.start();
	}

	private chime(): void {
		const audio = this.audio;
		if (!audio || audio.state !== "running") return;
		for (const [delay, frequency] of [[0, 660], [0.22, 880]]) {
			const oscillator = audio.createOscillator();
			const gain = audio.createGain();
			const start = audio.currentTime + delay;
			oscillator.frequency.value = frequency;
			gain.gain.setValueAtTime(0, start);
			gain.gain.linearRampToValueAtTime(0.07, start + 0.015);
			gain.gain.exponentialRampToValueAtTime(0.001, start + 0.65);
			oscillator.connect(gain);
			gain.connect(audio.destination);
			oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
			oscillator.start(start);
			oscillator.stop(start + 0.7);
		}
	}

	onunload(): void {
		if (this.audio) void this.audio.close().catch(() => {});
		this.audio = null;
	}
}
