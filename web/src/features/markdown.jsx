import { useState } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../components/ui/table";

export function createMarkdown({
  run,
  openProjectFile,
  t,
  Action,
  readOnly = false,
}) {
  function safeURL(text) {
    try {
      const u = new URL(text, location.origin);
      return ["https:", "http:", "mailto:"].includes(u.protocol)
        ? u.href
        : null;
    } catch {
      return null;
    }
  }
  function localFileTarget(value) {
    let path = value.trim().replace(/^<|>$/g, "");
    if (
      !path ||
      path.startsWith("#") ||
      (/^[a-z][a-z0-9+.-]*:/i.test(path) && !/^\w:[\\/]/.test(path))
    )
      return null;
    try {
      path = decodeURIComponent(path);
    } catch {
      return null;
    }
    const lineMatch = path.match(
        /(?::(\d+)(?::\d+)?|#L(\d+)(?:C\d+)?(?:-L\d+)?)$/,
      ),
      line = Number(lineMatch?.[1] || lineMatch?.[2] || 0);
    if (lineMatch) path = path.slice(0, lineMatch.index);
    if (
      !/^(?:\/|\.\.?\/)/.test(path) &&
      !path.includes("/") &&
      !/\.[^./\s]+$/.test(path)
    )
      return null;
    return { path, line };
  }
  function inline(text) {
    const re =
      /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|~~[^~\n]+~~|\[[^\]\n]+\]\((?:<[^>\n]+>|[^)\n]+)\))/g;
    const nodes = [];
    let start = 0;
    for (const match of text.matchAll(re)) {
      if (match.index > start) nodes.push(text.slice(start, match.index));
      const value = match[0],
        key = match.index;
      if (value[0] === "`")
        nodes.push(<code key={key}>{value.slice(1, -1)}</code>);
      else if (value.startsWith("**") || value.startsWith("__"))
        nodes.push(<strong key={key}>{inline(value.slice(2, -2))}</strong>);
      else if (value.startsWith("~~"))
        nodes.push(<del key={key}>{value.slice(2, -2)}</del>);
      else if (value[0] === "*")
        nodes.push(<em key={key}>{value.slice(1, -1)}</em>);
      else {
        const split = value.indexOf("]("),
          target = value.slice(split + 2, -1),
          file = localFileTarget(target),
          url = file ? null : safeURL(target),
          label = value.slice(1, split);
        nodes.push(
          file && readOnly ? (
            <span key={key}>{label}</span>
          ) : file ? (
            <a
              key={key}
              href="#"
              data-file-path={file.path}
              onClick={(event) => {
                event.preventDefault();
                run(() => openProjectFile(file.path, file.line));
              }}
            >
              {label}
            </a>
          ) : url ? (
            <a key={key} href={url} target="_blank" rel="noreferrer noopener">
              {label}
            </a>
          ) : (
            <span key={key}>{label}</span>
          ),
        );
      }
      start = match.index + value.length;
    }
    if (start < text.length) nodes.push(text.slice(start));
    return nodes;
  }
  function CodeBlock({ code, language }) {
    const [copied, setCopied] = useState(false);
    return (
      <div className="code-block">
        <div className="code-heading">
          <span>{language || t("Code")}</span>
          <Action
            action={async () => {
              await navigator.clipboard.writeText(code);
              setCopied(true);
            }}
          >
            {t(copied ? "Copied" : "Copy")}
          </Action>
        </div>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  }
  function markdown(text) {
    const nodes = [],
      lines = String(text || "")
        .replace(/\r\n/g, "\n")
        .split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i],
        key = i;
      if (/^\s*```/.test(line)) {
        const language = line.trim().slice(3).trim(),
          code = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i]))
          code.push(lines[i++]);
        if (i < lines.length) i++;
        nodes.push(
          <CodeBlock key={key} code={code.join("\n")} language={language} />,
        );
        continue;
      }
      if (!line.trim()) {
        i++;
        continue;
      }
      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        const H = "h" + heading[1].length;
        nodes.push(<H key={key}>{inline(heading[2])}</H>);
        i++;
        continue;
      }
      if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
        nodes.push(<hr key={key} />);
        i++;
        continue;
      }
      if (/^>\s?/.test(line)) {
        const parts = [];
        while (i < lines.length && /^>\s?/.test(lines[i]))
          parts.push(lines[i++].replace(/^>\s?/, ""));
        nodes.push(
          <blockquote key={key}>{inline(parts.join("\n"))}</blockquote>,
        );
        continue;
      }
      const list = line.match(/^\s*([-*+] |\d+\. )(.+)$/);
      if (list) {
        const ordered = /\d/.test(list[1]),
          List = ordered ? "ol" : "ul",
          items = [];
        while (i < lines.length) {
          const m = lines[i].match(/^\s*([-*+] |\d+\. )(.+)$/);
          if (!m || /\d/.test(m[1]) !== ordered) break;
          items.push(
            <li key={i}>
              {inline(
                m[2].replace(/^\[([ xX])\]\s*/, (_, x) =>
                  x === " " ? "☐ " : "☑ ",
                ),
              )}
            </li>,
          );
          i++;
        }
        nodes.push(<List key={key}>{items}</List>);
        continue;
      }
      if (
        line.includes("|") &&
        i + 1 < lines.length &&
        /^\s*\|?\s*:?-{3}/.test(lines[i + 1])
      ) {
        const cells = (s) =>
            s
              .replace(/^\s*\||\|\s*$/g, "")
              .split("|")
              .map((x) => x.trim()),
          head = cells(line),
          rows = [];
        i += 2;
        while (i < lines.length && lines[i].includes("|"))
          rows.push(cells(lines[i++]));
        nodes.push(
          <div key={key} className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  {head.map((cell, index) => (
                    <TableHead key={index}>{inline(cell)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={index}>
                    {row.map((cell, j) => (
                      <TableCell key={j}>{inline(cell)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>,
        );
        continue;
      }
      const paragraph = [lines[i++]];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^\s*```|^#{1,4}\s+.+$|^>\s?|^\s*([-*+] |\d+\. ).+$/.test(lines[i])
      )
        paragraph.push(lines[i++]);
      nodes.push(<p key={key}>{inline(paragraph.join("\n"))}</p>);
    }
    return <div className="markdown">{nodes}</div>;
  }

  return { markdown, safeURL };
}
