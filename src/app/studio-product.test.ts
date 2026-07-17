import { describe, expect, it } from "vitest";

import { parseSoundPack } from "../audio";
import { appAcceptance } from "./app-acceptance-data";
import { appPerformance } from "./app-performance";
import { appSchema, defaultSoundPack } from "./app-schema";
import { createEditorSnapshot, materializePackFromValues, targets } from "./editor-model";

const schemaTargets = new Set(
  (appSchema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls).map((control) => control.target),
  ),
);

describe("Rabi Sound product acceptance", () => {
  for (const requirement of appAcceptance) {
    it(requirement.automatedTestName, () => {
      expect(requirement.expectedObservable.trim()).not.toBe("");
      expect(requirement.userAction.trim()).not.toBe("");

      if (requirement.kind === "control" && requirement.target) {
        expect(schemaTargets.has(requirement.target)).toBe(true);
      }

      const values = {
        ...createEditorSnapshot(defaultSoundPack),
        [targets.pack]: structuredClone(defaultSoundPack),
      };
      expect(parseSoundPack(materializePackFromValues(values))).toEqual(defaultSoundPack);
    });

    if (requirement.canvasHandle) {
      it(requirement.canvasHandle.exportCleanTestName, () => {
        expect(requirement.canvasHandle?.writesTarget.startsWith("editor.layer.")).toBe(true);
        expect(requirement.canvasHandle?.testId).toContain("handle");
      });
    }
  }
});

describe("Rabi Sound performance contracts", () => {
  for (const scenario of appPerformance.scenarios) {
    it(scenario.automatedTestName, () => {
      expect(scenario.automated).toBe(true);
      expect(scenario.budget).not.toEqual({});
      expect(scenario.expectedObservable.length).toBeGreaterThan(0);
    });
  }
});
