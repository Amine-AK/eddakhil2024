import { test, expect } from "@playwright/test";
import { activateE2EPeriod, cleanupE2EPeriod, getAttendanceEventCount, disconnect, E2E_TEACHER_EMAIL, E2E_PASSWORD } from "./fixtures";

let scheduleId: string | null = null;

test.beforeAll(async () => {
  const activated = await activateE2EPeriod();
  scheduleId = activated?.scheduleId ?? null;
});

test.afterAll(async () => {
  if (scheduleId) await cleanupE2EPeriod(scheduleId);
  await disconnect();
});

test("teacher can mark attendance while offline, and it syncs once back online", async ({ page, context }) => {
  test.skip(scheduleId === null, "No period is currently active in real time; nothing to test right now.");

  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(E2E_TEACHER_EMAIL);
  await page.getByLabel("كلمة المرور").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /دخول/ }).click();
  await page.waitForURL(/\/teacher/);

  await expect(page.getByRole("button", { name: "غائب" }).first()).toBeVisible();
  await page.getByRole("button", { name: "غائب" }).first().click();

  await context.setOffline(true);
  await page.getByRole("button", { name: "حفظ الحضور" }).click();

  // Queued locally, not lost — but genuinely not sent while offline.
  await expect(page.getByText("بانتظار الاتصال بالشبكة")).toBeVisible({ timeout: 5000 });
  expect(await getAttendanceEventCount(scheduleId!)).toBe(0);

  await context.setOffline(false);

  await expect(page.getByText("تمت المزامنة")).toBeVisible({ timeout: 15000 });
  expect(await getAttendanceEventCount(scheduleId!)).toBeGreaterThan(0);
});
