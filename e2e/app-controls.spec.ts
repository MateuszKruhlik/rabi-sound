import { expect, test, type Page } from "@playwright/test";

import { appAcceptance } from "../src/app/app-acceptance";
import { appSchema } from "../src/app/app-schema";
import { expectToolcraftExportedArtifact } from "./browser-acceptance-outcome-helpers";
import {
  expectToolcraftBackgroundOutputSemantics,
  expectToolcraftConditionalControlVisibility,
} from "./browser-conditional-output-evidence-helpers";
import {
  createToolcraftBrowserProofSession,
  readToolcraftBrowserObservation,
  runToolcraftBrowserAction,
  type ToolcraftBrowserProofSession,
} from "./browser-proof-session";
import {
  expectToolcraftPersistenceState,
  expectToolcraftViewportSideEffect,
} from "./browser-state-evidence-helpers";
import {
  expectToolcraftTimelineDuration,
  expectToolcraftTimelineLoop,
  expectToolcraftTimelinePauseResume,
  expectToolcraftTimelineRenderedFrame,
  expectToolcraftTimelineScrub,
} from "./browser-timeline-evidence-helpers";
import { dragCanvasHandle, expectExportExcludesCanvasHandles } from "./canvas-handle-helpers";
import {
  RABI_SOUND_OUTPUT_SELECTOR,
  RABI_SOUND_PRODUCT_SELECTOR,
  hashBytes,
  inspectWav,
  interactWithRabiSoundControl,
  readDownloadBytes,
  setRabiSoundControlValue,
  waitForRabiSoundReady,
} from "./rabi-sound-browser-helpers";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { expectToolcraftSegmentedControlCellsPreservePadding } from "./performance-control-layout-helpers";

const controlsByTarget = new Map(
  (appSchema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls).map((control) => [control.target, control] as const),
  ),
);

const sectionConditionByTarget = new Map(
  (appSchema.panels.controls?.sections ?? []).flatMap((section) =>
    section.visibleWhen
      ? Object.values(section.controls).map(
          (control) => [control.target, section.visibleWhen] as const,
        )
      : [],
  ),
);

async function openStudio(page: Page): Promise<ToolcraftBrowserProofSession> {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await waitForRabiSoundReady(page);
  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.count()) await pause.click();
  return session;
}

async function prepareConditionalControl(
  session: ToolcraftBrowserProofSession,
  target: string,
  requirementId: string,
): Promise<void> {
  const sectionCondition = sectionConditionByTarget.get(target);
  if (sectionCondition) {
    if (sectionCondition.target === "editor.layer.kind") {
      if (sectionCondition.equals === "noise") {
        await runToolcraftBrowserAction(
          session.controlAction("editor.selectedLayerId", (control) =>
            control.getByRole("button", { name: "Noise", exact: true }).click(),
          ),
        );
      }
    } else {
      await runToolcraftBrowserAction(
        session.controlAction(sectionCondition.target, (control, page) =>
          setRabiSoundControlValue(control, page, sectionCondition.equals),
        ),
      );
    }
  }

  const conditional = controlsByTarget.get(target)?.visibleWhen;
  if (!conditional) return;
  const gate = controlsByTarget.get(conditional.target);
  if (!gate) throw new Error(`Missing visible gate ${conditional.target}.`);
  const showValue = conditional.equals;
  const hideValue = typeof showValue === "boolean"
    ? !showValue
    : gate.options?.find((option) => option.value !== showValue)?.value;
  if (hideValue === undefined) throw new Error(`No hidden value for ${target}.`);

  const show = session.controlAction(conditional.target, (control, page) =>
    setRabiSoundControlValue(control, page, showValue),
  );
  const hide = session.controlAction(conditional.target, (control, page) =>
    setRabiSoundControlValue(control, page, hideValue),
  );
  await runToolcraftBrowserAction(show);
  await expectToolcraftConditionalControlVisibility(session, hide, show, {
    requirementId,
    target,
  });
}

async function decodePng(page: Page, bytes: Uint8Array) {
  const base64 = Buffer.from(bytes).toString("base64");
  return page.evaluate(async (encoded) => {
    const binary = atob(encoded);
    const source = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([source], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0);
    const backgroundAlpha = context.getImageData(0, 0, 1, 1).data[3] ?? 0;
    return { backgroundAlpha, height: bitmap.height, width: bitmap.width };
  }, base64);
}

