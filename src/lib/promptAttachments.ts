/**
 * Prompt attachments: mapping composer state to the client's V2
 * `PromptFileAttachment` shape plus the accept/mime rules of the original
 * prompt input.
 *
 * The attach payload is the encoded V2 shape (verified in the installed
 * `@opencode/client`, `generated/types.d.ts`):
 *
 *   PromptFileAttachment {
 *     data: PromptBase64            // base64 payload
 *     mime: string
 *     source: { type: "inline" } | { type: "uri"; uri: string }
 *     name?: string
 *     description?: string
 *     mention?: { start, end, text }
 *   }
 *
 * Picked/dropped files travel inline (base64 `data` + `source: "inline"`);
 * workspace paths keep the `file://…` URI form (`source: "uri"`), so the
 * existing path chips work unchanged.
 */

import { toPromptFileUri, type PromptFileAttachment } from "./opencode.ts";

/**
 * Accept list of the original composer (`prompt-input/attachments.ts`),
 * verbatim: images, PDF, text-ish mime types and source/code extensions.
 */
const ACCEPT_ENTRIES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/*",
  "application/json",
  "application/ld+json",
  "application/toml",
  "application/x-toml",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
  ".c",
  ".cc",
  ".cjs",
  ".conf",
  ".cpp",
  ".css",
  ".csv",
  ".cts",
  ".env",
  ".go",
  ".gql",
  ".graphql",
  ".h",
  ".hh",
  ".hpp",
  ".htm",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".log",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".py",
  ".rb",
  ".rs",
  ".sass",
  ".scss",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
];

/** `accept` attribute of the file picker (same list as the original). */
export const ATTACH_ACCEPT = ACCEPT_ENTRIES.join(",");

/** Hard cap per attachment — keeps the base64 prompt body sane. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** Minimal `File` shape the accept/mime rules work on. */
export interface AttachableFile {
  name: string;
  type: string;
  size: number;
}

/**
 * One attachment in the composer. Path chips are workspace references
 * (`file://…`), file chips carry their base64 payload for inline sending.
 */
export type PromptAttachment =
  | { kind: "path"; id: string; path: string }
  | { kind: "file"; id: string; name: string; mime: string; data: string };

/** An attachment that travels inline (base64 payload). */
export type FileAttachment = Extract<PromptAttachment, { kind: "file" }>;

/** Stable id of a path chip (the workspace path is its identity). */
export function pathAttachmentID(path: string): string {
  return `path:${path}`;
}

/** Stable id of a file chip (name + size keeps re-picks addressable). */
export function fileAttachmentID(name: string, size: number): string {
  return `file:${size}:${name}`;
}

function lowerExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index + 1).toLowerCase();
}

function normalizedMime(type: string): string {
  return type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

/** Image mimes the composer renders an inline preview for. */
const IMAGE_MIMES: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function isImageAttachment(item: PromptAttachment): item is FileAttachment {
  return item.kind === "file" && IMAGE_MIMES.has(item.mime);
}

const IMAGE_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Mime types that travel as `text/plain` (the original normalizes them down). */
const TEXT_MIMES: ReadonlySet<string> = new Set([
  "application/json",
  "application/ld+json",
  "application/toml",
  "application/x-toml",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
]);

/** Extensions the accept list treats as text even when the OS reports no type. */
const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  "c",
  "cc",
  "cjs",
  "conf",
  "cpp",
  "css",
  "csv",
  "cts",
  "env",
  "go",
  "gql",
  "graphql",
  "h",
  "hh",
  "hpp",
  "htm",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "log",
  "md",
  "mdx",
  "mjs",
  "mts",
  "py",
  "rb",
  "rs",
  "sass",
  "scss",
  "sh",
  "sql",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
  "zsh",
]);

/**
 * Does a file pass the composer's accept list? Mime patterns win when the OS
 * reports a type; otherwise the extension decides (drag & drop bypasses the
 * picker's `accept` attribute, so the check runs again on every drop).
 */
export function isAttachmentAccepted(file: AttachableFile): boolean {
  const mime = normalizedMime(file.type);
  if (mime !== "") {
    return ACCEPT_ENTRIES.some((entry) => {
      if (entry.startsWith(".")) return false;
      if (entry.endsWith("/*")) return mime.startsWith(entry.slice(0, -1));
      return mime === entry;
    });
  }
  return ACCEPT_ENTRIES.some((entry) => entry === `.${lowerExtension(file.name)}`);
}

