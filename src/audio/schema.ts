import { z } from "zod";

import {
  MAX_CUE_DURATION_MS,
  MAX_CUES_PER_PACK,
  MAX_LAYERS_PER_CUE,
  LEGACY_SOUND_PACK_SCHEMA,
  SOUND_PACK_SCHEMA,
  SOUND_PACK_VERSION,
  type SoundPackV1,
} from "./types";

const finiteNumber = z.number().finite();
const nonNegativeMs = finiteNumber.min(0).max(MAX_CUE_DURATION_MS);
const layerBaseSchema = z.object({
  attackMs: nonNegativeMs,
  decayMs: nonNegativeMs,
  enabled: z.boolean(),
  gainDb: finiteNumber.min(-72).max(12),
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  pan: finiteNumber.min(-1).max(1),
  startMs: nonNegativeMs,
});

const toneLayerSchema = layerBaseSchema.extend({
  detuneCents: finiteNumber.min(-2_400).max(2_400),
  frequencyHz: finiteNumber.min(20).max(20_000),
  glide: z
    .object({
      durationMs: nonNegativeMs,
      toFrequencyHz: finiteNumber.min(20).max(20_000),
    })
    .optional(),
  kind: z.literal("tone"),
  waveform: z.enum(["sine", "triangle", "square", "sawtooth"]),
});

const noiseLayerSchema = layerBaseSchema.extend({
  filter: z.object({
    cutoffHz: finiteNumber.min(20).max(20_000),
    q: finiteNumber.min(0.0001).max(30),
    type: z.enum(["lowpass", "bandpass", "highpass"]),
  }),
  kind: z.literal("noise"),
  noise: z.literal("white"),
});

export const soundRecipeV1Schema = z
  .object({
    duration: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("auto") }),
      z.object({ endMs: finiteNumber.min(1).max(MAX_CUE_DURATION_MS), mode: z.literal("trim") }),
    ]),
    id: z.string().min(1),
    layers: z
      .array(z.discriminatedUnion("kind", [toneLayerSchema, noiseLayerSchema]))
      .min(1)
      .max(MAX_LAYERS_PER_CUE),
    mastering: z.object({
      fadeInMs: nonNegativeMs,
      fadeOutMs: nonNegativeMs,
      normalize: z.boolean(),
      targetPeakDbfs: finiteNumber.min(-36).max(0),
      trimSilence: z.boolean(),
    }),
    masterGainDb: finiteNumber.min(-72).max(12),
    name: z.string().trim().min(1).max(80),
    seed: z.number().int().min(0).max(0xffff_ffff),
    shimmer: z
      .object({
        delayMs: finiteNumber.min(1).max(2_000),
        feedback: finiteNumber.min(0).max(0.95),
        lowpassHz: finiteNumber.min(20).max(20_000),
        wet: finiteNumber.min(0).max(1),
      })
      .optional(),
    source: z
      .object({
        commit: z.string().min(1),
        license: z.literal("MIT"),
        preset: z.string().min(1),
        repository: z.string().url(),
        version: z.string().min(1),
      })
      .optional(),
  })
  .superRefine((recipe, context) => {
    const ids = new Set<string>();

    for (const layer of recipe.layers) {
      if (ids.has(layer.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate layer id: ${layer.id}`,
          path: ["layers"],
        });
      }
      ids.add(layer.id);

      if (layer.startMs + layer.attackMs + layer.decayMs > MAX_CUE_DURATION_MS) {
        context.addIssue({
          code: "custom",
          message: `Layer ${layer.name} extends beyond ${MAX_CUE_DURATION_MS} ms.`,
          path: ["layers", layer.id],
        });
      }
    }
  });

export const soundPackV1Schema = z
  .object({
    activeSoundId: z.string().min(1),
    export: z.object({
      bitDepth: z.union([z.literal(16), z.literal(24)]),
      channels: z.union([z.literal(1), z.literal(2)]),
      sampleRate: z.union([z.literal(44_100), z.literal(48_000)]),
    }),
    id: z.string().min(1),
    name: z.string().trim().min(1).max(100),
    schema: z.literal(SOUND_PACK_SCHEMA),
    sounds: z.array(soundRecipeV1Schema).min(1).max(MAX_CUES_PER_PACK),
    version: z.literal(SOUND_PACK_VERSION),
  })
  .superRefine((pack, context) => {
    const ids = new Set(pack.sounds.map((sound) => sound.id));

    if (ids.size !== pack.sounds.length) {
      context.addIssue({ code: "custom", message: "Cue ids must be unique.", path: ["sounds"] });
    }

    if (!ids.has(pack.activeSoundId)) {
      context.addIssue({
        code: "custom",
        message: "activeSoundId must reference a cue in the pack.",
        path: ["activeSoundId"],
      });
    }
  });

export function parseSoundPack(input: unknown): SoundPackV1 {
  const parsedInput = typeof input === "string" ? JSON.parse(input) : input;
  const migratedInput =
    typeof parsedInput === "object" &&
    parsedInput !== null &&
    "schema" in parsedInput &&
    parsedInput.schema === LEGACY_SOUND_PACK_SCHEMA
      ? { ...parsedInput, schema: SOUND_PACK_SCHEMA }
      : parsedInput;
  return soundPackV1Schema.parse(migratedInput) as SoundPackV1;
}
