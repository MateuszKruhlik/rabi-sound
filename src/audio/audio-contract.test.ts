import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildSoundPackArchive } from "./archive";
import { masterRenderedChannels, renderWaveformPeaks } from "./audio-engine";
import { PACK_LICENSES_MARKDOWN } from "./licenses";
import { createDefaultSoundPack, CUELUME_PRESET_IDS, CUELUME_PRESETS } from "./presets";
import { parseSoundPack, soundRecipeV1Schema } from "./schema";
import type { RenderedSound } from "./types";
import { createVariation } from "./variation";
import { encodeWav } from "./wav";

describe("Rabi Sound audio contracts", () => {
  it("ships all fourteen valid Cuelume presets", () => {
    expect(CUELUME_PRESET_IDS).toHaveLength(14);

    for (const presetId of CUELUME_PRESET_IDS) {
      expect(soundRecipeV1Schema.parse(CUELUME_PRESETS[presetId])).toMatchObject({
        name: presetId,
        source: { license: "MIT", preset: presetId },
      });
    }
  });

  it("round-trips a v1 pack and rejects future migrations", () => {
    const pack = createDefaultSoundPack();
    expect(parseSoundPack(JSON.stringify(pack))).toEqual(pack);
    expect(parseSoundPack({ ...pack, schema: "cuelume-studio" })).toEqual(pack);
    expect(() => parseSoundPack({ ...pack, version: 2 })).toThrow();
  });

  it("creates deterministic bounded variations without mutating the source", () => {
    const source = structuredClone(CUELUME_PRESETS.success);
    const before = structuredClone(source);
    const first = createVariation(source, { intensity: 1, seed: 42 });
    const second = createVariation(source, { intensity: 1, seed: 42 });
    expect(first).toEqual(second);
    expect(source).toEqual(before);
    expect(first).not.toBe(source);

    first.layers.forEach((layer, index) => {
      const original = source.layers[index];
      expect(layer.startMs).toBeGreaterThanOrEqual(original.startMs * 0.85);
      expect(layer.startMs).toBeLessThanOrEqual(original.startMs * 1.15 + 0.001);
      expect(Math.abs(layer.gainDb - original.gainDb)).toBeLessThanOrEqual(3.36);
      if (layer.kind === "tone" && original.kind === "tone") {
        expect(layer.frequencyHz).toBeGreaterThanOrEqual(original.frequencyHz * 0.93);
        expect(layer.frequencyHz).toBeLessThanOrEqual(original.frequencyHz * 1.07 + 0.001);
      }
    });
  });

  it("applies trim, fades and normalization within the requested peak", () => {
    const recipe = {
      ...structuredClone(CUELUME_PRESETS.success),
      duration: { endMs: 100, mode: "trim" as const },
      mastering: {
        fadeInMs: 10,
        fadeOutMs: 20,
        normalize: true,
        targetPeakDbfs: -6,
        trimSilence: false,
      },
    };
    const input = new Float32Array(1_000).fill(0.9);
    const rendered = masterRenderedChannels([input], 10_000, recipe);
    expect(rendered.channels[0]).toHaveLength(1_000);
    expect(rendered.channels[0][0]).toBe(0);
    expect(rendered.channels[0].at(-1)).toBe(0);
    expect(rendered.peak).toBeLessThanOrEqual(10 ** (-6 / 20) + 0.000_001);
  });

  it("encodes correct 16-bit mono and 24-bit stereo WAV headers", () => {
    const mono: RenderedSound = {
      channels: [new Float32Array([0, 0.5, -0.5])],
      durationMs: 3 / 48,
      peak: 0.5,
      sampleRate: 48_000,
    };
    const monoBytes = encodeWav(mono, { bitDepth: 16, channels: 1, sampleRate: 48_000 });
    const monoView = new DataView(monoBytes.buffer);
    expect(new TextDecoder().decode(monoBytes.slice(0, 4))).toBe("RIFF");
    expect(monoView.getUint16(22, true)).toBe(1);
    expect(monoView.getUint32(24, true)).toBe(48_000);
    expect(monoView.getUint16(34, true)).toBe(16);
    expect(monoBytes).toHaveLength(44 + 3 * 2);

    const stereo: RenderedSound = {
      ...mono,
      channels: [mono.channels[0], mono.channels[0]],
      sampleRate: 44_100,
    };
    const stereoBytes = encodeWav(stereo, { bitDepth: 24, channels: 2, sampleRate: 44_100 });
    const stereoView = new DataView(stereoBytes.buffer);
    expect(stereoView.getUint16(22, true)).toBe(2);
    expect(stereoView.getUint32(24, true)).toBe(44_100);
    expect(stereoView.getUint16(34, true)).toBe(24);
    expect(stereoBytes).toHaveLength(44 + 3 * 2 * 3);
  });

  it("creates waveform peaks and a ZIP with manifest, licenses and checksums", async () => {
    const pack = createDefaultSoundPack();
    const rendered: RenderedSound = {
      channels: [new Float32Array([0, 0.5, -0.5, 0.25])],
      durationMs: 4 / 48,
      peak: 0.5,
      sampleRate: 48_000,
    };
    const peaks = renderWaveformPeaks(rendered, 2);
    expect(peaks).toEqual([
      { max: 0.5, min: 0 },
      { max: 0.25, min: -0.5 },
    ]);

    const zip = await buildSoundPackArchive({
      cues: [
        {
          channels: rendered.channels,
          fileName: "success.wav",
          recipeId: pack.activeSoundId,
          sampleRate: rendered.sampleRate,
        },
      ],
      licenses: PACK_LICENSES_MARKDOWN,
      pack,
      settings: pack.export,
    });
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual([
      "LICENSES.md",
      "audio/success.wav",
      "checksums.sha256",
      "manifest.json",
      "pack.json",
    ]);
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    expect(manifest.cueCount).toBe(1);
    expect(manifest.createdBy).toBe("Rabi Sound 0.1.0");
    expect(manifest.schema).toBe("rabi-sound-pack-manifest");
    expect(manifest.files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "audio/success.wav" })]),
    );
    expect(new TextDecoder().decode(files["checksums.sha256"])).toContain("audio/success.wav");
  });
});
