import { renderView, clearView } from "../render";
import { RemoteIcon as Icon } from "../components/RemoteIcon";

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
    const value = await api(
      "files?" +
        new URLSearchParams({
          project,
          ...(id ? { thread: id } : {}),
          q: $("filesSearch").value,
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
        {files.map((file) => (
          <Action
            key={file.path}
            className="file-list-button"
            title={file.path}
            action={() =>
              file.directory
                ? browseFolder(file.relative || file.name)
                : openProjectFile(file.path)
            }
          >
            <Icon name={file.directory ? "folder" : "file"} />
            <span className="file-path">{file.relative || file.name}</span>
          </Action>
        ))}
        {!files.length && (
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
  async function projectFileBlob(path, extra = {}) {
    const response = await window.RemoteSecure.fetch(
      projectFileURL(path, extra),
      {
        headers: { "X-Remote-Agent": getAgent().id },
      },
    );
    if (!response.ok) throw new Error("Connection failed.");
    return response.blob();
  }
  async function openProjectFile(path, line = 0) {
    if (!state.selected) throw new Error("Choose a session");
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

  return { loadProjectFiles, openProjectFile, closeFilePreview };
}
