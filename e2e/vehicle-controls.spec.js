import { test, expect } from "@playwright/test";

async function readDebug(page) {
  const data = await page.evaluate(() => window.__VIBETRACK_DEBUG__ ?? null);
  if (!data) {
    throw new Error("debug snapshot unavailable");
  }
  return data;
}

async function waitGameReady(page) {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__VIBETRACK_DEBUG__)), {
      timeout: 10_000
    })
    .toBe(true);

  await page.keyboard.press("Backspace");
  await page.waitForTimeout(100);
}

async function seedBestSplitsAndReset(page) {
  await page.evaluate(() => {
    localStorage.setItem(
      "vibetrack.bestSplitsMs",
      JSON.stringify([3500, 6800, 9800, 12900, 16200, 19500])
    );
    localStorage.setItem("vibetrack.bestLapMs", "22000");
  });

  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__VIBETRACK_DEBUG__)), {
      timeout: 10_000
    })
    .toBe(true);

  await page.keyboard.press("Backspace");
  await page.waitForTimeout(100);
}

async function holdUntilRunning(page, key) {
  await page.keyboard.down(key);
  await expect
    .poll(async () => (await readDebug(page)).phase, {
      timeout: 10_000
    })
    .toBe("running");
}

test.beforeEach(async ({ page }) => {
  await waitGameReady(page);
});

test("countdown blocks movement before GO", async ({ page }) => {
  const start = await readDebug(page);

  await page.keyboard.down("w");
  await page.waitForTimeout(1200);
  const duringCountdown = await readDebug(page);
  await page.keyboard.up("w");

  expect(duringCountdown.phase).toBe("countdown");
  expect(duringCountdown.speedKmh).toBeLessThan(0.9);
  expect(duringCountdown.position[2]).toBeLessThan(start.position[2] + 0.2);
});

test("car accelerates when throttle is pressed", async ({ page }) => {
  const start = await readDebug(page);

  await holdUntilRunning(page, "w");
  await page.waitForTimeout(950);
  const duringThrottle = await readDebug(page);
  await page.keyboard.up("w");

  expect(duringThrottle.phase).toBe("running");
  expect(duringThrottle.speedKmh).toBeGreaterThan(6);
  expect(duringThrottle.position[2]).toBeGreaterThan(start.position[2] + 0.8);
});

test("A key steers vehicle left", async ({ page }) => {
  await holdUntilRunning(page, "w");
  await page.waitForTimeout(650);

  const beforeTurn = await readDebug(page);

  await page.keyboard.down("a");
  await page.waitForTimeout(780);
  const duringTurn = await readDebug(page);
  await page.keyboard.up("a");

  const afterTurn = await readDebug(page);

  await page.keyboard.up("w");

  expect(duringTurn.phase).toBe("running");
  expect(duringTurn.inputSteer).toBeLessThan(-0.7);
  expect(duringTurn.steeringAngle).toBeGreaterThan(0.03);
  expect(afterTurn.position[0]).toBeGreaterThan(beforeTurn.position[0] + 0.02);
});

test("D key steers vehicle right", async ({ page }) => {
  await holdUntilRunning(page, "w");
  await page.waitForTimeout(650);

  const beforeTurn = await readDebug(page);

  await page.keyboard.down("d");
  await page.waitForTimeout(780);
  const duringTurn = await readDebug(page);
  await page.keyboard.up("d");

  const afterTurn = await readDebug(page);

  await page.keyboard.up("w");

  expect(duringTurn.phase).toBe("running");
  expect(duringTurn.inputSteer).toBeGreaterThan(0.7);
  expect(duringTurn.steeringAngle).toBeLessThan(-0.03);
  expect(afterTurn.position[0]).toBeLessThan(beforeTurn.position[0] - 0.02);
});

test("sustained left curve keeps heading and lateral displacement", async ({ page }) => {
  const start = await readDebug(page);

  await page.keyboard.down("w");
  await page.keyboard.down("a");
  await expect
    .poll(async () => (await readDebug(page)).phase, {
      timeout: 10_000
    })
    .toBe("running");
  await page.waitForTimeout(1700);

  const duringCurve = await readDebug(page);

  await page.keyboard.up("a");
  await page.keyboard.up("w");

  expect(duringCurve.phase).toBe("running");
  expect(duringCurve.inputSteer).toBeLessThan(-0.7);
  expect(duringCurve.steeringAngle).toBeGreaterThan(0.03);
  expect(duringCurve.forward[0]).toBeGreaterThan(start.forward[0] + 0.08);
  expect(duringCurve.position[0]).toBeGreaterThan(start.position[0] + 0.35);
});

test("respawn resets position and speed after movement", async ({ page }) => {
  await holdUntilRunning(page, "w");
  await page.waitForTimeout(1200);
  await page.keyboard.up("w");

  const moved = await readDebug(page);
  expect(moved.position[2]).toBeGreaterThan(1.6);

  await page.keyboard.press("r");
  await page.waitForTimeout(220);

  const afterRespawn = await readDebug(page);
  const moveDistance =
    Math.abs(afterRespawn.position[0] - moved.position[0]) +
    Math.abs(afterRespawn.position[2] - moved.position[2]);

  expect(moveDistance).toBeGreaterThan(2.0);
  expect(afterRespawn.checkpointOrder).toBeLessThanOrEqual(moved.checkpointOrder);
});

test("restart clears attempt state", async ({ page }) => {
  await holdUntilRunning(page, "w");
  await page.waitForTimeout(1600);
  await page.keyboard.up("w");

  await page.keyboard.press("Backspace");
  await expect
    .poll(async () => (await readDebug(page)).phase, {
      timeout: 1_500
    })
    .toBe("idle");

  const afterRestart = await readDebug(page);
  expect(afterRestart.phase).toBe("idle");
  expect(afterRestart.checkpointOrder).toBe(0);
  expect(afterRestart.position[2]).toBeGreaterThan(-2);
  expect(afterRestart.position[2]).toBeLessThan(8);
});

test("split delta updates after checkpoint when best split exists", async ({ page }) => {
  await seedBestSplitsAndReset(page);

  await holdUntilRunning(page, "w");
  await page.waitForTimeout(4200);
  await page.keyboard.up("w");

  await expect(page.locator(".hud-split")).toContainText("Split Δ:");
});

test("S key engages reverse when speed is low", async ({ page }) => {
  const start = await readDebug(page);

  await holdUntilRunning(page, "s");
  await page.waitForTimeout(1200);
  const reversing = await readDebug(page);
  await page.keyboard.up("s");

  expect(reversing.phase).toBe("running");
  expect(reversing.position[2]).toBeLessThan(start.position[2] - 0.2);
  expect(reversing.speedKmh).toBeGreaterThan(1.5);
});

test("S brake ramps progressively instead of instant lock", async ({ page }) => {
  await holdUntilRunning(page, "w");
  await page.waitForTimeout(1500);
  await page.keyboard.up("w");

  const beforeBrake = await readDebug(page);
  expect(beforeBrake.speedKmh).toBeGreaterThan(18);

  await page.keyboard.down("s");
  await page.waitForTimeout(160);
  const shortBrake = await readDebug(page);
  await page.waitForTimeout(900);
  const sustainedBrake = await readDebug(page);
  await page.keyboard.up("s");

  expect(shortBrake.speedKmh).toBeGreaterThan(beforeBrake.speedKmh * 0.35);
  expect(sustainedBrake.speedKmh).toBeLessThan(shortBrake.speedKmh * 0.8);
});
