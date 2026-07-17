import { describe, expect, it } from "vitest";

import type { RenderedSound } from "../audio/types";
import { alignRenderedSoundToPlaybackDuration } from "./playback";

function makeRenderedSound(samples: readonly number[]): RenderedSound {
  return {
    channels: [Float32Array.from(samples)],
    durationMs: samples.length * 100,
    peak: Math.max(...samples.map(Math.abs)),
    sampleRate: 10,
  };
}

describe("timeline-aligned Web Audio playback", () => {
  it("pads a short cue with silence to the complete timeline cycle", () => {
    const aligned = alignRenderedSoundToPlaybackDuration(
      makeRenderedSound([0.25, -0.5, 0.75, -1]),
      1,
    );

    expect(aligned.durationMs).toBe(1_000);
    expect(Array.from(aligned.channels[0] ?? [])).toEqual([
      0.25,
      -0.5,
      0.75,
      -1,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
  });

  it("trims a long cue to the timeline cycle without mutating the render", () => {
    const source = makeRenderedSound([0.1, 0.2, 0.3, 0.4]);
    const aligned = alignRenderedSoundToPlaybackDuration(source, 0.2);

    expect(Array.from(aligned.channels[0] ?? [])).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.2),
    ]);
    expect(Array.from(source.channels[0] ?? [])).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.2),
      expect.closeTo(0.3),
      expect.closeTo(0.4),
    ]);
  });
});
