import { expect, type Locator, type Page } from "@playwright/test";

import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";

export const RABI_SOUND_OUTPUT_SELECTOR = "[data-rabi-sound-waveform]";
export const RABI_SOUND_PRODUCT_SELECTOR = "[data-rabi-sound-product-state]";

type RabiSoundOption = { label?: string; value: unknown };

export async function waitForRabiSoundReady(page: Page): Promise<void> {
  await expect(page.locator(RABI_SOUND_OUTPUT_SELECTOR)).toHaveAttribute(
    "data-rabi-sound-render-state",
    "ready",
    { timeout: 10_000 },
  );
}

async function chooseDifferentOption(control: Locator, page: Page): Promise<void> {
  const combobox = control.getByRole("combobox").first();
  const current = (await combobox.textContent())?.trim();
  await combobox.click();
  const items = page.locator('[data-slot="select-item"]:visible');
  await expect(items.first()).toBeVisible();
  const count = await items.count();
  for (let index = 0; index < count; index += 1) {
    const item = items.nth(index);
    if ((await item.textContent())?.trim() !== current) {
      await item.click();
      return;
    }
  }

  throw new Error("The select control has no alternate visible option.");
}

export async function selectRabiSoundOptionByIndex(
  control: Locator,
  page: Page,
  index: number,
): Promise<void> {
  const combobox = control.getByRole("combobox").first();
  await combobox.click();
  const items = page.locator('[data-slot="select-item"]:visible');
  await expect(items.nth(index)).toBeVisible();
  await items.nth(index).click();
}

export function hashBytes(bytes: Uint8Array): string {
  let hash = 2166136261;
  for (const byte of bytes) {
    hash = Math.imul(hash ^ byte, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export async function setRabiSoundControlValue(
  control: Locator,
  page: Page,
  value: unknown,
): Promise<void> {
  const switchControl = control.getByRole("switch").first();
  if (await switchControl.count()) {
    if ((await switchControl.isChecked()) !== Boolean(value)) await switchControl.click();
    return;
  }

  const group = control.getByRole("group").first();
  if (await group.count()) {
    const button = group.getByRole("button", { name: String(value), exact: true });
    await button.click();
    return;
  }

  const combobox = control.getByRole("combobox").first();
  if (await combobox.count()) {
    await combobox.click();
    await page.getByRole("option", { name: String(value), exact: true }).click();
    return;
  }

  throw new Error(`Cannot set the gating control to ${String(value)}.`);
}

export async function interactWithRabiSoundControl(
  control: Locator,
  page: Page,
  target: string,
  options: readonly RabiSoundOption[] = [],
): Promise<void> {
  if (target === "editor.layer.startMs") {
    await control.getByRole("button", { name: "Edit Offset value", exact: true }).click();
    const editor = control.getByRole("textbox", { name: "Offset value", exact: true });
    await editor.fill("120");
    await editor.press("Enter");
    return;
  }
  if (target === "workspace.pack") {
    await control.getByRole("button", { name: /^Duplicate / }).first().click();
    return;
  }
  if (target === "editor.selectedLayerId") {
    const layerButtons = control.getByRole("button").filter({ hasText: /tone|noise/i });
    const count = await layerButtons.count();
    for (let index = 0; index < count; index += 1) {
      const button = layerButtons.nth(index);
      if ((await button.getAttribute("aria-pressed")) !== "true") {
        await button.click();
        return;
      }
    }
  }
  if (target === "actions.preset") {
    const preset = await getToolcraftControlFieldByTarget(page, "editor.presetId");
    await chooseDifferentOption(preset, page);
    await control.getByRole("button", { name: "Use preset", exact: true }).click();
    return;
  }

  const slider = control.getByRole("slider").first();
  if (await slider.count()) {
    const value = Number(await slider.getAttribute("aria-valuenow"));
    const max = Number(await slider.getAttribute("aria-valuemax"));
    await slider.press(Number.isFinite(value) && value >= max ? "ArrowLeft" : "ArrowRight");
    return;
  }

  const switchControl = control.getByRole("switch").first();
  if (await switchControl.count()) {
    await switchControl.click();
    return;
  }

  const combobox = control.getByRole("combobox").first();
  if (await combobox.count()) {
    if (options.length > 1) {
      const signature = await page
        .locator(RABI_SOUND_PRODUCT_SELECTOR)
        .getAttribute("data-rabi-sound-state-signature");
      const current = signature
        ? (JSON.parse(signature) as Record<string, unknown>)[target]
        : undefined;
      const nextIndex = options.findIndex((option) => String(option.value) !== String(current));
      if (nextIndex >= 0) {
        await selectRabiSoundOptionByIndex(control, page, nextIndex);
        return;
      }
    }
    await chooseDifferentOption(control, page);
    return;
  }

  const textbox = control.getByRole("textbox").first();
  if (await textbox.count()) {
    const current = await textbox.inputValue();
    const next = target === "appearance.background" ? "#24304a" : `${current} edited`;
    await textbox.fill(next);
    await textbox.press("Enter");
    return;
  }

  const buttons = control.getByRole("button");
  if (await buttons.count()) {
    const count = await buttons.count();
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      if ((await button.getAttribute("aria-pressed")) !== "true" && await button.isEnabled()) {
        await button.click();
        return;
      }
    }
  }

  throw new Error(`No supported visible interaction found for ${target}.`);
}

export async function readDownloadBytes(page: Page, buttonLabel: string): Promise<Uint8Array> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: buttonLabel, exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(new Uint8Array(chunk));
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function inspectWav(bytes: Uint8Array): {
  byteLength: number;
  contentHash: string;
  mediaType: string;
} {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  expect(ascii(0, 4)).toBe("RIFF");
  expect(ascii(8, 12)).toBe("WAVE");
  return {
    byteLength: bytes.byteLength,
    contentHash: hashBytes(bytes),
    mediaType: "audio/wav",
  };
}
