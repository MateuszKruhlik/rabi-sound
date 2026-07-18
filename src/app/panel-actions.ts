import { toast } from "sonner";

import type { ToolcraftPanelActionHandler } from "@/toolcraft/runtime/react";

import {
  createPresetRecipe,
  createRecipeJson,
  CUELUME_PRESET_IDS,
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

export function applyPreset(
  dispatch: Parameters<ToolcraftPanelActionHandler>[0]["dispatch"],
  pack: SoundPackV1,
  presetId: string,
): void {
  const activeSound = getActiveSound(pack);
  const preset = createPresetRecipe(presetId as CuelumePresetId, activeSound.id);
  const next = {
    ...pack,
    sounds: pack.sounds.map((sound) => (sound.id === activeSound.id ? preset : sound)),
  };
  setPack(dispatch, next, "Use preset");
}

export const handleStudioPanelAction: ToolcraftPanelActionHandler = (context) => {
  const pack = materializePackFromValues(context.state.values);
  const activeSound = getActiveSound(pack);

  switch (context.action.value) {
    case "variation.randomize": {
      // Jump the active cue to a fresh sound: a different Cuelume preset + a new seed.
      // The preset auto-applies (canvas effect) and Seed/Intensity shape it live.
      const current = String(context.state.values[targets.presetId] ?? "success");
      const candidates = CUELUME_PRESET_IDS.filter((presetId) => presetId !== current);
      const nextPreset =
        candidates[Math.floor(Math.random() * candidates.length)] ?? current;
      context.dispatch({ target: targets.presetId, type: "controls.setValue", value: nextPreset });
      context.dispatch({
        target: targets.variationSeed,
        type: "controls.setValue",
        value: Math.floor(Math.random() * 10_000),
      });
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
