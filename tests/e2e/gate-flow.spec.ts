import { test, expect } from "@playwright/test";
import { GATE_EMAIL, E2E_PASSWORD } from "./fixtures";

test("gate: search a student, see today's timeline and decision, issue an entry slip", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(GATE_EMAIL);
  await page.getByLabel("كلمة المرور").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /دخول/ }).click();
  await page.waitForURL(/\/gate/);

  await page.getByPlaceholder(/ابحث بالاسم/).fill("E2E1");
  await expect(page.getByText(/E2E-TEST · E2E1/)).toBeVisible({ timeout: 5000 });
  await page.getByText(/E2E-TEST · E2E1/).click();

  // Student profile + decision recommendation must render.
  await expect(page.getByText(/نقاط السلوك/)).toBeVisible();
  await expect(page.getByText(/مسموح تلقائياً|يتطلب مراجعة الإدارة|دخول ممنوع/)).toBeVisible();

  await page.getByRole("button", { name: "إصدار تصريح الدخول" }).click();
  await expect(page.getByText(/تم إصدار التصريح/)).toBeVisible({ timeout: 10000 });
});
