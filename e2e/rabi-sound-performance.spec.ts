// Product-owned Rabi Sound performance evidence.
import { expect, test, type Page } from "@playwright/test";

import { appPerformance } from "../src/app/app-performance";
import { appSchema } from "../src/app/app-schema";
import { getActiveSound, targets } from "../src/app/editor-model";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import {
  RABI_SOUND_OUTPUT_SELECTOR,
  RABI_SOUND_PRODUCT_SELECTOR,
  interactWithRabiSoundControl,
  selectRabiSoundOptionByIndex,
  setRabiSoundControlValue,
  waitForRabiSoundReady,
} from "./rabi-sound-browser-helpers";
import {
  expectToolcraftCanvasViewportStable,
  zoomToolcraftCanvasViewport,
} from "./performance-canvas-helpers";
import { expectToolcraftScenarioPerformanceBudget } from "./performance-budget-helpers";
import {
  applyToolcraftPerformanceStressValue,
  applyToolcraftPerformanceWorkloadValue,
} from "./performance-fixture-helpers";
import { measureToolcraftDownloadActionByLabel } from "./performance-output-action-helpers";
import { measureToolcraftInteraction } from "./performance-probe-helpers";
import { dragToolcraftSliderByTarget } from "./performance-slider-helpers";

const sections = appSchema.panels.controls?.sections ?? [];
test.describe.configure({ timeout: 90_000 });
const controlsByTarget = new Map(
  sections.flatMap((section) =>
    Object.values(section.controls).map((control) => [control.target, control] as const),
  ),
);
const sectionConditionByTarget = new Map(
  sections.flatMap((section) =>
    section.visibleWhen
      ? Object.values(section.controls).map(
          (control) => [control.target, section.visibleWhen] as const,
        )
      : [],
  ),
);

async function openStudio(page: Page): Promise<void> {
  await page.goto("/");
  await waitForRabiSoundReady(page);
  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.count()) await pause.click();
}

async function readValues(page: Page): Promise<Record<string, unknown>> {
  const signature = await page
    .locator(RABI_SOUND_PRODUCT_SELECTOR)
    .getAttribute("data-rabi-sound-state-signature");
  if (!signature) throw new Error("Rabi Sound did not expose its product-state signature.");
  return JSON.parse(signature) as Record<string, unknown>;
}

async function readProductSignature(page: Page): Promise<string> {
  return (await page.locator(RABI_SOUND_PRODUCT_SELECTOR).getAttribute(
    "data-rabi-sound-state-signature",
  )) ?? "";
}

async function positionSliderForProtectedDrag(page: Page, target: string): Promise<void> {
  const field = await getToolcraftControlFieldByTarget(page, target);
  const control = controlsByTarget.get(target);
  const minimum = control?.min ?? 0;
  const maximum = control?.max ?? 100;
  const rawValue = control?.type === "logSlider"
    ? Math.exp(Math.log(Math.max(0.0001, minimum)) + 0.15 * (
        Math.log(maximum) - Math.log(Math.max(0.0001, minimum))
      ))
    : minimum + (maximum - minimum) * 0.15;
  const step = control?.step ?? 1;
  const startValue = control?.type === "logSlider"
    ? rawValue
    : minimum + Math.round((rawValue - minimum) / step) * step;
  const label = String(control?.label ?? target);
  const editButton = field.getByRole("button", {
    name: `Edit ${label} value`,
    exact: true,
  });
  if (control?.type === "logSlider") {
    const editor = field.getByRole("spinbutton", {
      name: `${label} value`,
      exact: true,
    });
    await editor.fill(String(startValue));
    await editor.press("Tab");
  } else {
    await editButton.click();
    const editor = field.getByRole("textbox", {
      name: `${label} value`,
      exact: true,
    });
    await editor.fill(String(startValue));
    await editor.press("Enter");
  }
  await page.waitForTimeout(250);
}

async function prepareTargetSection(page: Page, target: string): Promise<void> {
  const condition = sectionConditionByTarget.get(target);
  if (!condition) return;
  const values = await readValues(page);
  if (String(values[condition.target]) === String(condition.equals)) return;
  if (condition.target === targets.layerKind) {
    const stack = await getToolcraftControlFieldByTarget(page, targets.selectedLayerId);
    await stack
      .getByRole("button", {
        name: condition.equals === "noise" ? "Noise" : "Tone",
        exact: true,
      })
      .click();
    return;
  }
  const gate = await getToolcraftControlFieldByTarget(page, condition.target);
  await setRabiSoundControlValue(gate, page, condition.equals);
}

async function setExplicitControlValue(
  page: Page,
  target: string,
  value: unknown,
): Promise<void> {
  await prepareTargetSection(page, target);
  const field = await getToolcraftControlFieldByTarget(page, target);
  const control = controlsByTarget.get(target);
  const group = field.getByRole("group").first();
  if (await group.count()) {
    const option = control?.options?.find((item) => String(item.value) === String(value));
    await group
      .getByRole("button", { name: option?.label ?? String(value), exact: true })
      .click();
    return;
  }
  const combobox = field.getByRole("combobox").first();
  if (await combobox.count()) {
    const index = control?.options?.findIndex((option) => String(option.value) === String(value)) ?? -1;
    if (index < 0) throw new Error(`No select option ${String(value)} for ${target}.`);
    await selectRabiSoundOptionByIndex(field, page, index);
    return;
  }
  await setRabiSoundControlValue(field, page, value);
}

