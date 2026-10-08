import { describe, expect, it } from "vitest";
import {
  ATTACH_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  attachmentName,
  attachmentPreviewUrl,
  attachmentSubtitle,
  createFileAttachment,
  fileAttachmentID,
  isAttachmentAccepted,
  isAttachmentAttached,
  pathAttachmentID,
  readFileAsBase64,
  resolveAttachmentMime,
  toPromptFileAttachment,
  toPromptFileAttachments,
  type PromptAttachment,
} from "./promptAttachments.ts";

function pathItem(path: string): PromptAttachment {
  return { kind: "path", id: pathAttachmentID(path), path };
}

function fileItem(overrides: Partial<Extract<PromptAttachment, { kind: "file" }>> = {}): PromptAttachment {
  return {
    kind: "file",
    id: fileAttachmentID("notes.txt", 4),
    name: "notes.txt",
    mime: "text/plain",
    data: "aGFsbG8=",
    ...overrides,
  };
}

describe("accept list", () => {
  it("keeps the original's mime types and source extensions", () => {
    expect(ATTACH_ACCEPT).toContain("image/png");
    expect(ATTACH_ACCEPT).toContain("application/pdf");
    expect(ATTACH_ACCEPT).toContain("text/*");
    expect(ATTACH_ACCEPT).toContain(".tsx");
    expect(ATTACH_ACCEPT).toContain(".env");
  });

  it("matches on the reported mime type", () => {
    expect(isAttachmentAccepted({ name: "a.png", type: "image/png", size: 1 })).toBe(true);
    expect(isAttachmentAccepted({ name: "a.pdf", type: "application/pdf", size: 1 })).toBe(true);
    expect(isAttachmentAccepted({ name: "a.txt", type: "text/plain", size: 1 })).toBe(true);
    // A wildcard entry (`text/*`) covers the whole family.
    expect(isAttachmentAccepted({ name: "a.csv", type: "text/csv", size: 1 })).toBe(true);
    expect(isAttachmentAccepted({ name: "a.zip", type: "application/zip", size: 1 })).toBe(false);
  });

  it("falls back to the extension when the OS reports no type", () => {
    expect(isAttachmentAccepted({ name: "src/app.ts", type: "", size: 1 })).toBe(true);
    expect(isAttachmentAccepted({ name: "Makefile", type: "", size: 1 })).toBe(false);
  });
});

describe("resolveAttachmentMime", () => {
  it("keeps images and pdf as they are", () => {
    expect(resolveAttachmentMime("a.png", "image/png")).toBe("image/png");
    expect(resolveAttachmentMime("a.pdf", "application/pdf")).toBe("application/pdf");
  });

  it("derives images and pdf from the extension", () => {
    expect(resolveAttachmentMime("a.jpg", "")).toBe("image/jpeg");
    expect(resolveAttachmentMime("a.PNG", "application/octet-stream")).toBe("image/png");
    expect(resolveAttachmentMime("doc.pdf", "")).toBe("application/pdf");
  });

  it("normalizes text-ish mime types down to text/plain", () => {
    expect(resolveAttachmentMime("a.json", "application/json")).toBe("text/plain");
    expect(resolveAttachmentMime("a.yaml", "application/x-yaml")).toBe("text/plain");
    expect(resolveAttachmentMime("a.html", "text/html")).toBe("text/plain");
    expect(resolveAttachmentMime("app.ts", "")).toBe("text/plain");
  });

  it("rejects binary files without a known mapping", () => {
    expect(resolveAttachmentMime("a.bin", "application/octet-stream")).toBeNull();
    expect(resolveAttachmentMime("a.zip", "")).toBeNull();
  });
});

describe("readFileAsBase64", () => {
  it("returns the data URL payload without its prefix", async () => {
    const file = new File(["hallo"], "a.txt", { type: "text/plain" });
    await expect(readFileAsBase64(file)).resolves.toBe("aGFsbG8=");
  });
});

describe("createFileAttachment", () => {
  it("maps a text file to an inline attachment", async () => {
    const file = new File(["hallo"], "notes.txt", { type: "text/plain" });
    await expect(createFileAttachment(file)).resolves.toEqual({
      ok: true,
      attachment: {
        kind: "file",
        id: fileAttachmentID("notes.txt", 5),
        name: "notes.txt",
        mime: "text/plain",
        data: "aGFsbG8=",
      },
    });
  });

  it("rejects oversized files", async () => {
    const file = new File(["x"], "big.txt", { type: "text/plain" });
    Object.defineProperty(file, "size", { value: MAX_ATTACHMENT_BYTES + 1 });
    await expect(createFileAttachment(file)).resolves.toEqual({ ok: false, reason: "too-large" });
  });

  it("rejects unaccepted and unreadable files", async () => {
    const binary = new File([new Uint8Array([0, 1, 2])], "blob.bin", { type: "application/octet-stream" });
    await expect(createFileAttachment(binary)).resolves.toEqual({ ok: false, reason: "not-accepted" });
    const empty = new File([], "empty.txt", { type: "text/plain" });
    await expect(createFileAttachment(empty)).resolves.toEqual({ ok: false, reason: "unreadable" });
  });
});

describe("toPromptFileAttachment", () => {
  it("sends a workspace path as a file:// uri source", () => {
    expect(toPromptFileAttachment(pathItem("src/app.ts"))).toEqual({
      data: "",
      mime: "",
      source: { type: "uri", uri: "file:///src/app.ts" },
      name: "app.ts",
    });
    expect(toPromptFileAttachment(pathItem("/repo/src/app.ts")).source).toEqual({
      type: "uri",
      uri: "file:///repo/src/app.ts",
    });
  });

  it("sends a picked file inline with its base64 payload", () => {
    expect(toPromptFileAttachment(fileItem({ mime: "image/png", name: "shot.png" }))).toEqual({
      data: "aGFsbG8=",
      mime: "image/png",
      source: { type: "inline" },
      name: "shot.png",
    });
  });

  it("maps every attachment in composer order", () => {
    expect(toPromptFileAttachments([pathItem("a.ts"), fileItem()]).map((f) => f.name)).toEqual([
      "a.ts",
      "notes.txt",
    ]);
  });
});

describe("card labels and previews", () => {
  it("shows the last segment and parent directory of a path chip", () => {
    const item = pathItem("src/lib/app.ts");
    expect(attachmentName(item)).toBe("app.ts");
    expect(attachmentSubtitle(item)).toBe("src/lib");
    expect(attachmentSubtitle(pathItem("README.md"))).toBe("Workspace");
    expect(attachmentPreviewUrl(item)).toBeNull();
  });

  it("shows the extension of a file chip and a data URL for images", () => {
    const text = fileItem();
    expect(attachmentName(text)).toBe("notes.txt");
    expect(attachmentSubtitle(text)).toBe("TXT");
    expect(attachmentPreviewUrl(text)).toBeNull();
    const image = fileItem({ name: "shot.png", mime: "image/png" });
    expect(attachmentPreviewUrl(image)).toBe("data:image/png;base64,aGFsbG8=");
  });
});

describe("attachment ids", () => {
  it("keeps path chips addressable by their workspace path", () => {
    expect(pathAttachmentID("src/app.ts")).toBe("path:src/app.ts");
    expect(isAttachmentAttached([pathItem("src/app.ts")], pathAttachmentID("src/app.ts"))).toBe(true);
    expect(isAttachmentAttached([pathItem("src/app.ts")], pathAttachmentID("src/other.ts"))).toBe(false);
  });
});
