// Replays every beat of frontend/public/demo.html in headless Chromium and reports, per beat, a tap
// target missing before the beat applies and any element spilling past the screen's width, then
// screenshots the device after each listed beat.
//
// Usage, from a copy of this file in a folder holding playwright-core, with the Chromium build
// Playwright caches:
//   node verify_replay.js <demo.html> <screenshot dir> [beat indexes...]
const { chromium } = require("playwright-core");
const [demo, outDir, ...shots] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("file://" + demo);
  const replayTo = (i, inclusive) => page.evaluate(([i, inclusive]) => {
    token += 1; resetState();
    for (let k = 0; k < i + (inclusive ? 1 : 0); k++) applyInstant(BEATS[k]);
  }, [i, inclusive]);
  const beats = await page.evaluate(() => BEATS.length);
  for (let i = 0; i < beats; i++) {
    await replayTo(i, false);
    const tapMissing = await page.evaluate((i) => {
      const tap = BEATS[i].tap;
      return tap !== undefined && !document.querySelector('#screen [data-t="' + tap + '"]');
    }, i);
    await replayTo(i, true);
    const spills = await page.evaluate(() => {
      const screen = document.getElementById("screen").getBoundingClientRect();
      return [...document.querySelectorAll("#screen *")].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && !e.closest(".table-wrap") && (r.left < screen.left - 1 || r.right > screen.right + 1);
      }).map((e) => e.className || e.tagName).slice(0, 3);
    });
    if (tapMissing || spills.length) console.log(`beat ${i}:`, { tapMissing, spills });
  }
  for (const i of shots.map(Number)) {
    await replayTo(i, true);
    await page.evaluate((i) => { if (BEATS[i].scroll) scrollTo(BEATS[i].scroll); }, i);
    await page.waitForTimeout(700);
    await page.locator("#viewport").screenshot({ path: `${outDir}/beat${i}.png` });
  }
  console.log(`${beats} beats replayed; page errors: ${JSON.stringify(errors)}`);
  await browser.close();
})();
