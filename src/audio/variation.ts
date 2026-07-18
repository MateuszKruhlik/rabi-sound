import { clamp, createSeededRandom, roundTo } from "./math";
import { MAX_CUE_DURATION_MS } from "./types";
import type { SoundRecipeV1, VariationOptions } from "./types";

const MAX_NAME_LENGTH = 80;

function centered(random: () => number): number {
  return random() * 2 - 1;
}

function variationName(sourceName: string): string {
  const existing = sourceName.match(/^(.*?)\s+variation(?:\s+(\d+))?$/);
  const base = existing ? existing[1] : sourceName;
  const nextIndex = existing ? (existing[2] ? Number(existing[2]) + 1 : 2) : 1;
  const label = nextIndex === 1 ? "variation" : `variation ${nextIndex}`;
  const maxBase = Math.max(1, MAX_NAME_LENGTH - (label.length + 1));
  const trimmedBase = base.length > maxBase ? base.slice(0, maxBase).trim() : base;
  return `${trimmedBase} ${label}`.trim().slice(0, MAX_NAME_LENGTH);
}

export function createVariation(
  source: SoundRecipeV1,
  options: VariationOptions,
): SoundRecipeV1 {
  const intensity = clamp(options.intensity, 0, 1);
  const random = createSeededRandom(options.seed);
  const timingScale = 1 + centered(random) * 0.15 * intensity;
  const pitchScale = 1 + centered(random) * 0.07 * intensity;
  const gainOffsetDb = centered(random) * 3 * intensity;
  const shimmerScale = 1 + centered(random) * 0.2 * intensity;

  return {
    ...structuredClone(source),
    id: `${source.id}-variation-${options.seed >>> 0}`,
    layers: source.layers.map((layer, index) => {
      const layerTiming = timingScale * (1 + centered(random) * 0.035 * intensity);
      const layerGainOffset = gainOffsetDb + centered(random) * 0.35 * intensity;
      // Clamp every jittered field to its schema bound (and keep the envelope sum within
      // MAX_CUE_DURATION_MS) so a variation of an extreme cue can never produce a recipe
      // that fails soundRecipeV1Schema on export / preview.
      const startMs = clamp(roundTo(layer.startMs * layerTiming), 0, MAX_CUE_DURATION_MS);
      const attackMs = clamp(roundTo(layer.attackMs * layerTiming), 0, MAX_CUE_DURATION_MS - startMs);
      const decayMs = clamp(
        roundTo(layer.decayMs * layerTiming),
        0,
        MAX_CUE_DURATION_MS - startMs - attackMs,
      );
      const base = {
        ...layer,
        attackMs,
        decayMs,
        gainDb: roundTo(clamp(layer.gainDb + layerGainOffset, -72, 12)),
        id: `${source.id}-variation-${options.seed >>> 0}-layer-${index + 1}`,
        startMs,
      };

      if (layer.kind === "noise") {
        return base;
      }

      return {
        ...base,
        frequencyHz: roundTo(clamp(layer.frequencyHz * pitchScale, 20, 20_000)),
        glide: layer.glide
          ? {
              durationMs: clamp(
                roundTo(layer.glide.durationMs * layerTiming),
                0,
                MAX_CUE_DURATION_MS,
              ),
              toFrequencyHz: roundTo(clamp(layer.glide.toFrequencyHz * pitchScale, 20, 20_000)),
            }
          : undefined,
      };
    }),
    name: variationName(source.name),
    seed: options.seed >>> 0,
    shimmer: source.shimmer
      ? {
          ...source.shimmer,
          wet: roundTo(clamp(source.shimmer.wet * shimmerScale, 0, 1)),
        }
      : undefined,
    source: undefined,
  };
}
