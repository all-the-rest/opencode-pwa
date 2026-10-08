import type { ReactNode } from "react";

/**
 * Minimal Markdown renderer without extra dependencies (keeps the bundle
 * lean and works fully offline). Builds React elements only — HTML in the
 * source renders as plain text, so prompt/model output can never inject
 * markup. Supported: fenced code blocks, headings, unordered lists,
 * blockquotes, bold, italic, inline code and http(s) links.
 */

function inlineKey(parent: string, index: number): string {
  return `${parent}-${index}`;
}

/** Inline elements: `code`, **bold**, *italic*, [links](https://…). */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((?:https?:\/\/)[^)\s]+\))/g;
  const nodes: ReactNode[] = [];
  let rest = text;
  let index = 0;
  const pushText = (chunk: string) => {
    if (chunk !== "") nodes.push(chunk);
  };
  let match: RegExpExecArray | null;
  // Fresh regex state per call: `pattern` is function-local, `lastIndex` starts at 0.
  while ((match = pattern.exec(rest)) !== null) {
    const token = match[0];
    const at = match.index;
    pushText(rest.slice(0, at));
    rest = rest.slice(at + token.length);
    pattern.lastIndex = 0;
    if (token.startsWith("`")) {
      nodes.push(<code key={inlineKey(keyPrefix, index++)}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={inlineKey(keyPrefix, index++)}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={inlineKey(keyPrefix, index++)}>{token.slice(1, -1)}</em>);
    } else {
      const labelEnd = token.indexOf("]");
      const label = token.slice(1, labelEnd);
      const href = token.slice(labelEnd + 2, -1);
      nodes.push(
        <a key={inlineKey(keyPrefix, index++)} href={href} target="_blank" rel="noreferrer">
          {label}
        </a>,
      );
    }
  }
  pushText(rest);
  return nodes;
}

interface Block {
  kind: "code" | "heading" | "list" | "quote" | "paragraph";
  lines: string[];
  language: string | null;
}

function splitBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim() || null;
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index]?.trim().startsWith("```") === true)) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "code", lines: code, language });
      continue;
    }
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    if (/^#{1,3}\s/.test(line.trim())) {
      blocks.push({ kind: "heading", lines: [line], language: null });
      index += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [line];
      index += 1;
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] ?? "")) {
        items.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ kind: "list", lines: items, language: null });
      continue;
    }
    if (line.trim().startsWith(">")) {
      const quoted: string[] = [line];
      index += 1;
      while (index < lines.length && (lines[index]?.trim().startsWith(">") === true)) {
        quoted.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ kind: "quote", lines: quoted, language: null });
      continue;
    }
    blocks.push({ kind: "paragraph", lines: [line], language: null });
    index += 1;
  }
  return blocks;
}

export default function Markdown({ text }: { text: string }) {
  const blocks = splitBlocks(text);
  return (
    <>
      {blocks.map((block, blockIndex) => {
        const key = `md-${blockIndex}`;
        if (block.kind === "code") {
          return (
            <pre key={key} className="text-xs bg-base-300 rounded p-2 overflow-auto my-1">
              <code>{block.lines.join("\n")}</code>
            </pre>
          );
        }
        if (block.kind === "heading") {
          const raw = (block.lines[0] ?? "").trim();
          const level = raw.startsWith("###") ? 3 : raw.startsWith("##") ? 2 : 1;
          const body = raw.replace(/^#{1,3}\s+/, "");
          if (level === 1) return <p key={key} className="font-bold">{renderInline(body, key)}</p>;
          return <p key={key} className="font-semibold">{renderInline(body, key)}</p>;
        }
        if (block.kind === "list") {
          return (
            <ul key={key} className="list-disc ml-5">
              {block.lines.map((item, itemIndex) => (
                <li key={`${key}-li-${itemIndex}`}>
                  {renderInline(item.replace(/^\s*[-*]\s+/, ""), `${key}-li-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === "quote") {
          const body = block.lines.map((line) => line.trim().replace(/^>\s?/, "")).join("\n");
          return (
            <blockquote key={key} className="border-l-2 pl-2 opacity-80">
              {renderInline(body, key)}
            </blockquote>
          );
        }
        return <p key={key}>{renderInline(block.lines[0] ?? "", key)}</p>;
      })}
    </>
  );
}
