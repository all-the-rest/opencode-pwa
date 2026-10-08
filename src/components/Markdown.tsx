import type { ReactNode } from "react";
import CopyButton from "./CopyButton.tsx";

/**
 * Minimal Markdown renderer without extra dependencies (keeps the bundle
 * lean and works fully offline). Builds React elements only — HTML in the
 * source renders as plain text, so prompt/model output can never inject
 * markup. Supported: fenced code blocks, headings, GFM tables, ordered /
 * nested / task lists, blockquotes, bold, italic, strikethrough, inline
 * code and http(s) links.
 */

function inlineKey(parent: string, index: number): string {
  return `${parent}-${index}`;
}

/** Inline elements: `code`, **bold**, *italic*, ~~del~~, [links](https://…). */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern =
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|\[[^\]]+\]\((?:https?:\/\/)[^)\s]+\))/g;
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
    } else if (token.startsWith("~~")) {
      nodes.push(<del key={inlineKey(keyPrefix, index++)}>{token.slice(2, -2)}</del>);
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

/** One list row: nesting depth plus the marker that started it. */
interface ListItem {
  indent: number;
  ordered: boolean;
  text: string;
}

interface TableBlock {
  header: string[];
  rows: string[][];
  align: ("left" | "center" | "right")[];
}

type Block =
  | { kind: "code"; lines: string[]; language: string | null }
  | { kind: "heading"; lines: string[]; language: null }
  | { kind: "list"; items: ListItem[]; language: null }
  | { kind: "table"; table: TableBlock; language: null }
  | { kind: "quote"; lines: string[]; language: null }
  | { kind: "paragraph"; lines: string[]; language: null };

const LIST_ITEM = /^(\s*)(?:[-*]|\d+[.)])\s+/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

function indentOf(line: string): number {
  const raw = /^[ \t]*/.exec(line)?.[0] ?? "";
  return Math.floor(raw.replace(/\t/g, "  ").length / 2);
}

function isOrdered(line: string): boolean {
  return /^\s*\d+[.)]\s+/.test(line);
}

/** Split one table row into trimmed cells; outer pipes are dropped. */
function tableCells(line: string): string[] {
  const withoutEdges = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return withoutEdges.split("|").map((cell) => cell.trim());
}

/** Alignment of a table from its separator row; null cells default to left. */
function tableAlignments(separator: string[]): TableBlock["align"] {
  return separator.map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });
}

function readTable(lines: string[], start: number): { block: Block; next: number } | null {
  const separatorLine = lines[start + 1];
  if (separatorLine === undefined) return null;
  if (!TABLE_SEPARATOR.test(separatorLine)) return null;
  const header = tableCells(lines[start] ?? "");
  if (header.length === 0) return null;
  const align = tableAlignments(tableCells(separatorLine));
  const rows: string[][] = [];
  let index = start + 2;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "" || !line.includes("|")) break;
    rows.push(tableCells(line));
    index += 1;
  }
  return { block: { kind: "table", table: { header, rows, align }, language: null }, next: index };
}

function readList(lines: string[], start: number): { block: Block; next: number } {
  const items: ListItem[] = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "" || !LIST_ITEM.test(line)) break;
    items.push({
      indent: indentOf(line),
      ordered: isOrdered(line),
      text: line.replace(LIST_ITEM, ""),
    });
    index += 1;
  }
  return { block: { kind: "list", items, language: null }, next: index };
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
    if (line.includes("|")) {
      const table = readTable(lines, index);
      if (table !== null) {
        blocks.push(table.block);
        index = table.next;
        continue;
      }
    }
    if (LIST_ITEM.test(line)) {
      const list = readList(lines, index);
      blocks.push(list.block);
      index = list.next;
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

/** Body of one list row; task-list markers become decorative glyphs. */
function renderItemBody(item: ListItem, keyPrefix: string): ReactNode {
  const task = /^\[([ xX])\]\s+/.exec(item.text);
  if (task === null) return renderInline(item.text, keyPrefix);
  const done = task[1] !== " ";
  return (
    <>
      <span aria-hidden="true" className="mr-1 opacity-70">
        {done ? "☑" : "☐"}
      </span>
      {renderInline(item.text.slice(task[0].length), `${keyPrefix}-body`)}
    </>
  );
}

/** Items that are indented deeper than `depth`, starting at `from`. */
function takeNested(items: ListItem[], from: number, depth: number): ListItem[] {
  const nested: ListItem[] = [];
  for (let index = from; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined || item.indent <= depth) break;
    nested.push(item);
  }
  return nested;
}

