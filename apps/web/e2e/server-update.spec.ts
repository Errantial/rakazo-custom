import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, openUserSettings, signup } from "./helpers";

test("server releases need the typed update key and a separate apply action", async ({
  page,
}, testInfo) => {
  let applied = false;
  await page.route("**/api/operator-updates**", async (route) => {
    const request = route.request();
    const action = new URL(request.url()).pathname.split("/").at(-1);
    if (request.method() === "GET") return route.fulfill({ json: { enabled: true } });
    // The key travels in its own header: `Authorization` belongs to app sessions.
    expect(await request.headerValue("x-update-token")).toBe("fake-test-operator-token");
    expect(await request.headerValue("authorization")).toBeNull();
    if (action === "apply") applied = true;
    return route.fulfill({ json: { ok: true, targetTag: "sha-example", upToDate: false } });
  });
  await signup(page, `server-update-${Date.now()}@rakazo.test`, "password12", "Update Tester");
  await completeOnboarding(page);
  await openUserSettings(page, "updates");
  await page.getByText("Server", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Check for updates", exact: true })).toBeDisabled();
  await page.getByLabel("Update token").fill("fake-test-operator-token");
  await page.getByRole("button", { name: "Check for updates", exact: true }).click();
  await expect(page.getByText("sha-example", { exact: true })).toBeVisible();
  expect(applied).toBe(false);
  await captureScreenshot(page, testInfo, "server-update-available");
  await page.getByRole("button", { name: "Update server", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Server updated. Reload to continue.");
  await expect(page.getByLabel("Update token")).toHaveValue("");
  expect(applied).toBe(true);
});
