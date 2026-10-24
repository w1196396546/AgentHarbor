const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { build } = require("esbuild");
const { chromium, webkit } = require("playwright");

const engines = process.env.BROWSER
  ? [process.env.BROWSER]
  : ["chromium", "webkit"];
const bundle = build({
  stdin: {
    resolveDir: path.resolve(__dirname, ".."),
    loader: "jsx",
    contents: `
      import {createRoot} from "react-dom/client";
      import {flushSync} from "react-dom";
      import {createMarkdown} from "./web/src/features/markdown.jsx";
      let lang = "en", agent = "codex", scope = "device|thread";
      const opened = [], parses = {}, tracked = new Set();
      const split = String.prototype.split;
      String.prototype.split = function(separator, ...args) {
        if (separator === "\\n" && tracked.has(String(this)))
          parses[String(this)] = (parses[String(this)] || 0) + 1;
        return split.call(this, separator, ...args);
      };
      const t = value => lang === "zh" ? ({"View image":"查看图片",Code:"代码",Copy:"复制",Copied:"已复制"}[value] || value) : value;
      const Action = ({action, children}) => <button onClick={action}>{children}</button>;
      const options = {
        t, Action, run: action => action(),
        openProjectFile: (path, line) => opened.push({path, line, agent, scope}),
        getRenderKey: () => [lang, agent, scope].join("|"),
      };
      const writable = createMarkdown(options), readonly = createMarkdown({...options, readOnly:true});
      const root = createRoot(document.getElementById("root"));
      window.fixture = {
        render(rows, settings = {}) {
          lang = settings.lang || lang;
          agent = settings.agent || agent;
          scope = settings.scope || scope;
          document.documentElement.lang = lang;
          for (const row of rows) tracked.add(row.text);
          const {markdown} = settings.readOnly ? readonly : writable;
          flushSync(() => root.render(rows.map(row => <article key={row.id} data-id={row.id}>{markdown(row.text)}</article>)));
        },
        parses: () => ({...parses}),
        opened: () => [...opened],
      };
    `,
  },
  tsconfig: path.resolve(__dirname, "../web/tsconfig.json"),
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  write: false,
}).then((result) => result.outputFiles[0].text);

async function fixture(t, engine) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [],
    requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.route("**/*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="en"><body><main id="root"></main></body></html>',
    }),
  );
  await page.goto("https://markdown.test/");
  await page.addScriptTag({ content: await bundle });
  t.after(() => assert.deepEqual(errors, []));
  return { page, requests };
}

for (const engine of engines) {
  test(`${engine}: unchanged historical Markdown is not parsed on each tail update`, async (t) => {
    const { page } = await fixture(t, engine);
    const history = Array.from({ length: 30 }, (_, id) => ({
      id: "history-" + id,
      text: `# History ${id}\n\n**Saved answer ${id}**`,
    }));
    const first = [...history, { id: "tail", text: "**Streaming answer**" }];
    await page.evaluate((rows) => window.fixture.render(rows), first);
    assert.equal(
      Object.values(await page.evaluate(() => window.fixture.parses())).reduce(
        (a, b) => a + b,
      ),
      31,
    );
    for (let i = 0; i < 5; i++)
      await page.evaluate(
        (rows) => window.fixture.render(rows),
        [...history, { id: "tail", text: `**Streaming answer ${i}**` }],
      );
    const counts = await page.evaluate(() => window.fixture.parses());
    assert.ok(
      history.every((row) => counts[row.text] === 1),
      "streaming reparsed unchanged historical answers",
    );
    assert.equal(
      Object.values(counts).reduce((a, b) => a + b),
      36,
    );
    assert.equal(
      await page.locator('[data-id="tail"] strong').textContent(),
      "Streaming answer 4",
    );
    assert.equal(await page.locator("h1").count(), 30);
  });

  test(`${engine}: language and resource scope changes update reused Markdown`, async (t) => {
    const { page } = await fixture(t, engine);
    const row = {
      id: "answer",
      text: "![Report](</project/report.png:12>)\n\n```\nanswer\n```",
    };
    await page.evaluate((row) => window.fixture.render([row]), row);
    await page.evaluate(
      (row) => window.fixture.render([row], { lang: "zh" }),
      row,
    );
    assert.equal(
      await page.locator("[data-file-path]").textContent(),
      "查看图片 · Report",
    );
    assert.equal(await page.locator("button").textContent(), "复制");
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.copiedText = text;
          },
        },
      }),
    );
    await page.locator("button").click();
    await page.waitForFunction(
      () => document.querySelector("button").textContent === "已复制",
    );
    assert.equal(await page.evaluate(() => window.copiedText), "answer");
    await page.evaluate(
      (row) =>
        window.fixture.render([row], {
          agent: "other-agent",
          scope: "other-device|other-thread",
        }),
      row,
    );
    await page.locator("[data-file-path]").click();
    assert.deepEqual(await page.evaluate(() => window.fixture.opened()), [
      {
        path: "/project/report.png",
        line: 12,
        agent: "other-agent",
        scope: "other-device|other-thread",
      },
    ]);
    assert.equal(
      (await page.evaluate(() => window.fixture.parses()))[row.text],
      3,
    );
    await page.evaluate(
      (row) => window.fixture.render([row], { readOnly: true }),
      row,
    );
    assert.equal(
      await page.locator("[data-file-path]").count(),
      0,
      "read-only Markdown retained a writable file action",
    );
    assert.ok((await page.locator("#root").textContent()).includes("Report"));
  });

  test(`${engine}: reused Markdown keeps resource URL restrictions`, async (t) => {
    const { page, requests } = await fixture(t, engine);
    const row = {
      id: "links",
      text: "[Unsafe](javascript:alert) [Remote file](file://elsewhere/private.txt) ![External](https://images.test/private.png) [Website](https://example.test/)",
    };
    await page.evaluate((row) => {
      window.fixture.render([row]);
      window.fixture.render([row]);
    }, row);
    assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
    assert.equal(await page.locator("[data-file-path]").count(), 0);
    assert.equal(
      await page.locator("img").count(),
      0,
      "Markdown fetched an external preview",
    );
    assert.equal(
      await page.locator('a[href="https://example.test/"]').count(),
      1,
    );
    assert.deepEqual(requests, ["https://markdown.test/"]);
  });
}
