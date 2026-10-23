import { normalizeFilePath } from "./presentation";
import { useState, useMemo } from "react";
import { renderView, clearView } from "../render";
import { RemoteIcon as Icon } from "../components/RemoteIcon";

function buildFileTree(files) {
  const root = {
    name: "",
    relative: "",
    isDirectory: true,
    children: new Map(),
    files: [],
  };

  for (const file of files) {
    const rawRel = (file.relative || file.name || file.path || "").replace(
      /^\/+/,
      "",
    );
    const parts = rawRel.split("/").filter(Boolean);
    if (!parts.length) continue;

    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const dirRel = parts.slice(0, i + 1).join("/");
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: dirRel,
          relative: dirRel,
          isDirectory: true,
          children: new Map(),
          files: [],
        });
      }
      current = current.children.get(part);
    }

    const lastPart = parts[parts.length - 1];
    if (file.directory) {
      if (!current.children.has(lastPart)) {
        current.children.set(lastPart, {
          name: lastPart,
          path: file.path,
          relative: rawRel,
          isDirectory: true,
          children: new Map(),
          files: [],
        });
      }
    } else {
      current.files.push({
        ...file,
        name: lastPart,
        relative: rawRel,
        isDirectory: false,
      });
    }
  }

  return root;
}

export function FileTree({ files, onOpenFile, isSearching, Action }) {
  const tree = useMemo(() => buildFileTree(files), [files]);

  // Expand top-level directories by default so immediate files and folders are visible
  const [expanded, setExpanded] = useState(() => {
    return new Set(Array.from(tree.children.values()).map((d) => d.relative));
  });

  const toggle = (dirPath) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  function renderDir(dir, depth = 0) {
    const isOpen = isSearching || expanded.has(dir.relative);
    const subDirs = Array.from(dir.children.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const subFiles = dir.files
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    const count = subDirs.length + subFiles.length;

    return (
      <div key={dir.relative} className="file-tree-branch">
        <button
          type="button"
          className="file-tree-node file-tree-dir"
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          onClick={() => toggle(dir.relative)}
          aria-expanded={isOpen}
          title={dir.relative}
        >
          <span className={`file-tree-arrow ${isOpen ? "open" : ""}`}>
            <Icon name="chevron" />
          </span>
          <Icon name="folder" />
          <span className="file-tree-label">{dir.name}</span>
          <span className="file-tree-count">{count}</span>
        </button>
        {isOpen && (
          <div className="file-tree-children">
            {subDirs.map((sub) => renderDir(sub, depth + 1))}
            {subFiles.map((file) => renderFile(file, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  function renderFile(file, depth = 0) {
    return (
      <Action
        key={file.changeKey || file.path || file.relative}
        className="file-list-button file-tree-node file-tree-file"
        title={file.path || file.relative}
        style={{ paddingLeft: `${depth * 14 + 20}px` }}
        action={() => onOpenFile(file.path, file)}
      >
        <Icon name="file" />
        <span className="file-path">{file.name}</span>
        <span className="sr-only">{file.relative}</span>
      </Action>
    );
  }

  const rootDirs = Array.from(tree.children.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const rootFiles = tree.files
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="file-tree-root">
      {rootDirs.map((dir) => renderDir(dir, 0))}
      {rootFiles.map((file) => renderFile(file, 0))}
    </div>
  );
}

export function createFiles({
  state,
  $,
  t,
  api,
  Action,
  openPanel,
  run,
  projectName,
  getAgent,
}) {
  async function loadProjectFiles() {
    if (!state.project) {
      renderView(
        $("fileList"),
        <p className="menu-note">{t("Choose a project first.")}</p>,
      );
      return;
    }
    const id = state.selected,
      project = state.project,
      seq = ++state.filesSeq;
    const searchValue = $("filesSearch")?.value || "";
    const value = await api(
      "files?" +
        new URLSearchParams({
          project,
          ...(id ? { thread: id } : {}),
          q: searchValue,
        }),
    );
    if (
      id !== state.selected ||
      project !== state.project ||
      seq !== state.filesSeq
    )
      return;
    const files = value.files || [];
    renderView(
      $("fileList"),
      <>
        {files.length ? (
          <FileTree
            files={files}
            onOpenFile={(path) => openProjectFile(path)}
            isSearching={Boolean(searchValue.trim())}
            Action={Action}
          />
        ) : (
          <p className="menu-note">{t("No matching files or tools.")}</p>
        )}
        {value.truncated && (
          <p className="menu-note">{t("Search to find more files.")}</p>
        )}
      </>,
    );
  }

  function browseFolder(path) {
    $("filesSearch").value = path.replace(/\/$/, "") + "/";
    return loadProjectFiles();
  }
  function projectFileURL(path, extra = {}) {
    return (
      "project-file?" +
      new URLSearchParams({ thread: state.selected, path, ...extra })
    );
  }
  function closeFilePreview() {
    state.previewSeq++;
    $("filePreview").hidden = true;
    for (const url of state.filePreviewURLs || []) URL.revokeObjectURL(url);
    state.filePreviewURLs = [];
  }
  async function resourceError(response) {
    let raw = "";
    try {
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let remaining = 2048;
        try {
          while (remaining > 0) {
            const { value, done } = await reader.read();
            if (done) break;
            const part = value.subarray(0, remaining);
            raw += decoder.decode(part, { stream: true });
            remaining -= part.length;
          }
        } finally {
          await reader.cancel();
        }
      } else raw = (await response.text()).slice(0, 2048);
    } catch {}
    let detail = raw.trim();
    try {
      const value = JSON.parse(detail);
      detail = typeof value.error === "string" ? value.error : "";
    } catch {
      if (/<(?:html|!doctype)\b/i.test(detail)) detail = "";
    }
    const label =
      {
        401: "Resource unavailable: browser authorization required.",
        403: "Resource unavailable: access denied.",
        404: "Resource unavailable: file or attachment not found.",
        410: "Resource unavailable: the session or resource is no longer available.",
        413: "Resource unavailable: file exceeds the size limit.",
        503: "Resource unavailable: the computer or service is unavailable.",
      }[response.status] || "Resource unavailable (HTTP {status}).";
    return new Error(
      t(label).replace("{status}", String(response.status)) +
        (detail ? " " + t(detail.replace(/\s+/g, " ").slice(0, 300)) : ""),
    );
  }
  async function projectFileBlob(path, extra = {}) {
    const response = await window.RemoteSecure.fetch(
      projectFileURL(path, extra),
      {
        headers: { "X-Remote-Agent": getAgent().id },
      },
    );
    if (!response.ok) throw await resourceError(response);
    return response.blob();
  }
  async function openProjectFile(path, line = 0) {
    if (!state.selected) throw new Error("Choose a session");
    const root = state.cwd || state.project || "";
    if (/^[A-Za-z]:[\\/]/.test(root)) {
      const relative = normalizeFilePath(path, root);
      if (!/^(?:[A-Za-z]:|\/)/.test(relative)) path = relative;
    }
    const id = state.selected,
      generation = state.generation;
    openPanel(state.sideTab);
    for (const url of state.filePreviewURLs || []) URL.revokeObjectURL(url);
    state.filePreviewURLs = [];
    const seq = ++state.previewSeq;
    $("filePreview").hidden = false;
    $("filePreviewName").textContent = path;
    $("filePreviewName").title = path;
    $("filePreviewDownload").removeAttribute("href");
    $("filePreviewDownload").hidden = true;
    $("filePreviewMeta").textContent = "";
    renderView(
      $("filePreviewContent"),
      <p className="note">{t("Loading file…")}</p>,
    );
    try {
      const value = await api(
        "project-file?" + new URLSearchParams({ thread: id, path }),
      );
      if (
        id !== state.selected ||
        generation !== state.generation ||
        seq !== state.previewSeq
      )
        return;
      $("filePreviewName").textContent = value.path || value.name || path;
      $("filePreviewName").title = value.path || path;
      $("filePreviewMeta").textContent = [
        value.mime,
        value.size < 1024
          ? value.size + " B"
          : Math.ceil(value.size / 1024) + " KB",
        value.truncated
          ? t("Preview truncated. Download the complete file.")
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
      $("filePreviewDownload").href = "#";
      $("filePreviewDownload").onclick = (event) => {
        event.preventDefault();
        run(async () => {
          const blob = await projectFileBlob(path, { download: "1" });
          if (
            id !== state.selected ||
            generation !== state.generation ||
            seq !== state.previewSeq
          )
            return;
          const url = URL.createObjectURL(blob);
          state.filePreviewURLs.push(url);
          const a = document.createElement("a");
          a.href = url;
          a.download = value.name || projectName(path);
          a.click();
        });
      };
      $("filePreviewDownload").download = value.name || projectName(path);
      $("filePreviewDownload").hidden = false;
      const content = $("filePreviewContent");
      clearView(content);
      if (value.image) {
        const blob = await projectFileBlob(path, { raw: "1" });
        if (
          id !== state.selected ||
          generation !== state.generation ||
          seq !== state.previewSeq
        )
          return;
        const url = URL.createObjectURL(blob);
        state.filePreviewURLs.push(url);
        renderView(
          content,
          <img
            src={url}
            alt={value.name || path}
            className="file-preview-image"
          />,
        );
      } else if (value.binary)
        renderView(
          content,
          <p className="note">{t("Binary file. Download to view it.")}</p>,
        );
      else {
        renderView(
          content,
          <pre>
            {String(value.content || "")
              .split("\n")
              .map((text, index) => (
                <span
                  key={index}
                  data-line={index + 1}
                  className={
                    "file-line" + (index + 1 === line ? " highlight" : "")
                  }
                >
                  {text || " "}
                </span>
              ))}
          </pre>,
        );
        if (line)
          content
            .querySelector(".highlight")
            ?.scrollIntoView({ block: "center" });
      }
    } catch (error) {
      if (
        id === state.selected &&
        generation === state.generation &&
        seq === state.previewSeq
      )
        renderView(
          $("filePreviewContent"),
          <p className="note">{t(error.message)}</p>,
        );
      throw error;
    }
  }

  async function openAttachment(attachmentID, name) {
    if (!state.selected || typeof attachmentID !== "string" || !attachmentID)
      return;
    const id = state.selected,
      generation = state.generation;
    openPanel(state.sideTab);
    closeFilePreview();
    const seq = ++state.previewSeq;
    $("filePreview").hidden = false;
    $("filePreviewName").textContent = name;
    $("filePreviewMeta").textContent = t("Attachment");
    $("filePreviewDownload").hidden = true;
    renderView($("filePreviewContent"), <p>{t("Loading file…")}</p>);
    try {
      const response = await window.RemoteSecure.fetch(
        "attachments/" + encodeURIComponent(attachmentID),
        { headers: { "X-Remote-Agent": getAgent().id } },
      );
      if (!response.ok) throw await resourceError(response);
      const blob = await response.blob();
      if (
        id !== state.selected ||
        generation !== state.generation ||
        seq !== state.previewSeq
      )
        return;
      const url = URL.createObjectURL(blob);
      state.filePreviewURLs.push(url);
      const image = /^image\/(png|jpeg|gif|webp)$/.test(blob.type);
      renderView(
        $("filePreviewContent"),
        image ? (
          <img src={url} alt={name} className="file-preview-image" />
        ) : (
          <p>{t("Binary file. Download to view it.")}</p>
        ),
      );
      $("filePreviewDownload").href = url;
      $("filePreviewDownload").download = name;
      $("filePreviewDownload").onclick = null;
      $("filePreviewDownload").hidden = false;
    } catch (error) {
      if (
        id === state.selected &&
        generation === state.generation &&
        seq === state.previewSeq
      )
        renderView(
          $("filePreviewContent"),
          <p role="status">{t(error.message)}</p>,
        );
      throw error;
    }
  }

  return {
    loadProjectFiles,
    openProjectFile,
    closeFilePreview,
    openAttachment,
  };
}
