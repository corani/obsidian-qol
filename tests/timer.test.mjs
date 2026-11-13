import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
	entryPoints: ["src/timer/model.ts"], bundle: true, write: false, format: "esm", platform: "node",
});
const { Countdown, formatDuration, parseDuration, parsePresets, normalizePresets } = await import(
	`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

function fixture(seconds = 300) {
	let now = 100000;
	let completions = 0;
	const timer = new Countdown(seconds, () => completions++, () => now);
	return { timer, advance: ms => { now += ms; }, completions: () => completions };
}

test("parses editable minutes and m:ss without accepting partial or invalid input", () => {
	for (const [text, seconds] of [["5", 300], [" 15:07 ", 907], ["0:01", 1], ["999:59", 59999]]) {
		assert.equal(parseDuration(text), seconds);
	}
	for (const text of ["", "0", "0:00", "-5", "1.5", "5:60", "5:1", "5m", "1:00:00", "1000", "Infinity"]) {
		assert.equal(parseDuration(text), null, text);
	}
	assert.equal(formatDuration(300), "5:00");
	assert.equal(formatDuration(59.1), "1:00");
	assert.equal(formatDuration(0), "0:00");
});

test("presets support one or many values and reject empty or malformed saved settings", () => {
	assert.deepEqual(parsePresets("5, 15, 25"), [5, 15, 25]);
	assert.deepEqual(parsePresets("1"), [1]);
	assert.deepEqual(parsePresets("1,2,3,4,5,6,7,8"), [1, 2, 3, 4, 5, 6, 7, 8]);
	for (const text of ["", "0", "5,", "5,,25", "-1", "2.5", "5m", "1000"]) assert.equal(parsePresets(text), null);
	for (const value of [undefined, null, [], [0], [2.5], ["5"], [Infinity], [1000], "5,15"]) {
		assert.deepEqual(normalizePresets(value), [5, 15, 25]);
	}
	const saved = [10, 20];
	assert.deepEqual(normalizePresets(saved), saved);
	assert.notEqual(normalizePresets(saved), saved);
});

test("pause and resume preserve fractional seconds across irregular ticks", () => {
	const f = fixture();
	f.timer.start();
	f.advance(1234);
	f.timer.pause();
	assert.equal(f.timer.remaining, 298.766);
	f.advance(60000);
	f.timer.tick();
	assert.equal(f.timer.remaining, 298.766);
	f.timer.start();
	f.timer.start();
	f.advance(766);
	f.timer.tick();
	assert.equal(f.timer.remaining, 298);
	assert.equal(f.timer.running, true);
});

test("a delayed tick catches up after sleep and completes exactly once; play repeats", () => {
	const f = fixture();
	f.timer.start();
	f.advance(900000);
	f.timer.tick();
	f.timer.tick();
	f.timer.pause();
	assert.equal(f.timer.remaining, 0);
	assert.equal(f.timer.running, false);
	assert.equal(f.completions(), 1);
	f.timer.start();
	assert.equal(f.timer.remaining, 300);
	f.advance(300000);
	f.timer.tick();
	assert.equal(f.completions(), 2);
});

test("loading a preset stops the countdown and reset restores the edited duration", () => {
	const f = fixture();
	f.timer.start();
	f.advance(10000);
	f.timer.load(907);
	assert.equal(f.timer.running, false);
	assert.equal(f.timer.remaining, 907);
	f.timer.start();
	f.advance(10000);
	f.timer.reset();
	assert.equal(f.timer.running, false);
	assert.equal(f.timer.remaining, 907);
	f.advance(1000000);
	f.timer.tick();
	assert.equal(f.completions(), 0);
});

test("detaching a view listener leaves the shared countdown running", () => {
	const f = fixture(1);
	let renders = 0;
	const detach = f.timer.subscribe(() => renders++);
	f.timer.start();
	assert.equal(renders, 1);
	detach();
	f.advance(1000);
	f.timer.tick();
	assert.equal(renders, 1);
	assert.equal(f.completions(), 1);
});