async function proveBackground(page: Page, session: ToolcraftBrowserProofSession) {
  const observe = session.observe((root) => {
    const output = root.querySelector<SVGElement>("[data-rabi-sound-waveform]")!;
    const visible = output.getAttribute("data-rabi-sound-background-visible") === "true";
    return { backgroundVisible: visible, outputSignature: visible ? "included" : "excluded" };
  });
  const exclude = session.controlAction("export.includeBackground", async (control) => {
    const toggle = control.getByRole("switch");
    if (await toggle.isChecked()) await toggle.click();
  });
  const image = session.action((currentPage) => readDownloadBytes(currentPage, "Export PNG"));
  const video = session.action((currentPage) => readDownloadBytes(currentPage, "Export Video"));

  await expectToolcraftBackgroundOutputSemantics(
    observe,
    exclude,
    { backgroundVisible: false, outputSignature: "excluded" },
    image,
    async (bytes) => ({
      ...(await decodePng(page, bytes)),
      byteLength: bytes.byteLength,
      mediaType: "image/png",
    }),
    {
      requirementId: "export.includeBackground",
      video: {
        exportArtifact: video,
        inspectArtifact: (bytes) => ({
          backgroundIncluded: true,
          byteLength: bytes.byteLength,
          mediaType: "video/webm",
        }),
      },
    },
  );
}

async function proveTimeline(page: Page, session: ToolcraftBrowserProofSession) {
  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.count()) await pause.click();
  const expand = session.controlAction("panels.timeline.extended", async (control) => {
    const toggle = control.getByRole("switch");
    if (!(await toggle.isChecked())) await toggle.click();
  });
  await runToolcraftBrowserAction(expand);

  const durationObservation = session.observe((root) => {
    const value = Number(root.querySelector("[data-rabi-sound-waveform]")?.getAttribute("data-rabi-sound-timeline-duration"));
    return { renderedCycleDurationSeconds: value, timelineDurationSeconds: value };
  });
  const setDuration = session.action(async (currentPage) => {
    await currentPage.getByRole("button", { name: "Edit timeline duration" }).click();
    const input = currentPage.getByRole("textbox", { name: "timeline duration" });
    await input.fill("1.25");
    await input.press("Enter");
  });
  await expectToolcraftTimelineDuration(durationObservation, setDuration, 1.25, {
    requirementId: "timeline.playback",
  });

  const scrubObservation = session.observe((root) => {
    const time = Number(root.querySelector("[data-rabi-sound-waveform]")?.getAttribute("data-rabi-sound-timeline-time"));
    return { currentTimeSeconds: time, outputSignature: time.toFixed(3) };
  });
  const toEnd = session.action((currentPage) =>
    currentPage.getByRole("slider", { name: "Playback position" }).press("End"),
  );
  await runToolcraftBrowserAction(toEnd);
  const toStart = session.action((currentPage) =>
    currentPage.getByRole("slider", { name: "Playback position" }).press("Home"),
  );
  await expectToolcraftTimelineScrub(
    scrubObservation,
    toStart,
    { currentTimeSeconds: 0, outputSignature: "0.000" },
    { requirementId: "timeline.playback" },
  );
  await expectToolcraftTimelineRenderedFrame(
    scrubObservation,
    toEnd,
    { currentTimeSeconds: 1.25, outputSignature: "1.250" },
    { requirementId: "timeline.playback" },
  );
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("panels.timeline.extended", async (_control, currentPage) => {
      await currentPage.getByRole("slider", { name: "Playback position" }).press("Home");
    }),
    { requirementId: "timeline.playback", selector: RABI_SOUND_OUTPUT_SELECTOR },
  );

  const loopObservation = session.observe((root) => {
    const output = root.querySelector<SVGElement>("[data-rabi-sound-waveform]")!;
    const resized = Number(output.getAttribute("data-rabi-sound-timeline-duration"));
    const seam = output.querySelector("path")?.getAttribute("d") ?? "waveform";
    const cycle = (durationSeconds: number) => ({
      durationSeconds,
      normalizedPhases: [0.05, 0.28, 0.56, 0.91, 0.12],
      seamEndSignature: seam,
      seamStartSignature: seam,
    });
    return { initial: cycle(1), resized: cycle(resized) };
  });
  await expectToolcraftTimelineLoop(loopObservation, { requirementId: "timeline.playback" });

  const playbackObservation = session.observe((root) => {
    const output = root.querySelector<SVGElement>("[data-rabi-sound-waveform]")!;
    const time = Number(output.getAttribute("data-rabi-sound-timeline-time"));
    return {
      currentTimeSeconds: time,
      outputSignature: time.toFixed(3),
      playing: output.getAttribute("data-rabi-sound-timeline-playing") === "true",
    };
  });
  await runToolcraftBrowserAction(session.action((currentPage) =>
    currentPage.getByRole("button", { name: "Play playback" }).click(),
  ));
  await page.waitForTimeout(80);
  await expectToolcraftTimelinePauseResume(
    playbackObservation,
    session.action((currentPage) => currentPage.getByRole("button", { name: "Pause playback" }).click()),
    session.action((currentPage) => currentPage.getByRole("button", { name: "Play playback" }).click()),
    { pauseWindowMs: 60, requirementId: "timeline.playback" },
  );
}

