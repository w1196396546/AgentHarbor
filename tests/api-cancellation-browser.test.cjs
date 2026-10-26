const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { test } = require("node:test");
const { chromium, webkit } = require("playwright");

for (const engine of process.env.BROWSER
  ? [process.env.BROWSER]
  : ["chromium", "webkit"])
  test(`${engine}: cancelled API bodies release the browser connection`, async (t) => {
    const server = http.createServer((request, response) => {
      if (request.url === "/slow") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.write('{"ok":');
      } else
        response.end("<!doctype html><title>API cancellation fixture</title>");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    const browser = await (engine === "webkit" ? webkit : chromium).launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const source = await fs.readFile(
      path.resolve(__dirname, "../web/src/transport/api.js"),
      "utf8",
    );
    const result = await page.evaluate(async (source) => {
      const { createAPI } = await import(
        "data:text/javascript;base64," + btoa(source)
      );
      const outcomes = [];
      for (const mode of ["agent", "owner"]) {
        let ready;
        const started = new Promise((resolve) => {
          ready = resolve;
        });
        window.RemoteSecure = {
          fetch: async (_path, init) => {
            const response = await fetch("/slow", init);
            const text = response.text.bind(response);
            response.text = () => {
              const pending = text();
              ready();
              return pending;
            };
            return response;
          },
        };
        const { api, cancelAPI } = createAPI({
          state: { generation: 1, live: {} },
          getAgent: () => ({ id: "codex" }),
          actionCapability: () => "",
        });
        const controller = new AbortController();
        const pending = api("sessions/thread", undefined, {
          signal: controller.signal,
        }).then(
          () => "completed",
          (error) => error.name,
        );
        await started;
        if (mode === "agent") cancelAPI();
        else controller.abort();
        const outcome = await Promise.race([
          pending,
          new Promise((resolve) =>
            setTimeout(() => resolve("still-pending"), 3000),
          ),
        ]);
        outcomes.push(outcome);
      }
      return outcomes;
    }, source);
    assert.deepEqual(result, ["AbortError", "AbortError"]);
  });
