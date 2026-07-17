import { expect, firefox, test, webkit } from "@playwright/test";

test("cross-browser smoke: Firefox and WebKit render, play and export WAV", async ({}, testInfo) => {
  test.skip(process.env.RABI_SOUND_CROSS_BROWSER !== "1", "Run with npm run test:browser:smoke.");
  const baseURL = String(testInfo.project.use.baseURL);

  for (const [name, browserType] of [["Firefox", firefox], ["WebKit", webkit]] as const) {
    const browser = await browserType.launch();
    const page = await browser.newPage();
    await page.goto(baseURL);
    const waveform = page.locator("[data-rabi-sound-waveform]");
    await expect(waveform, `${name} should render the waveform`).toHaveAttribute(
      "data-rabi-sound-render-state",
      "ready",
    );

    const pause = page.getByRole("button", { name: "Pause playback" });
    if (await pause.count()) await pause.click();
    const play = page.getByRole("button", { name: "Play playback" });
    await play.click();
    await expect(waveform).toHaveAttribute("data-rabi-sound-timeline-playing", "true");
    await page.getByRole("button", { name: "Pause playback" }).click();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export WAV", exact: true }).click(),
    ]);
    const stream = await download.createReadStream();
    const firstChunk = await new Promise<Buffer>((resolve, reject) => {
      stream.once("data", resolve);
      stream.once("error", reject);
    });
    expect(firstChunk.subarray(0, 4).toString("ascii")).toBe("RIFF");
    await browser.close();
  }
});
