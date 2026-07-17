import { clamp, createSeededRandom, roundTo } from "./math";
import type { SoundRecipeV1, VariationOptions } from "./types";

function centered(random: () => number): number {
  return random() * 2 - 1;
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
      const base = {
        ...layer,
        attackMs: roundTo(layer.attackMs * layerTiming),
        decayMs: roundTo(layer.decayMs * layerTiming),
        gainDb: roundTo(layer.gainDb + layerGainOffset),
        id: `${source.id}-variation-${options.seed >>> 0}-layer-${index + 1}`,
        startMs: roundTo(layer.startMs * layerTiming),
      };

      if (layer.kind === "noise") {
        return base;
      }

      return {
        ...base,
        frequencyHz: roundTo(layer.frequencyHz * pitchScale),
        glide: layer.glide
          ? {
              durationMs: roundTo(layer.glide.durationMs * layerTiming),
              toFrequencyHz: roundTo(layer.glide.toFrequencyHz * pitchScale),
            }
          : undefined,
      };
    }),
    name: `${source.name} variation`,
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
