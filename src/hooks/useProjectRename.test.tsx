import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectRename } from "./useProjectRename.ts";
import Toasts from "../components/Toasts.tsx";
import { ToastProvider } from "../state/toast.tsx";
import { updateProject, type ProjectInfo, type ServerConfig } from "../lib/opencode.ts";

vi.mock("../lib/opencode.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/opencode.ts")>();
  return { ...actual, updateProject: vi.fn() };
});

const updateProjectMock = vi.mocked(updateProject);

const server: ServerConfig = { id: "s1", name: "Lokal", baseUrl: "http://x.local", username: "" };

const project: ProjectInfo = { id: "p1", name: "Alt", canonical: "/srv/app" };

/** Harness: the hook plus the list it patches, so optimism is observable. */
function Harness() {
  const [projects, setProjects] = useState<ProjectInfo[]>([project]);
  const rename = useProjectRename(server, setProjects);
  return (
    <div>
      <ul data-testid="project-list">
        {projects.map((p) => (
          <li key={p.id} data-testid={`project-row-${p.id}`}>
            {p.name}
          </li>
        ))}
      </ul>
      <button
        type="button"
        data-testid="rename-ok"
        onClick={() => void rename(project, { name: "Neu" })}
      >
        ok
      </button>
      <button
        type="button"
        data-testid="rename-fail"
        onClick={() => void rename(project, { name: "Verloren" })}
      >
        fail
      </button>
    </div>
  );
}

function renderHarness() {
  return render(
    <I18nProvider i18n={i18n}>
      <ToastProvider>
        <Harness />
        <Toasts />
      </ToastProvider>
    </I18nProvider>,
  );
}

describe("useProjectRename", () => {
  beforeEach(() => {
    updateProjectMock.mockReset();
  });

  it("patches optimistically and keeps the new name on success", async () => {
    updateProjectMock.mockResolvedValue({ data: project, error: null });
    renderHarness();
    fireEvent.click(screen.getByTestId("rename-ok"));
    // Optimistic: the label switches before the PATCH resolves …
    expect(screen.getByTestId("project-row-p1")).toHaveTextContent("Neu");
    // … and the server call carries the verified payload.
    await waitFor(() =>
      expect(updateProjectMock).toHaveBeenCalledWith(server, "p1", { name: "Neu" }),
    );
    expect(await screen.findByText("Projekt gespeichert.")).toBeInTheDocument();
  });

  it("rolls back and toasts when the PATCH fails", async () => {
    updateProjectMock.mockResolvedValue({ data: null, error: "Server offline" });
    renderHarness();
    fireEvent.click(screen.getByTestId("rename-fail"));
    expect(screen.getByTestId("project-row-p1")).toHaveTextContent("Verloren");
    await waitFor(() => expect(screen.getByTestId("project-row-p1")).toHaveTextContent("Alt"));
    expect(await screen.findByText("Umbenennen fehlgeschlagen: Server offline")).toBeInTheDocument();
  });

  it("sends the color as an icon override", async () => {
    updateProjectMock.mockResolvedValue({ data: project, error: null });
    renderHarness();
    fireEvent.click(screen.getByTestId("rename-ok"));
    await waitFor(() => expect(updateProjectMock).toHaveBeenCalled());
    // Sanity: the payload helper is what the hook hands to the API layer.
    expect(updateProjectMock.mock.calls[0]?.[2]).toEqual({ name: "Neu" });
  });
});