/**
 * Mime the attachment travels with. Returns null when the file is binary or
 * otherwise unreadable — the original sniffs the first bytes for that, here a
 * file without a known image/pdf/text mapping is rejected instead of guessed.
 */
export function resolveAttachmentMime(name: string, type: string): string | null {
  const mime = normalizedMime(type);
  if (IMAGE_MIMES.has(mime) || mime === "application/pdf") return mime;
  const extension = lowerExtension(name);
  const fromExtension = IMAGE_MIME_BY_EXTENSION[extension];
  if ((mime === "" || mime === "application/octet-stream") && extension === "pdf") {
    return "application/pdf";
  }
  if ((mime === "" || mime === "application/octet-stream") && fromExtension !== undefined) {
    return fromExtension;
  }
  if (
    mime.startsWith("text/") ||
    TEXT_MIMES.has(mime) ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  ) {
    return "text/plain";
  }
  if (mime === "" && TEXT_EXTENSIONS.has(extension)) return "text/plain";
  return null;
}

/** Read a file as base64 (data URL payload, prefix stripped). */
export function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("FileReader unavailable"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result: unknown = reader.result;
      if (typeof result !== "string") {
        reject(new Error("unreadable file"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma === -1 ? "" : result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("unreadable file"));
    reader.readAsDataURL(file);
  });
}

export type AttachmentRejection = "too-large" | "not-accepted" | "unreadable";

export type AttachmentResult =
  | { ok: true; attachment: PromptAttachment }
  | { ok: false; reason: AttachmentRejection };

/**
 * Turn a picked/dropped file into an inline attachment. One rejection reason
 * per call so the composer can explain *why* a file was refused.
 */
export async function createFileAttachment(file: File): Promise<AttachmentResult> {
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, reason: "too-large" };
  if (!isAttachmentAccepted(file)) return { ok: false, reason: "not-accepted" };
  const mime = resolveAttachmentMime(file.name, file.type);
  if (mime === null) return { ok: false, reason: "not-accepted" };
  let data: string;
  try {
    data = await readFileAsBase64(file);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (data === "") return { ok: false, reason: "unreadable" };
  return {
    ok: true,
    attachment: {
      kind: "file",
      id: fileAttachmentID(file.name, file.size),
      name: file.name,
      mime,
      data,
    },
  };
}

/** Map one composer attachment to the client's `PromptFileAttachment`. */
export function toPromptFileAttachment(item: PromptAttachment): PromptFileAttachment {
  if (item.kind === "file") {
    return { data: item.data, mime: item.mime, source: { type: "inline" }, name: item.name };
  }
  return {
    // A uri source points the server at the file itself, so no payload
    // travels; the client type still requires both fields.
    data: "",
    mime: "",
    source: { type: "uri", uri: toPromptFileUri(item.path) },
    name: item.path.split("/").pop() ?? item.path,
  };
}

/** Map every composer attachment, in composer order. */
export function toPromptFileAttachments(items: readonly PromptAttachment[]): PromptFileAttachment[] {
  return items.map(toPromptFileAttachment);
}

/** File name shown on an attachment card (path chips show their last segment). */
export function attachmentName(item: PromptAttachment): string {
  if (item.kind === "file") return item.name;
  return item.path.split("/").pop() ?? item.path;
}

/**
 * Second card line: the parent directory of a path chip ("Workspace" at the
 * root), the uppercased extension of a file (the original's `typeLabel`).
 */
export function attachmentSubtitle(item: PromptAttachment): string {
  if (item.kind === "path") {
    const segments = item.path.split("/");
    return segments.length > 1 ? segments.slice(0, -1).join("/") : "Workspace";
  }
  const index = item.name.lastIndexOf(".");
  return index === -1 ? item.mime : item.name.slice(index + 1).toUpperCase();
}

/** Object URL of an image attachment, or null when there is nothing to show. */
export function attachmentPreviewUrl(item: PromptAttachment): string | null {
  if (!isImageAttachment(item)) return null;
  return `data:${item.mime};base64,${item.data}`;
}

/** True when the same attachment is already attached (dedupe on add). */
export function isAttachmentAttached(items: readonly PromptAttachment[], id: string): boolean {
  return items.some((item) => item.id === id);
}
