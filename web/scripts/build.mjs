import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { copyFile, readFile, writeFile } from "node:fs/promises";
const root = fileURLToPath(new URL("../../", import.meta.url));
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
for (const name of ["index", "admin", "account"])
  await copyFile(
    root + `web/${name}.html`,
    root + `internal/relay/assets/${name}.html`,
  );

await writeFile(
  root + "internal/relay/assets/THIRD-PARTY-NOTICES.txt",
  (await readFile(root + "web/SOLID-GLASS-LICENSE", "utf8")) +
    "\n" +
    (await readFile(root + "web/SOLID-GLASS-NOTICE.md", "utf8")),
);
