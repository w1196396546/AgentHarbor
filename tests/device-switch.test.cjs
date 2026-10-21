const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const { chromium, webkit } = require("playwright");
const { crypt } = require("./e2ee-fixture.cjs");
const engines = process.env.BROWSER
  ? [process.env.BROWSER]
  : ["chromium", "webkit"];
for (const engine of engines)
  test(
    engine + ": paired devices retain independent encrypted grants",
    async (t) => {
      const browser = await { chromium, webkit }[engine].launch();
      t.after(() => browser.close());
      const context = await browser.newContext(),
        page = await context.newPage();
      const devices = [
        {
          id: "11".repeat(16),
          secret: "22".repeat(32),
          grantID: "33".repeat(16),
          grant: "44".repeat(32),
          name: "Office Mac",
        },
        {
          id: "aa".repeat(16),
          secret: "bb".repeat(32),
          grantID: "cc".repeat(16),
          grant: "dd".repeat(32),
          name: "Home PC",
        },
      ];
      const expires_at = new Date(Date.now() + 86400000).toISOString(),
        calls = [];
      let legacyReads = 0;
      await context.route("https://device-switch.test/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (url.pathname === "/")
          return route.fulfill({
            body: '<!doctype html><script src="/secure.js"></script>',
            contentType: "text/html",
          });

        if (url.pathname === "/secure.js")
          return route.fulfill({
            body: await fs.readFile(
              path.resolve(__dirname, "../web/src/transport/secure.js"),
            ),
            contentType: "text/javascript",
          });
        if (url.pathname === "/api/device") {
          legacyReads++;
          return route.fulfill({
            json: { id: devices[0].id, name: devices[0].name, online: true },
          });
        }
        const wire = request.postDataJSON();
        if (url.pathname === "/api/pair") {
          const device = devices.find((value) => value.id === wire.device_id);
          assert(device);
          const input = crypt(
            device.secret,
            wire.id,
            "pairing",
            0,
            wire.data,
            true,
          );
          device.key = input.session_key;
          assert.equal(input.code, device.id + "." + device.secret);
          return route.fulfill({
            json: {
              paired: true,
              id: device.grantID,
              expires_at,
              sealed: {
                id: wire.id,
                data: crypt(device.secret, wire.id, "paired", 0, {
                  id: device.grantID,
                  grant: device.grant,
                  expires_at,
                }),
              },
            },
          });
        }
        assert.equal(url.pathname, "/api/secure");
        const device = devices.find(
          (value) => value.id === request.headers()["x-remote-device"],
        );
        assert(device, "selected public routing header missing");
        const input = crypt(device.key, wire.id, "request", 0, wire.data, true);
        assert.equal(
          input.grant,
          device.grant,
          "request used another computer's key",
        );
        calls.push(device.id);
        return route.fulfill({
          contentType: "application/x-ndjson",
          body: [
            {
              type: "head",
              status: 200,
              header: { "Content-Type": ["application/json"] },
            },
            {
              type: "data",
              data: Buffer.from(JSON.stringify({ device: device.id })).toString(
                "base64",
              ),
            },
            { type: "end" },
          ]
            .map(
              (value, i) =>
                JSON.stringify({
                  data: crypt(device.key, wire.id, "response", i, value),
                }) + "\n",
            )
            .join(""),
        });
      });
      await page.goto("https://device-switch.test/");
      for (const device of devices) {
        await page.evaluate(
          (code) => RemoteSecure.pair(code),
          device.id + "." + device.secret,
        );
        await page.evaluate(
          (device) =>
            RemoteSecure.rememberDevice({ id: device.id, name: device.name }),
          device,
        );
      }
      assert.deepEqual(
        await page.evaluate(() =>
          RemoteSecure.devices().map((device) => device.name),
        ),
        devices.map((device) => device.name),
      );
      assert.equal(
        await page.evaluate(() =>
          Object.keys(RemoteSecure.devices()[0]).sort().join(","),
        ),
        "device_id,expires_at,name",
      );
      await page.evaluate((id) => RemoteSecure.select(id), devices[0].id);
      assert.deepEqual(
        await page.evaluate(async () =>
          (await RemoteSecure.fetch("sessions")).json(),
        ),
        { device: devices[0].id },
      );
      const other = await context.newPage();
      await other.goto("https://device-switch.test/");
      await other.evaluate((id) => RemoteSecure.select(id), devices[1].id);
      assert.equal(
        await page.evaluate(() => RemoteSecure.deviceID()),
        devices[0].id,
        "another tab changed active device",
      );
      assert.deepEqual(
        await page.evaluate(async () =>
          (await RemoteSecure.fetch("sessions")).json(),
        ),
        { device: devices[0].id },
      );
      await page.evaluate((id) => RemoteSecure.select(id), devices[0].id);
      await page.reload();
      assert.equal(
        await page.evaluate(() => RemoteSecure.deviceID()),
        devices[0].id,
      );
      assert.match(
        await page.evaluate(() => {
          try {
            RemoteSecure.select("ff".repeat(16));
            return "";
          } catch (error) {
            return error.message;
          }
        }),
        /Pair this browser/,
      );
      await page.evaluate(() => RemoteSecure.clear());
      assert.equal(await page.evaluate(() => RemoteSecure.available()), false);
      assert.deepEqual(
        await page.evaluate(() =>
          RemoteSecure.devices().map((value) => value.device_id),
        ),
        [devices[1].id],
      );
      await page.evaluate((id) => RemoteSecure.select(id), devices[1].id);
      assert.deepEqual(
        await page.evaluate(async () =>
          (await RemoteSecure.fetch("sessions")).json(),
        ),
        { device: devices[1].id },
      );
      const old = {
        id: devices[0].grantID,
        grant: devices[0].grant,
        key: devices[0].key,
        expires_at,
      };
      await page.evaluate((old) => {
        localStorage.removeItem("codex.remote.devices.v1");
        localStorage.setItem("codex.remote.secure.v1", JSON.stringify(old));
      }, old);
      await page.reload();
      assert.equal(await page.evaluate(() => RemoteSecure.available()), true);
      await page.evaluate(
        (code) => RemoteSecure.pair(code),
        devices[1].id + "." + devices[1].secret,
      );
      assert.equal(
        legacyReads,
        1,
        "legacy selected session was not verified before migration",
      );
      assert.deepEqual(
        await page.evaluate(() =>
          RemoteSecure.devices().map((value) => value.device_id),
        ),
        devices.map((device) => device.id),
      );
      await page.evaluate(() => {
        const base = JSON.parse(localStorage.getItem("codex.remote.secure.v1"));
        localStorage.setItem(
          "codex.remote.devices.v1",
          JSON.stringify(
            Array.from({ length: 16 }, (_, i) => ({
              ...base,
              device_id: (i + 1).toString(16).padStart(32, "0"),
            })),
          ),
        );
      });
      assert.match(
        await page.evaluate(
          (code) => RemoteSecure.pair(code).catch((error) => error.message),
          devices[0].id + "." + devices[0].secret,
        ),
        /16 computers/,
      );
      assert.deepEqual(calls, [devices[0].id, devices[0].id, devices[1].id]);
    },
  );

