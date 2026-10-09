import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServerFolderPicker from "./ServerFolderPicker.tsx";
import { createSession, listDirectory, type ServerConfig } from "../lib/opencode.ts";
import type { SessionInfo } from "../lib/opencode.ts";

vi.mock("../lib/opencode.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/opencode.ts")>();
  return { ...actual, listDirectory: vi.fn(), createSession: vi.fn() };
});

const listDirectoryMock = vi.mocked(listDirectory);
const createSessionMock = vi.mocked(createSession);

const server: ServerConfig = { id: "s1", name: "Lokal", baseUrl: "http://x.local", username: "" };

const created: SessionInfo = { id: "ses-new", agent: null, model: null, tokens: null, cost: null };

/** Answers the nested listing the picker walks through. */
function serverTree() {
  const listings: Record<string, Array<{ path: string; type: "file" | "directory" }>> = {
    "": [
      { path: "srv", type: "directory" },
      { path: "home", type: "directory" },
      { path: "README.md", type: "file" },
    ],
    "/srv": [{ path: "app", type: "directory" }, { path: "notes.txt", type: "file" }],
    "/srv/app": [{ path: "package.json", type: "file" }],
  };
  return (_server: ServerConfig, path: string | undefined) =>
    Promise.resolve({
      data: {
        // `file.list` answers with the absolute directory of the entries.
        location: path === undefined ? "/" : path,
        entries: listings[path ?? ""] ?? [],
      },
      error: null,
    }) as unknown as ReturnType<typeof listDirectory>;
}

function renderPicker(onCreated: (session: SessionInfo) => void = vi.fn()) {
  const utils = render(
    <I18nProvider i18n={i18n}>
      <ServerFolderPicker
        server={server}
        open={true}
        onClose={vi.fn()}
        onCreated={onCreated}
      />
    </I18nProvider>,
  );
  return { ...utils, onCreated };
}

describe("ServerFolderPicker", () => {
  beforeEach(() => {
    listDirectoryMock.mockReset();
    createSessionMock.mockReset();
    createSessionMock.mockResolvedValue({ data: created, error: null });
  });

  it("loads the server location and shows its breadcrumb", async () => {
    listDirectoryMock.mockImplementation(serverTree());
    renderPicker();
    await waitFor(() => expect(screen.getByTestId("folder-picker-path")).toHaveTextContent("/"));
    expect(screen.getByTestId("folder-picker-entry-srv")).toBeInTheDocument();
    expect(screen.getByTestId("folder-picker-entry-home")).toBeInTheDocument();
    // Files are listed but not selectable as a project root.
    expect(screen.getByTestId("folder-picker-file-README.md")).toBeInTheDocument();
  });

  it("descends into a directory and back up", async () => {
    listDirectoryMock.mockImplementation(serverTree());
    renderPicker();
    await waitFor(() => expect(screen.getByTestId("folder-picker-entry-srv")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("folder-picker-entry-srv"));
    await waitFor(() => expect(screen.getByTestId("folder-picker-path")).toHaveTextContent("/srv"));
    fireEvent.click(screen.getByTestId("folder-picker-entry-app"));
    await waitFor(() => expect(screen.getByTestId("folder-picker-path")).toHaveTextContent("/srv/app"));
    // One level up again.
    fireEvent.click(screen.getByTestId("folder-picker-up"));
    await waitFor(() => expect(screen.getByTestId("folder-picker-path")).toHaveTextContent("/srv"));
    expect(listDirectoryMock).toHaveBeenCalledTimes(4);
  });

  it("walks the breadcrumb back to the server root", async () => {
    listDirectoryMock.mockImplementation(serverTree());
    renderPicker();
    await waitFor(() => expect(screen.getByTestId("folder-picker-entry-srv")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("folder-picker-entry-srv"));
    await waitFor(() => expect(screen.getByTestId("folder-picker-crumb-0")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("folder-picker-crumb-0"));
    await waitFor(() => expect(listDirectoryMock).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId("folder-picker-path")).toHaveTextContent("/srv");
    // Back at the root level: the root crumb returns to the server location.
    fireEvent.click(screen.getByTestId("folder-picker-crumb-root"));
    await waitFor(() => expect(listDirectoryMock).toHaveBeenCalledTimes(4));
  });

  it("creates the session in the chosen directory and hands it over", async () => {
    listDirectoryMock.mockImplementation(serverTree());
    const { onCreated } = renderPicker();
    await waitFor(() => expect(screen.getByTestId("folder-picker-entry-srv")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("folder-picker-entry-srv"));
    await waitFor(() => expect(screen.getByTestId("folder-picker-entry-app")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("folder-picker-entry-app"));
    await waitFor(() => expect(screen.getByTestId("folder-picker-confirm")).toBeEnabled());
    fireEvent.click(screen.getByTestId("folder-picker-confirm"));
    await waitFor(() => expect(createSessionMock).toHaveBeenCalledWith(server, { directory: "/srv/app" }));
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("shows a load error and retries", async () => {
    listDirectoryMock.mockResolvedValue({ data: null, error: "Boom" });
    renderPicker();
    await waitFor(() => expect(screen.getByTestId("folder-picker-error")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Erneut laden" }));
    await waitFor(() => expect(listDirectoryMock).toHaveBeenCalledTimes(2));
  });

  it("surfaces a failed creation", async () => {
    listDirectoryMock.mockImplementation(serverTree());
    createSessionMock.mockResolvedValue({ data: null, error: "500" });
    renderPicker();
    await waitFor(() => expect(screen.getByTestId("folder-picker-confirm")).toBeEnabled());
    fireEvent.click(screen.getByTestId("folder-picker-confirm"));
    await waitFor(() => expect(screen.getByTestId("folder-picker-create-error")).toBeInTheDocument());
  });
});
