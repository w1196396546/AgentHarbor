import { createHash } from "node:crypto";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { copyFile, readFile, writeFile } from "node:fs/promises";
const root = fileURLToPath(new URL("../../", import.meta.url));
await copyFile(root + "web/icon.svg", root + "internal/relay/assets/icon.svg");
for (const name of ["remote", "admin", "account"]) {
  await build({
    configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    root,
    plugins: [react(), tailwind()],
    resolve: { alias: { "@": root + "web/src" } },
    build: {
      outDir: root + "internal/relay/assets",
      emptyOutDir: false,
      lib: {
        entry: root + `web/src/${name}.jsx`,
        name: `Remote${name}`,
        formats: ["iife"],
        fileName: () => `${name}.js`,
        cssFileName: name,
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
}
// Content versions bypass browser/proxy caches that retain fixed asset URLs.
for (const name of ["index", "admin", "account"]) {
  const entry = name === "index" ? "remote" : name;
  let html = await readFile(root + `web/${name}.html`, "utf8");
  for (const ext of ["css", "js"]) {
    const asset = `${entry}.${ext}`;
    const hash = createHash("sha256")
      .update(await readFile(root + `internal/relay/assets/${asset}`))
      .digest("hex").slice(0, 16);
    html = html.replaceAll(`${asset}"`, `${asset}?v=${hash}"`);
  }
  const iconHash = createHash("sha256")
    .update(await readFile(root + "web/icon.svg"))
    .digest("hex").slice(0, 16);
  html = html.replaceAll('/icon.svg"', `/icon.svg?v=${iconHash}"`);
  await writeFile(root + `internal/relay/assets/${name}.html`, html);
}

await writeFile(
  root + "internal/relay/assets/THIRD-PARTY-NOTICES.txt",
  (await readFile(root + "web/SOLID-GLASS-LICENSE", "utf8")) +
    "\n" +
    (await readFile(root + "web/SOLID-GLASS-NOTICE.md", "utf8")),
);
