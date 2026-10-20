const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn, execFileSync } = require("node:child_process");
const { test, before, after } = require("node:test");
const { chromium, webkit } = require("playwright");

let buildDir, binary;
before(async () => {
  buildDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "codex-relay-admin-build-"),
  );
  binary = path.join(
    buildDir,
    process.platform === "win32" ? "anywhereToAgent.exe" : "anywhereToAgent",
  );
  execFileSync("go", ["build", "-o", binary, "./cmd/anywhereToAgent"], {
    cwd: path.resolve(__dirname, ".."),
  });
});
after(async () => {
  if (buildDir) await fs.rm(buildDir, { recursive: true, force: true });
});

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolve),
  );
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-admin-"));
  const dataDir = path.join(dir, "state"),
    serviceURL = `http://127.0.0.1:${await freePort()}`;
  const config = {
    data_dir: dataDir,
    public_url: serviceURL,
    listen_address: new URL(serviceURL).host,
    registration_enabled: false,
  };
  const configFile = path.join(dir, "relay.json");
  await fs.writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
  const child = spawn(
    binary,
    ["--config", configFile, "--admin-listen", "127.0.0.1:0"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  t.after(async () => {
    if (child.exitCode === null) {
      const done = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await done;
    }
    await fs.rm(dir, { recursive: true, force: true });
  });
  let output = "";
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("relay admin listener did not start")),
      10000,
    );
    child.stderr.on("data", (bytes) => {
      output += bytes;
      const match = output.match(/Administration: (http:\/\/[^\s]+)\/admin\//);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`relay exited before startup: ${code}`));
    });
  });
  const token = (
    await fs.readFile(path.join(dataDir, "admin-token"), "utf8")
  ).trim();
  assert(!output.includes(token), "service logged private admin credential");
  assert.equal(
    (await fs.stat(path.join(dataDir, "admin-token"))).mode & 0o777,
    0o600,
  );
  return { url, serviceURL, dataDir, token };
}

const engines = process.env.BROWSER
  ? [process.env.BROWSER]
  : ["chromium", "webkit"];
for (const engine of engines)
  for (const width of [390, 1280]) {
    test(
      `relay admin ${engine} ${width}px: real CLI configuration and independent authentication`,
      { skip: process.platform === "win32" },
      async (t) => {
        const f = await fixture(t);
        const browser = await { chromium, webkit }[engine].launch();
        t.after(() => browser.close());
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          locale: "zh-CN",
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(f.url + "/admin/");
        await page.locator("#login:visible").waitFor();
        await page.locator("#token").fill("wrong");
        await page.locator("#loginForm button").click();
        await page.waitForFunction(() =>
          document.getElementById("loginError").textContent.includes("无效"),
        );
        await page.locator("#token").fill(f.token);
        await page.locator("#loginForm button").click();
        await page.locator("#dashboard:visible").waitFor();
        assert.equal(await page.locator("#token").inputValue(), "");
        assert.match(
          await page.locator("#configuration").innerText(),
          new RegExp(f.serviceURL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        );
        assert.match(
          await page.locator("#configuration").innerText(),
          /已关闭/,
        );
        assert.equal(
          await page.locator("#credentialPath").innerText(),
          path.join(f.dataDir, "admin-token"),
        );
        assert(
          !(await page
            .locator("#dashboard")
            .innerText()
            .then((text) => text.includes(f.token))),
          "admin page exposed bootstrap token",
        );
        assert.equal(
          (await fetch(f.serviceURL + "/api/sessions")).status,
          426,
          "unpaired browser read chat history",
        );
        const cookie = (await context.cookies()).find(
          (cookie) => cookie.name === "codex-relay-admin",
        );
        assert(
          cookie?.httpOnly &&
            cookie.sameSite === "Strict" &&
            cookie.value !== f.token &&
            !cookie.secure,
        );
        assert.equal(
          (
            await fetch(f.serviceURL + "/api/sessions", {
              headers: { Cookie: `${cookie.name}=${cookie.value}` },
            })
          ).status,
          426,
          "admin session granted client access",
        );
        const pairing = await fetch(f.serviceURL + "/api/pair", {
          method: "POST",
          headers: {
            Origin: f.serviceURL,
            "X-Codex-Remote": "1",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ key: f.token }),
        });
        assert(pairing.status >= 400, "admin bootstrap token paired a client");
        await page.reload();
        await page.locator("#dashboard:visible").waitFor();
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "admin horizontal overflow",
        );
        assert(
          await page.evaluate(
            () =>
              !Object.values(localStorage).some((value) => value.length >= 64),
          ),
          "admin credential persisted in localStorage",
        );
        if (process.env.ARTIFACT_DIR && engine === "chromium") {
          await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(
              process.env.ARTIFACT_DIR,
              `relay-admin-${width}.png`,
            ),
            fullPage: true,
          });
        }
        await page.locator("#logout").click();
        await page.locator("#login:visible").waitFor();
        const state = await context.request.get(f.url + "/api/admin/state");
        assert.equal(state.status(), 401, "logout retained admin access");
        assert.deepEqual(errors, []);
      },
    );
  }