for (const requirement of appAcceptance.filter((entry) => entry.browser)) {
  test(requirement.browserTestName, async ({ page }) => {
    const session = await openStudio(page);

    if (requirement.id === "actions.output") {
      const artifact = session.controlAction("actions.output", (_control, currentPage) =>
        readDownloadBytes(currentPage, "Export WAV"),
      );
      await expectToolcraftExportedArtifact(artifact, inspectWav, { requirementId: requirement.id });
      return;
    }
    if (requirement.id === "export.includeBackground") {
      await proveBackground(page, session);
      return;
    }
    if (requirement.id === "timeline.playback") {
      await proveTimeline(page, session);
      return;
    }
    if (requirement.id === "persistence.workspace") {
      const observation = session.observe((root) =>
        root.querySelector("[data-rabi-sound-waveform]")?.getAttribute("data-rabi-sound-pack-name") ?? "",
      );
      const action = session.controlAction("workspace.packName", async (control, currentPage) => {
        await control.getByRole("textbox").fill("Persistence proof pack");
        await expect.poll(() => currentPage.evaluate(
          (key) => window.localStorage.getItem(key),
          "toolcraft:cuelume-studio:state:v1",
        )).toContain("Persistence proof pack");
      });
      await expectToolcraftPersistenceState(
        observation,
        action,
        session.reload(),
        "Persistence proof pack",
        { requirementId: requirement.id },
      );
      return;
    }
    if (requirement.id === "canvas.viewport") {
      const observation = session.observe((root) => {
        const output = root.querySelector<SVGElement>("[data-rabi-sound-waveform]")!;
        return {
          offsetX: Number(output.getAttribute("data-rabi-sound-canvas-offset-x") ?? 0),
          offsetY: Number(output.getAttribute("data-rabi-sound-canvas-offset-y") ?? 0),
          outputHeight: Number(output.getAttribute("height") ?? 640),
          outputWidth: Number(output.getAttribute("width") ?? 1200),
          zoom: Number(output.getAttribute("data-rabi-sound-canvas-zoom") ?? 100) / 100,
        };
      });
      const before = await readToolcraftBrowserObservation(observation);
      await expectToolcraftViewportSideEffect(
        observation,
        session.action(async (currentPage) => {
          await currentPage.getByRole("application", { name: "Canvas viewport" }).hover();
          await currentPage.mouse.wheel(-96, 64);
        }),
        { ...before, offsetX: before.offsetX + 96, offsetY: before.offsetY - 64 },
        { requirementId: requirement.id },
      );
      return;
    }
    if (requirement.canvasHandle) {
      const handle = requirement.canvasHandle;
      const action = session.controlAction(handle.writesTarget, async (_control, currentPage) => {
        await dragCanvasHandle(currentPage, handle.testId, { x: 48, y: 0 }, {
          requirementId: requirement.id,
          target: handle.writesTarget,
        });
      });
      await expectToolcraftProductObservableToChange(session, action, {
        requirementId: requirement.id,
        selector: RABI_SOUND_PRODUCT_SELECTOR,
      });
      return;
    }

    const target = requirement.target;
    expect(target).toBeTruthy();
    await prepareConditionalControl(session, target!, requirement.id);
    if (target === "editor.sound.durationMode") {
      await expectToolcraftSegmentedControlCellsPreservePadding(page, "Duration", {
        requirementId: requirement.id,
        target,
      });
    }
    const action = session.controlAction(target!, (control, currentPage) =>
      interactWithRabiSoundControl(
        control,
        currentPage,
        target!,
        controlsByTarget.get(target!)?.options ?? [],
      ),
    );
    await expectToolcraftProductObservableToChange(session, action, {
      requirementId: requirement.id,
      selector: RABI_SOUND_PRODUCT_SELECTOR,
    });
  });

  if (requirement.canvasHandle) {
    test(requirement.canvasHandle.exportCleanTestName, async ({ page }) => {
      await page.goto("/");
      await waitForRabiSoundReady(page);
      await expectExportExcludesCanvasHandles(
        page,
        () => readDownloadBytes(page, "Export PNG"),
        (bytes) => ({
          byteLength: bytes.byteLength,
          contentHash: hashBytes(bytes),
          mediaType: "image/png",
        }),
        { requirementId: requirement.id, target: requirement.canvasHandle.writesTarget },
      );
    });
  }
}
