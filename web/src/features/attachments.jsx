import { useState, useEffect } from "react";
import { RemoteIcon as Icon } from "../components/RemoteIcon";
import { renderView } from "../render";
import { Tag } from "../components/ui/tag";

export function createAttachments({
  requireOwner,
  state,
  notice,
  updateControls,
  api,
  projectName,
  $,
  t,
  run,
  getAgent,
}) {
  const previews = new Map();
  async function upload(files) {
    requireOwner("send");
    if (!state.project) {
      notice("Choose a project first.");
      return;
    }
    const project = state.project,
      generation = state.generation;
    files = Array.from(files);
    for (let offset = 0; offset < files.length; offset += 2) {
      if (state.generation !== generation) break;
      const batch = files.slice(offset, offset + 2).filter((file) => {
        if (file.size <= 20 * 1024 * 1024) return true;
        notice("Attachments must be 20 MB or smaller.");
        return false;
      });
      state.uploading += batch.length;
      updateControls();
      try {
        const uploaded = await Promise.all(
          batch.map(async (file) => {
            try {
              const form = new FormData();
              form.append("file", file);
              return {
                file,
                result: await api(
                  "attachments?" + new URLSearchParams({ project }),
                  form,
                ),
              };
            } catch (e) {
              notice(e.message);
              return null;
            }
          }),
        );
        for (const entry of uploaded) {
          if (!entry) continue;
          const { file, result } = entry;
          if (state.project === project && state.generation === generation) {
            if (result.image)
              previews.set(result.id, URL.createObjectURL(file));
            state.attachments.push(result);
          } else {
            try {
              await api(
                "attachments/" + encodeURIComponent(result.id),
                undefined,
                {
                  method: "DELETE",
                },
              );
            } catch (e) {
              notice(e.message);
            }
          }
        }
        renderAttachments();
      } finally {
        state.uploading -= batch.length;
        updateControls();
      }
    }
  }
  function AttachmentImage({ id, name }) {
    const preview = previews.get(id);
    const [src, setSrc] = useState(preview || "");
    useEffect(() => {
      if (preview)
        return () => {
          URL.revokeObjectURL(preview);
          previews.delete(id);
        };
      let active = true,
        url = "";
      const controller = new AbortController();
      window.RemoteSecure.fetch("attachments/" + encodeURIComponent(id), {
        headers: { "X-Remote-Agent": getAgent().id },
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error("Connection failed.");
          return response.blob();
        })
        .then((blob) => {
          if (active) {
            url = URL.createObjectURL(blob);
            setSrc(url);
          }
        })
        .catch(() => {});
      return () => {
        active = false;
        controller.abort();
        if (url) URL.revokeObjectURL(url);
      };
    }, [id, getAgent().id]);
    return src ? <img src={src} alt={name} /> : <Icon name="image" />;
  }
  function renderAttachments() {
    const rows = [
      ...state.attachments.map((a) => ({
        type: "attachment",
        name: a.name,
        value: a,
      })),
      ...state.mentions.map((a) => ({
        type: "mention",
        name: a.name || projectName(a.path),
        value: a,
      })),
      ...state.skills.map((a) => ({ type: "skill", name: a.name, value: a })),
      ...state.tools.map((a) => ({
        type: "tool",
        name: a.server + " / " + a.name,
        value: a,
      })),
    ];
    renderView(
      $("attachments"),
      rows.map((row) => (
        <Tag
          key={row.type + ":" + (row.value.id || row.value.path || row.name)}
          className="attachment-chip"
          title={row.value.path || row.name}
          icon={
            row.type === "attachment" && row.value.image ? (
              <AttachmentImage id={row.value.id} name={row.name} />
            ) : (
              <Icon
                name={
                  row.type === "tool"
                    ? "tool"
                    : row.type === "skill"
                      ? "plan"
                      : "file"
                }
              />
            )
          }
          removeLabel={t("Remove attachment") + " " + row.name}
          onRemove={() =>
            run(async () => {
              if (row.type === "attachment") {
                await api(
                  "attachments/" + encodeURIComponent(row.value.id),
                  undefined,
                  { method: "DELETE" },
                );
                state.attachments = state.attachments.filter(
                  (a) => a !== row.value,
                );
              } else {
                const field = {
                  mention: "mentions",
                  skill: "skills",
                  tool: "tools",
                }[row.type];
                state[field] = state[field].filter((a) => a !== row.value);
              }
              renderAttachments();
              updateControls();
            })
          }
        >
          <span className="file-name">{row.name}</span>
          {!!row.value.size && (
            <small>
              {" "}
              {row.value.size < 1024
                ? row.value.size + " B"
                : Math.round(row.value.size / 1024) + " KB"}
            </small>
          )}
        </Tag>
      )),
    );
    updateControls();
  }

  return { renderAttachments, upload };
}