function renderItems(items: ListItem[], depth: number, keyPrefix: string): ReactNode {
  const nodes: ReactNode[] = [];
  let index = 0;
  let serial = 0;
  while (index < items.length) {
    const first = items[index];
    if (first === undefined || first.indent < depth) break;
    const ordered = first.ordered;
    const rows: ReactNode[] = [];
    while (index < items.length && items[index]?.indent === depth && items[index]?.ordered === ordered) {
      const item = items[index];
      if (item === undefined) break;
      const rowKey = `${keyPrefix}-li-${serial}`;
      serial += 1;
      const nested = takeNested(items, index + 1, depth);
      rows.push(
        <li key={rowKey}>
          {renderItemBody(item, rowKey)}
          {nested.length > 0 ? renderItems(nested, depth + 1, rowKey) : null}
        </li>,
      );
      index += 1 + nested.length;
    }
    const list = ordered ? (
      <ol key={`${keyPrefix}-list-${serial}`} className="list-decimal ml-5 my-0">
        {rows}
      </ol>
    ) : (
      <ul key={`${keyPrefix}-list-${serial}`} className="list-disc ml-5 my-0">
        {rows}
      </ul>
    );
    nodes.push(list);
  }
  return <>{nodes}</>;
}

function alignStyle(align: TableBlock["align"][number]): Record<string, string> | undefined {
  if (align === "center") return { textAlign: "center" };
  if (align === "right") return { textAlign: "right" };
  return undefined;
}

function renderTable(table: TableBlock, key: string): ReactNode {
  return (
    <div key={key} className="overflow-x-auto my-1" data-testid={`markdown-table-${key}`}>
      <table className="table table-xs">
        <thead>
          <tr>
            {table.header.map((cell, cellIndex) => (
              <th
                key={`${key}-th-${cellIndex}`}
                className="text-xs"
                style={alignStyle(table.align[cellIndex] ?? "left")}
              >
                {renderInline(cell, `${key}-th-${cellIndex}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={`${key}-tr-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`${key}-td-${rowIndex}-${cellIndex}`}
                  className="text-xs"
                  style={alignStyle(table.align[cellIndex] ?? "left")}
                >
                  {renderInline(cell, `${key}-td-${rowIndex}-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Markdown({ text }: { text: string }) {
  const blocks = splitBlocks(text);
  return (
    <>
      {blocks.map((block, blockIndex) => {
        const key = `md-${blockIndex}`;
        if (block.kind === "code") {
          const code = block.lines.join("\n");
          return (
            <div key={key} className="relative my-1" data-testid={`markdown-code-${blockIndex}`}>
              <CopyButton
                text={code}
                testid={`markdown-copy-${blockIndex}`}
                className="absolute right-1 top-1 z-10 bg-base-300/80"
              />
              <pre className="text-xs bg-base-300 rounded p-2 pr-10 overflow-auto my-0 max-h-72">
                <code>{code}</code>
              </pre>
            </div>
          );
        }
        if (block.kind === "heading") {
          const raw = (block.lines[0] ?? "").trim();
          const level = raw.startsWith("###") ? 3 : raw.startsWith("##") ? 2 : 1;
          const body = raw.replace(/^#{1,3}\s+/, "");
          if (level === 1) return <p key={key} className="font-bold">{renderInline(body, key)}</p>;
          return <p key={key} className="font-semibold">{renderInline(body, key)}</p>;
        }
        if (block.kind === "list") return <div key={key}>{renderItems(block.items, 0, key)}</div>;
        if (block.kind === "table") return renderTable(block.table, key);
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
