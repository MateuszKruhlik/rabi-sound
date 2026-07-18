import { toast } from "sonner";

import type { ToolcraftPanelActionHandler } from "@/toolcraft/runtime/react";

import {
  createPresetRecipe,
  createRecipeJson,
  createVariation,
  encodeWav,
  exportSoundPackZip,
  getPackFileName,
  getRecipeFileName,
  renderSound,
  sanitizeFileStem,
  type CuelumePresetId,
  type SoundPackV1,
} from "../audio";
import { downloadBytes } from "./download";
import {
  dispatchEditorSnapshot,
  getActiveSound,
  materializePackFromValues,
  targets,
} from "./editor-model";

function setPack(
  dispatch: Parameters<ToolcraftPanelActionHandler>[0]["dispatch"],
  pack: SoundPackV1,
  label: string,
): void {
  dispatch({ label, target: targets.pack, type: "controls.setValue", value: pack });
  dispatchEditorSnapshot(dispatch, pack);
  dispatch({ currentTimeSeconds: 0, type: "timeline.setCurrentTime" });
}

function reportExportFailure(label: string, error: unknown): void {
  console.error(`Rabi Sound ${label} failed`, error);
  toast.error(`${label} failed`, {
    description: error instanceof Error ? error.message : "Unexpected error while exporting.",
  });
}

export const handleStudioPanelAction: ToolcraftPanelActionHandler = (context) => {
  const pack = materializePackFromValues(context.state.values);
  const activeSound = getActiveSound(pack);

  switch (context.action.value) {
    case "preset.apply": {
      const presetId = String(context.state.values[targets.presetId] ?? "success") as CuelumePresetId;
      const preset = createPresetRecipe(presetId, activeSound.id);
      const next = {
        ...pack,
        sounds: pack.sounds.map((sound) => (sound.id === activeSound.id ? preset : sound)),
      };
      setPack(context.dispatch, next, "Use preset");
      return;
    }
    case "variation.add": {
      if (pack.sounds.length >= 32) return;
      let seed = Number(context.state.values[targets.variationSeed] ?? 42) >>> 0;
      let variation = createVariation(activeSound, {
        intensity: Number(context.state.values[targets.variationIntensity] ?? 50) / 100,
        seed,
      });
      while (pack.sounds.some((sound) => sound.id === variation.id)) {
        seed += 1;
        variation = createVariation(activeSound, {
          intensity: Number(context.state.values[targets.variationIntensity] ?? 50) / 100,
          seed,
        });
      }
      const next = {
        ...pack,
        activeSoundId: variation.id,
        sounds: [...pack.sounds, variation],
      };
      setPack(context.dispatch, next, "Add variation");
      return;
    }
    case "export.wav":
      return renderSound(activeSound, pack.export)
        .then((rendered) => {
          downloadBytes(
            encodeWav(rendered, pack.export),
            `${sanitizeFileStem(activeSound.name)}.wav`,
            "audio/wav",
          );
        })
        .catch((error: unknown) => reportExportFailure("WAV export", error));
    case "export.recipe":
      try {
        downloadBytes(
          createRecipeJson(activeSound),
          getRecipeFileName(activeSound),
          "application/json",
        );
      } catch (error) {
        reportExportFailure("Recipe export", error);
      }
      return;
    case "export.pack":
      return exportSoundPackZip(pack, (progress) => {
        const phaseWeight = progress.phase === "render" ? 0.55 : 0.45;
        const phaseOffset = progress.phase === "render" ? 0 : 0.55;
        context.reportProgress(
          phaseOffset + phaseWeight * (progress.completed / Math.max(1, progress.total)),
        );
      })
        .then((bytes) => downloadBytes(bytes, getPackFileName(pack), "application/zip"))
        .catch((error: unknown) => reportExportFailure("Pack export", error));
    default:
      return;
  }
};
