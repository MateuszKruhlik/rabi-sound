import { expect, test } from "@playwright/test";

import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import {
  RABI_SOUND_OUTPUT_SELECTOR,
  setRabiSoundControlValue,
  waitForRabiSoundReady,
} from "./rabi-sound-browser-helpers";

test("audio workspace is full bleed and omits visual export controls", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("appearance.theme.v1", "light");
  });
  await page.goto("/");
  await waitForRabiSoundReady(page);
  await expect(page).toHaveTitle("Rabi Sound");

  await expect(page.getByText("Aspect ratio", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Canvas width", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Canvas height", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Background", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Image Export", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Video Export", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export PNG", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export Video", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Light theme", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dark theme", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-toolcraft-theme-scope]")).toHaveAttribute(
    "data-toolcraft-theme",
    "dark",
  );
  await expect(page.locator('[data-rabi-sound-waveform] [data-label="RABI / SOUND"]')).toBeVisible();
  await expect(
    page.locator(
      '[data-rabi-sound-waveform] [data-label="Built on Cuelume by Daniel Belyi"]',
    ),
  ).toBeVisible();

  const viewport = page.getByRole("application", { name: "Canvas viewport" });
  const output = page.locator(RABI_SOUND_OUTPUT_SELECTOR);
  const workspace = page.locator("[data-rabi-sound-canvas-root]");
  await expect(output).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const viewportBox = await viewport.boundingBox();
  const workspaceBox = await workspace.boundingBox();
  expect(viewportBox).not.toBeNull();
  expect(workspaceBox).not.toBeNull();
  expect(workspaceBox!.x).toBeLessThanOrEqual(viewportBox!.x);
  expect(workspaceBox!.y).toBeLessThanOrEqual(viewportBox!.y);
  expect(workspaceBox!.x + workspaceBox!.width).toBeGreaterThanOrEqual(
    viewportBox!.x + viewportBox!.width,
  );
  expect(workspaceBox!.y + workspaceBox!.height).toBeGreaterThanOrEqual(
    viewportBox!.y + viewportBox!.height,
  );
  await expect(workspace).toHaveCSS("background-color", "rgb(11, 12, 15)");
});

test("waveform stage stays clear of the floating Inspector", async ({ page }) => {
  for (const viewport of [
    { height: 900, width: 1_400 },
    { height: 760, width: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await waitForRabiSoundReady(page);

    const previewStage = page.locator("[data-rabi-sound-preview-stage]");
    const inspector = page.locator(
      '[data-panel-type="controls"][data-slot="toolcraft-runtime-panel-host"]',
    );
    const previewBox = await previewStage.boundingBox();
    const inspectorBox = await inspector.boundingBox();

    expect(previewBox).not.toBeNull();
    expect(inspectorBox).not.toBeNull();
    expect(previewBox!.x + previewBox!.width).toBeLessThanOrEqual(inspectorBox!.x - 8);
  }
});

test("loop keeps the Web Audio source active across repeated cycles", async ({ page }) => {
  await page.goto("/");
  await waitForRabiSoundReady(page);

  const pause = page.getByRole("button", { name: "Pause playback", exact: true });
  if (await pause.count()) await pause.click();

  const timelineSwitch = await getToolcraftControlFieldByTarget(
    page,
    "panels.timeline.extended",
  );
  await setRabiSoundControlValue(timelineSwitch, page, true);

  const enableLoop = page.getByRole("button", { name: "Enable loop", exact: true });
  if (await enableLoop.count()) await enableLoop.click();
  await expect(page.getByRole("button", { name: "Disable loop", exact: true })).toBeVisible();

  await page.getByRole("slider", { name: "Playback position" }).press("Home");
  const output = page.locator(RABI_SOUND_OUTPUT_SELECTOR);
  const durationSeconds = Number(await output.getAttribute("data-rabi-sound-timeline-duration"));
  await page.getByRole("button", { name: "Play playback", exact: true }).click();

  await expect(output).toHaveAttribute("data-rabi-sound-audio-active", "true");
  await expect(output).toHaveAttribute("data-rabi-sound-audio-looping", "true");
  const sourceStartCount = Number(
    await output.getAttribute("data-rabi-sound-audio-start-count"),
  );
  expect(sourceStartCount).toBeGreaterThan(0);
  await page.waitForTimeout(Math.max(900, Math.ceil(durationSeconds * 2_500)));
  await expect(output).toHaveAttribute("data-rabi-sound-audio-active", "true");
  await expect(output).toHaveAttribute("data-rabi-sound-audio-looping", "true");
  expect(Number(await output.getAttribute("data-rabi-sound-audio-start-count"))).toBe(
    sourceStartCount,
  );

  await page.getByRole("button", { name: "Pause playback", exact: true }).click();
  await expect(output).toHaveAttribute("data-rabi-sound-audio-active", "false");
});