async function readPackShape(page: Page): Promise<{
  durationMs: number;
  layerCount: number;
}> {
  const values = await readValues(page);
  const pack = values[targets.pack] as Parameters<typeof getActiveSound>[0];
  const sound = getActiveSound(pack);
  return {
    durationMs:
      values[targets.durationMode] === "trim"
        ? Number(values[targets.trimEndMs])
        : 0,
    layerCount: sound.layers.length,
  };
}

async function prepareLayerCount(page: Page, count: number): Promise<void> {
  let shape = await readPackShape(page);
  const generationBefore = Number(
    await page.locator(RABI_SOUND_OUTPUT_SELECTOR).getAttribute("data-rabi-sound-render-generation"),
  );
  const stack = await getToolcraftControlFieldByTarget(page, targets.selectedLayerId);
  const addTone = stack.getByRole("button", { name: "Tone", exact: true });
  while (shape.layerCount < count) {
    await addTone.click();
    shape = await readPackShape(page);
  }
  if (shape.layerCount > 3) {
    await expect.poll(async () => {
      const output = page.locator(RABI_SOUND_OUTPUT_SELECTOR);
      const generation = Number(await output.getAttribute("data-rabi-sound-render-generation"));
      const ready = (await output.getAttribute("data-rabi-sound-render-state")) === "ready";
      return ready && generation > generationBefore;
    }, { timeout: 10_000 }).toBe(true);
  }
}

async function prepareMaximumRecipe(page: Page): Promise<void> {
  await prepareLayerCount(page, 16);
  await setExplicitControlValue(page, targets.durationMode, "trim");
  const trim = await getToolcraftControlFieldByTarget(page, targets.trimEndMs);
  await trim.getByRole("slider").press("End");
  await waitForRabiSoundReady(page);
  await expect.poll(() => readPackShape(page)).toEqual({ durationMs: 5_000, layerCount: 16 });
}

async function applyScenarioFixtures(page: Page, scenarioId: string): Promise<void> {
  const scenario = appPerformance.scenarios.find((entry) => entry.id === scenarioId)!;
  if (scenario.stressFixture) {
    let expected: unknown;
    await applyToolcraftPerformanceStressValue(appPerformance, scenarioId, {
      applyValue: async (value) => {
        expected = value;
        if (
          typeof value === "object" &&
          value !== null &&
          "selectedValue" in value &&
          scenario.target
        ) {
          await setExplicitControlValue(
            page,
            scenario.target,
            (value as { selectedValue: unknown }).selectedValue,
          );
        } else {
          await prepareMaximumRecipe(page);
        }
      },
      observeValue: async () => {
        if (
          typeof expected === "object" &&
          expected !== null &&
          "selectedValue" in expected &&
          scenario.target
        ) {
          const values = await readValues(page);
          return { selectedValue: String(values[scenario.target]) };
        }
        await expect(readPackShape(page)).resolves.toEqual({ durationMs: 5_000, layerCount: 16 });
        return expected;
      },
    });
  }

  if (scenario.workloadFixture) {
    let expected: unknown;
    await applyToolcraftPerformanceWorkloadValue(appPerformance, scenarioId, {
      applyValue: async (value) => {
        expected = value;
        await prepareMaximumRecipe(page);
      },
      observeValue: async () => {
        await expect(readPackShape(page)).resolves.toEqual({ durationMs: 5_000, layerCount: 16 });
        return expected;
      },
    });
  }
}

async function measureControlScenario(page: Page, scenarioId: string) {
  const scenario = appPerformance.scenarios.find((entry) => entry.id === scenarioId)!;
  const target = scenario.target!;
  await prepareTargetSection(page, target);
  const field = await getToolcraftControlFieldByTarget(page, target);
  if (target === targets.pack) {
    await field.getByRole("button", { name: /^Duplicate / }).first().click();
  }
  if (scenario.interaction === "control-drag") {
    await positionSliderForProtectedDrag(page, target);
  }
  const result = await measureToolcraftInteraction(
    page,
    async () => {
      if (scenario.interaction === "control-drag") {
        await dragToolcraftSliderByTarget(page, target, 0.85, { scenarioId });
        return;
      }
      if (target === "actions.preset") {
        await field.getByRole("button", { name: "Randomize", exact: true }).click();
        return;
      }
      if (target === targets.pack) {
        await field.getByRole("button", { name: /^Move .* down$/ }).first().click();
        return;
      }
      const options = controlsByTarget.get(target)?.options ?? [];
      if (options.length > 1 && await field.getByRole("combobox").count()) {
        const values = await readValues(page);
        const nextIndex = options.findIndex(
          (option) => String(option.value) !== String(values[target]),
        );
        await selectRabiSoundOptionByIndex(field, page, nextIndex);
      } else {
        await interactWithRabiSoundControl(field, page, target, options);
      }
    },
    {
      observeOutcome: () => readProductSignature(page),
      outcomeTimeoutMs: 5_000,
      scenarioId,
      settleFrames: 1,
      target,
    },
  );
  await expectToolcraftScenarioPerformanceBudget(result, appPerformance, scenarioId);
  await applyScenarioFixtures(page, scenarioId);
}

