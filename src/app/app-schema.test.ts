import { describe, expect, it } from "vitest";

import { CUELUME_PRESET_IDS } from "../audio/presets";
import { appPerformance } from "./app-performance";
import { appSchema, defaultSoundPack } from "./app-schema";

describe("Rabi Sound schema", () => {
  it("publishes the Toolcraft editing shell used by the sound studio", () => {
    expect(appSchema.canvas).toMatchObject({
      draggable: false,
      enabled: true,
      size: { height: 1_200, unit: "px", width: 1_920 },
      sizing: { mode: "fixed-output" },
      upload: false,
    });
    expect(appSchema.panels.timeline).toMatchObject({ mode: "playback" });
    expect(appSchema.assembly.components).toEqual(
      expect.arrayContaining(["canvas", "controlsPanel", "timelinePanel", "toolbar"]),
    );
    expect(appSchema.assembly.capabilities).toEqual(
      expect.arrayContaining([
        "controls.panel",
        "timeline.playback",
        "toolbar.history",
      ]),
    );
    expect(appSchema.toolbar.theme).toBe(false);
    expect(appSchema.assembly.capabilities).not.toContain("toolbar.theme");
  });

  it("starts with the editable Cuelume success cue and all presets", () => {
    expect(defaultSoundPack.schema).toBe("rabi-sound");
    expect(defaultSoundPack.sounds).toHaveLength(1);
    expect(defaultSoundPack.sounds[0]?.name).toBe("success");

    const presetControl = appSchema.panels.controls?.sections
      .find((section) => section.title === "Presets & Variations")
      ?.controls.preset;
    expect(presetControl?.options).toHaveLength(CUELUME_PRESET_IDS.length);
  });

  it("keeps Toolcraft timeline transport and production export actions", () => {
    expect(appSchema.assembly.commands).toEqual(
      expect.arrayContaining([
        "timeline.setCurrentTime",
        "timeline.setDuration",
        "timeline.setPlaying",
        "timeline.toggleLoop",
      ]),
    );

    const outputActions = appSchema.panels.controls?.sections
      .flatMap((section) => Object.values(section.controls))
      .find((control) => control.target === "actions.output");
    expect(outputActions?.actions?.map((action) =>
      typeof action === "string" ? action : action.value,
    )).toEqual([
      "export.wav",
      "export.recipe",
      "export.pack",
    ]);
  });

  it("declares measured performance coverage for the custom waveform renderer", () => {
    expect(appPerformance.usesCustomRenderer).toBe(true);
    expect(appPerformance.rendererStrategy).toBe("dom");
    expect(appPerformance.scenarios.length).toBeGreaterThan(0);
    expect(appPerformance.workloadTargets).toEqual(
      expect.arrayContaining([
        "export.audio.sampleRate",
        "export.audio.channels",
      ]),
    );
  });
});
