const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");

const paths = fs
  .readFile(path.resolve(__dirname, "../web/src/project-paths.js"), "utf8")
  .then(
    (source) =>
      import(
        "data:text/javascript;base64," + Buffer.from(source).toString("base64")
      ),
  );

test("project identity matches Windows extended drive and UNC forms without widening path boundaries", async () => {
  const { sameProjectPath, projectContainsPath, owningProject } = await paths;
  assert(sameProjectPath("E:\\work\\shop", "\\\\?\\e:\\WORK\\shop\\"));
  assert(sameProjectPath("e:/work/shop", "E:\\work\\shop"));
  assert(
    sameProjectPath(
      "\\\\Server\\Share\\Shop",
      "\\\\?\\UNC\\server\\share\\SHOP\\",
    ),
  );
  assert(
    projectContainsPath(
      "\\\\Server\\Share",
      "\\\\?\\UNC\\server\\share\\Shop\\src",
    ),
  );
  assert(projectContainsPath("E:\\", "\\\\?\\e:\\WORK\\shop"));
  assert(projectContainsPath("/", "/work/shop"));
  assert.equal(
    owningProject(["E:\\work", "E:\\work\\shop"], "\\\\?\\e:\\WORK\\shop\\src"),
    "E:\\work\\shop",
  );
  for (const value of [
    "E:\\work\\shop-copy",
    "E:\\workspace",
    "E:\\work\\shop\\..\\other",
    "F:\\work\\shop",
    "\\\\.\\E:\\work\\shop",
  ])
    assert.equal(projectContainsPath("E:\\work\\shop", value), false, value);
  assert.equal(
    projectContainsPath("\\\\server\\share", "\\\\server\\share-other\\shop"),
    false,
  );
  assert.equal(sameProjectPath("/Work/Shop", "/work/shop"), false);
  assert.equal(projectContainsPath("/work/shop", "/work/shop-copy"), false);
  assert.equal(sameProjectPath("", ""), false);
});
