const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const { chromium, webkit } = require("playwright");

const assetDir =
  process.env.ACCOUNT_ASSET_DIR ||
  path.resolve(__dirname, "../internal/relay/assets");
const engines = process.env.BROWSER
  ? [process.env.BROWSER]
  : ["chromium", "webkit"];
const username = "FullCupUserWithALongUnbrokenAccountNameForMobileScreens";
for (const engine of engines)
  for (const width of [320, 390, 1280])
    test(`account ${engine} ${width}px: FullCupAI sign-in and multiple devices`, async (t) => {
      const browser = await { chromium, webkit }[engine].launch();
      t.after(() => browser.close());
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        locale: "zh-CN",
      });
      const page = await context.newPage();
      const errors = [],
        mutations = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let authenticated = false;
      const devices = [
        { id: "a".repeat(32), name: "Office Mac", online: true, user_id: 27 },
        { id: "b".repeat(32), name: "Home PC", online: false, user_id: 27 },
      ];
      await page.route("http://127.0.0.1:48123/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        const reply = (status, value) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(value),
          });
        if (url.pathname.startsWith("/api/account")) {
          if (url.pathname === "/api/account/login") {
            assert.equal(request.headers()["x-remote-request"], "1");
            const body = request.postDataJSON();
            if (!body.temp_token) {
              assert.deepEqual(body, {
                email: "person@example.test",
                password: "test-password-private",
              });
              return reply(200, {
                requires_2fa: true,
                temp_token: "test-factor-private",
                user_email_masked: "p***@example.test",
              });
            }
            assert.deepEqual(body, {
              temp_token: "test-factor-private",
              code: "123456",
            });
            authenticated = true;
            return reply(200, { authenticated: true });
          }
          if (url.pathname === "/api/account/logout") {
            authenticated = false;
            return route.fulfill({ status: 204 });
          }
          if (!authenticated)
            return reply(401, { error: "Sign in with your FullCupAI account" });
          if (url.pathname === "/api/account/device") {
            const body = request.postDataJSON(),
              device = devices.find((value) => value.id === body.id);
            assert(device, "mutated an unknown device");
            mutations.push(body);
            if (body.revoke) device.revoked = true;
            else device.name = body.name;
            return reply(200, { saved: true });
          }
          return reply(200, {
            user: {
              id: 27,
              username,
              email: "person@example.test",
            },
            devices,
            current_device: { id: "c".repeat(32), user_id: 0 },
          });
        }
        const file =
          url.pathname === "/account"
            ? "account.html"
            : path.basename(url.pathname);
        if (!["account.html", "account.js", "account.css", "icon.svg"].includes(file))
          return route.fulfill({ status: 404 });
        await route.fulfill({
          status: 200,
          contentType: file.endsWith(".js")
            ? "text/javascript"
            : file.endsWith(".css")
              ? "text/css"
              : file.endsWith(".svg")
                ? "image/svg+xml"
                : "text/html",
          body: await fs.readFile(path.join(assetDir, file)),
        });
      });
      await page.goto("http://127.0.0.1:48123/account");
      await page
        .getByLabel("邮箱", { exact: true })
        .fill("person@example.test");
      await page
        .getByLabel("密码", { exact: true })
        .fill("test-password-private");
      await page.getByRole("button", { name: "登录", exact: true }).click();
      await page.getByLabel("动态验证码", { exact: true }).fill("123456");
      await page.getByRole("button", { name: "验证并登录" }).click();
      await page.getByText(username, { exact: true }).waitFor();
      assert.equal(await page.locator(".relay-device").count(), 2);
      assert.equal(
        await page
          .getByRole("link", { name: "返回远程会话" })
          .getAttribute("href"),
        "/",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        "account horizontal overflow",
      );
      if (width < 760) {
        const controls = await page
          .locator("button:visible")
          .evaluateAll((buttons) =>
            buttons.map((button) => {
              const bounds = button.getBoundingClientRect();
              return {
                label: button.textContent || button.getAttribute("aria-label"),
                left: bounds.left,
                right: bounds.right,
                height: bounds.height,
              };
            }),
          );
        for (const control of controls) {
          assert(
            control.left >= 0 && control.right <= width,
            `${control.label} is outside the mobile viewport`,
          );
          assert(
            control.height >= 44,
            `${control.label} has a small mobile touch target`,
          );
        }
      }
      if (width === 1280)
        assert(
          (await page.locator(".admin-content").boundingBox()).width > 700,
          "account content occupies a sidebar column",
        );
      const office = page
        .locator(".relay-device")
        .filter({ has: page.locator(`[id="name-${devices[0].id}"]`) });
      await office.getByLabel("设备名称").fill("Work Mac");
      await office.getByRole("button", { name: "保存名称" }).click();
      await page.waitForFunction(
        () =>
          document.querySelector("input[id^='name-']")?.value === "Work Mac",
      );
      await office
        .getByRole("button", { name: "撤销设备", exact: true })
        .click();
      assert.equal(
        mutations.length,
        1,
        "first revoke click mutated device without confirmation",
      );
      await office.getByRole("button", { name: "取消", exact: true }).click();
      await office
        .getByRole("button", { name: "撤销设备", exact: true })
        .click();
      await office
        .getByRole("button", { name: "确认撤销", exact: true })
        .click();
      await office.getByText("已撤销", { exact: true }).waitFor();
      assert.deepEqual(mutations, [
        { id: devices[0].id, name: "Work Mac" },
        { id: devices[0].id, revoke: true },
      ]);
      assert.equal(
        devices[1].revoked,
        undefined,
        "revocation changed another device",
      );
      assert.equal(
        await page.evaluate(() =>
          Object.values(localStorage).some((value) =>
            /test-password-private|test-factor-private/.test(value),
          ),
        ),
        false,
      );
      await page.getByRole("button", { name: "退出登录" }).click();
      await page.getByLabel("密码", { exact: true }).waitFor();
      assert.equal(
        await page.getByLabel("密码", { exact: true }).inputValue(),
        "",
      );
      assert.deepEqual(errors, []);
    });
