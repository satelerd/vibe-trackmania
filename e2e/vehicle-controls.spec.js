import { test, expect } from "@playwright/test";

async function readDebug(page) {
  const data = await page.evaluate(() => window.__VIBETRACK_DEBUG__ ?? null);
  if (!data) {
    throw new Error("debug snapshot unavailable");
  }
  return data;
}

async function waitGameReady(page, path = "/") {
  await page.goto(path);
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.keyboard.down(key);
    try {
      await expect
        .poll(async () => (await readDebug(page)).phase, {
          timeout: 12_000
        })
        .toBe("running");
      return;
    } catch (error) {
      await page.keyboard.up(key);
      if (attempt === 1) {
        throw error;
      }
      await page.waitForTimeout(120);
    }
  }
}

async function collectTelemetryWindow(page, durationMs, intervalMs = 100) {
  const samples = [];
  const steps = Math.max(1, Math.ceil(durationMs / intervalMs));

  for (let index = 0; index < steps; index += 1) {
    await page.waitForTimeout(intervalMs);
    samples.push(await readDebug(page));
  }

  return samples;
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
  expect(duringCountdown.position[2]).toBeLessThan(start.position[2] + 0.6);
});

test("car accelerates when throttle is pressed", async ({ page }) => {
  const start = await readDebug(page);

  await holdUntilRunning(page, "w");
  await page.waitForTimeout(1200);
  const duringThrottle = await readDebug(page);
  await page.keyboard.up("w");

  expect(duringThrottle.phase).toBe("running");
  expect(duringThrottle.speedKmh).toBeGreaterThan(4);
  expect(duringThrottle.position[2]).toBeGreaterThan(start.position[2] + 0.4);
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
  expect(reversing.speedKmh).toBeGreaterThan(0.05);
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

test("medium quality preset boots and remains drivable", async ({ page }) => {
  await waitGameReady(page, "/?quality=medium");

  const mediumState = await readDebug(page);
  expect(mediumState.quality).toBe("medium");

  await holdUntilRunning(page, "w");
  await page.waitForTimeout(900);
  const moving = await readDebug(page);
  await page.keyboard.up("w");

  expect(moving.phase).toBe("running");
  expect(moving.speedKmh).toBeGreaterThan(3);
});

test("stunt jump launches and lands when respawning before jump", async ({ page }) => {
  await holdUntilRunning(page, "w");
  await page.evaluate(() => window.__VIBETRACK_TEST_API__?.respawnAtCheckpoint(2, 120));

  const start = await readDebug(page);
  const samples = await collectTelemetryWindow(page, 4200, 120);
  await page.keyboard.up("w");

  const maxY = Math.max(...samples.map((sample) => sample.position[1]));
  const maxSpeed = Math.max(...samples.map((sample) => sample.speedKmh));
  const endY = samples[samples.length - 1].position[1];

  expect(maxY).toBeGreaterThan(start.position[1] + 2.4);
  expect(endY).toBeLessThan(maxY - 1.4);
  expect(maxSpeed).toBeGreaterThan(35);
});

test("stunt loop section climbs with sustained speed", async ({ page }) => {
  await holdUntilRunning(page, "w");
  await page.evaluate(() => window.__VIBETRACK_TEST_API__?.respawnAtCheckpoint(3, 205));

  const start = await readDebug(page);
  const samples = await collectTelemetryWindow(page, 12000, 120);
  await page.keyboard.up("w");

  const maxY = Math.max(...samples.map((sample) => sample.position[1]));
  const maxSpeed = Math.max(...samples.map((sample) => sample.speedKmh));

  expect(maxY).toBeGreaterThan(start.position[1] + 8);
  expect(maxSpeed).toBeGreaterThan(45);
});