for (const engine of engines)
  test(
    engine + ": inline computer menu switches only the selected paired device",
    async (t) => {
      const browser = await { chromium, webkit }[engine].launch();
      t.after(() => browser.close());
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const selected = "11".repeat(16),
        other = "aa".repeat(16),
        expires_at = "2099-01-01T00:00:00Z";
      let menuOtherOnline = true;
      await page.addInitScript(
        ({ selected, other, expires_at }) => {
          if (localStorage.getItem("fixture.initialized")) return;
          const value = {
            id: "33".repeat(16),
            grant: "44".repeat(32),
            key: "55".repeat(32),
            expires_at,
            device_id: selected,
            name: "Office Mac",
          };
          localStorage.setItem("codex.remote.secure.v1", JSON.stringify(value));
          localStorage.setItem(
            "codex.remote.devices.v1",
            JSON.stringify([
              value,
              {
                ...value,
                device_id: other,
                name: "Home PC",
                id: "cc".repeat(16),
              },
            ]),
          );
          localStorage.setItem("codex.remote.language", "en");
          localStorage.setItem("fixture.initialized", "1");
        },
        { selected, other, expires_at },
      );
      await page.route("https://device-menu.test/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (url.pathname === "/api/device")
          return route.fulfill({
            json: {
              id: request.headers()["x-remote-device"],
              name:
                request.headers()["x-remote-device"] === selected
                  ? "Office Mac"
                  : "Home PC",
              online:
                request.headers()["x-remote-device"] === other &&
                menuOtherOnline,
            },
          });
        const file =
          url.pathname === "/" ? "index.html" : path.basename(url.pathname);
        if (file === "favicon.ico") return route.fulfill({ status: 204 });
        return route.fulfill({
          body: await fs.readFile(
            path.resolve(__dirname, "../internal/relay/assets", file),
          ),
          contentType: file.endsWith(".js")
            ? "text/javascript"
            : file.endsWith(".css")
              ? "text/css"
              : "text/html",
        });
      });
      await page.goto("https://device-menu.test/");
      await page.locator("#workspace:visible").waitFor();
      await page.locator("#sidebarToggle").click();
      await page
        .getByRole("button", { name: "Switch computer", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "Home PC Online", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("menuitem", { name: "Home PC Online", exact: true })
          .locator('.device-online-dot[data-online="true"]')
          .count(),
        1,
      );
      assert.equal(
        await page
          .getByRole("menuitem", { name: "Office Mac Offline", exact: true })
          .locator('.device-online-dot[data-online="false"]')
          .count(),
        1,
      );
      assert.equal(
        await page.evaluate(() => window.RemoteSecure.deviceID()),
        selected,
      );
      assert.equal(await page.locator("#deviceName").count(), 1);
      assert.equal(await page.locator("#deviceHelp").count(), 0);
      assert.equal(await page.locator('a[href^="/admin"]').count(), 0);
      menuOtherOnline = false;
      await page
        .getByRole("menuitem", { name: "Home PC Online", exact: true })
        .click();
      await page.waitForFunction(
        (id) => window.RemoteSecure?.deviceID() === id,
        other,
      );
      await page.locator("#workspace:visible").waitFor();
      await page.locator("#sidebarToggle").click();
      await page
        .getByRole("button", {
          name: "Pair another computer",
          exact: true,
        })
        .click();
      await page
        .getByRole("heading", {
          name: "Pair another computer",
          exact: true,
        })
        .waitFor();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await page.locator("dialog:visible").count(), 0);
      assert.equal(await page.locator("select").count(), 0);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.deepEqual(errors, []);
    },
  );