async function measurePreviewScenario(page: Page, scenarioId: string, layerCount: number) {
  const scenario = appPerformance.scenarios.find((entry) => entry.id === scenarioId)!;
  if (scenario.stressFixture) await applyScenarioFixtures(page, scenarioId);
  else await prepareLayerCount(page, layerCount);
  const generationBefore = Number(
    await page.locator(RABI_SOUND_OUTPUT_SELECTOR).getAttribute("data-rabi-sound-render-generation"),
  );
  const observeReadyGeneration = async () => {
    const output = page.locator(RABI_SOUND_OUTPUT_SELECTOR);
    const isReady = (await output.getAttribute("data-rabi-sound-render-state")) === "ready";
    return isReady
      ? Number(await output.getAttribute("data-rabi-sound-render-generation"))
      : generationBefore;
  };
  const gain = await getToolcraftControlFieldByTarget(page, targets.layerGainDb);
  const result = await measureToolcraftInteraction(
    page,
    () => gain.getByRole("slider").press("ArrowRight"),
    {
      observeOutcome: observeReadyGeneration,
      outcomeTimeoutMs: 5_000,
      scenarioId,
      settleFrames: 1,
      target: scenario.target,
    },
  );
  await expectToolcraftScenarioPerformanceBudget(result, appPerformance, scenarioId);
}

for (const scenario of appPerformance.scenarios.filter((entry) => entry.browser)) {
  test(scenario.browserTestName, async ({ page }) => {
    await openStudio(page);

    if (scenario.id === "preview-typical-eight-layers") {
      await measurePreviewScenario(page, scenario.id, 8);
      return;
    }
    if (scenario.id === "preview-maximum-sixteen-layers") {
      await measurePreviewScenario(page, scenario.id, 16);
      return;
    }
    if (scenario.id === "viewport-stability") {
      const result = await expectToolcraftCanvasViewportStable(
        page,
        async () => {
          const gain = await getToolcraftControlFieldByTarget(page, targets.masterGainDb);
          await gain.getByRole("slider").press("ArrowLeft");
        },
        { scenarioId: scenario.id, target: scenario.target },
      );
      await expectToolcraftScenarioPerformanceBudget(result, appPerformance, scenario.id);
      return;
    }
    if (scenario.id === "viewport-zoom-stress") {
      await applyScenarioFixtures(page, scenario.id);
      const result = await measureToolcraftInteraction(
        page,
        () => zoomToolcraftCanvasViewport(page, 2, { scenarioId: scenario.id }),
        { scenarioId: scenario.id, target: scenario.target },
      );
      await expectToolcraftScenarioPerformanceBudget(result, appPerformance, scenario.id);
      return;
    }
    if (scenario.id === "timeline-playback") {
      const pause = page.getByRole("button", { name: "Pause playback" });
      if (await pause.count()) await pause.click();
      const result = await measureToolcraftInteraction(
        page,
        () => page.getByRole("button", { name: "Play playback" }).click(),
        {
          observeOutcome: async () =>
            page.locator(RABI_SOUND_OUTPUT_SELECTOR).getAttribute("data-rabi-sound-timeline-playing"),
          scenarioId: scenario.id,
          target: scenario.target,
        },
      );
      await expectToolcraftScenarioPerformanceBudget(result, appPerformance, scenario.id);
      return;
    }
    if (scenario.id === "timeline-scrub") {
      const extended = await getToolcraftControlFieldByTarget(page, "panels.timeline.extended");
      await setRabiSoundControlValue(extended, page, true);
      const result = await measureToolcraftInteraction(
        page,
        () => page.getByRole("slider", { name: "Playback position" }).press("End"),
        {
          observeOutcome: async () =>
            page.locator(RABI_SOUND_OUTPUT_SELECTOR).getAttribute("data-rabi-sound-timeline-time"),
          scenarioId: scenario.id,
          target: scenario.target,
        },
      );
      await expectToolcraftScenarioPerformanceBudget(result, appPerformance, scenario.id);
      return;
    }
    if (scenario.id === "export-wav") {
      await prepareMaximumRecipe(page);
      await setExplicitControlValue(page, targets.sampleRate, "48000");
      await setExplicitControlValue(page, targets.bitDepth, "24");
      await setExplicitControlValue(page, targets.channels, "2");
      const { result } = await measureToolcraftDownloadActionByLabel(page, "Export WAV", {
        scenarioId: scenario.id,
        target: scenario.target,
      });
      await expectToolcraftScenarioPerformanceBudget(result, appPerformance, scenario.id);
      return;
    }

    await measureControlScenario(page, scenario.id);
  });
}
