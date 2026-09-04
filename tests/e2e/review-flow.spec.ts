import { test, expect } from "@playwright/test";
import {
  createPendingJustification,
  deleteJustification,
  disconnect,
  SUPERVISOR_EMAIL,
  E2E_PASSWORD,
} from "./fixtures";

let justificationId: string;

test.beforeAll(async () => {
  const created = await createPendingJustification();
  justificationId = created.id;
});

test.afterAll(async () => {
  await deleteJustification(justificationId);
  await disconnect();
});

test("supervisor: review a pending justification and see the audit entry", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(SUPERVISOR_EMAIL);
  await page.getByLabel("كلمة المرور").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /دخول/ }).click();
  await page.waitForURL(/\/supervisor/);

  await expect(page.getByText("عذر طبي - اختبار آلي")).toBeVisible({ timeout: 5000 });

  const card = page.locator("li", { hasText: "عذر طبي - اختبار آلي" });
  await card.getByRole("button", { name: "قبول" }).click();

  await expect(page.getByText("عذر طبي - اختبار آلي")).not.toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "سجل التدقيق" }).click();
  await expect(page.getByText("JUSTIFICATION_APPROVED").first()).toBeVisible({ timeout: 5000 });
});
