import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SessionDocks, { type SessionDocksProps } from "./SessionDocks.tsx";
import { extractFormFields } from "../lib/formFields.ts";
import type { DockForm, DockInboxItem, DockPermission } from "../lib/dockStack.ts";

function props(overrides: Partial<SessionDocksProps> = {}): SessionDocksProps {
  return {
    permissions: [],
    forms: [],
    inbox: [],
    revert: null,
    todos: [],
    busy: false,
    offline: false,
    onPermissionReply: vi.fn(),
    onFormSubmit: vi.fn(),
    onFormCancel: vi.fn(),
    onInboxDeliver: vi.fn(),
    onInboxEdit: vi.fn(),
    onRevertCommit: vi.fn(),
    onRevertDiscard: vi.fn(),
    ...overrides,
  };
}

function renderDocks(value: SessionDocksProps) {
  return render(
    <I18nProvider i18n={i18n}>
      <SessionDocks {...value} />
    </I18nProvider>,
  );
}

const permission: DockPermission = {
  id: "per-1",
  action: "bash",
  resources: ["ls -la", "rm -rf /tmp/x"],
  message: "Shell ausführen?",
};

const form: DockForm = {
  id: "f-1",
  title: "Freigabe?",
  fields: extractFormFields([
    { key: "wahl", title: "Bereich", type: "string", options: [{ value: "web", label: "Web" }, { value: "fs", label: "Dateisystem" }] },
    { key: "anzahl", title: "Anzahl", type: "integer" },
    { key: "vertraulich", title: "Vertraulich", type: "boolean" },
  ]),
};

const inbox: DockInboxItem[] = [
  { id: "in-1", kind: "user", summary: "Bitte auch die Tests prüfen", delivery: "queue" },
];

describe("SessionDocks", () => {
  it("renders nothing when no dock has content", () => {
    const { container } = renderDocks(props());
    expect(screen.queryByTestId("session-docks")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a permission request with description, patterns, deny and allow once", async () => {
    const onPermissionReply = vi.fn();
    renderDocks(props({ permissions: [permission], onPermissionReply }));

    expect(screen.getByTestId("session-dock-permission-per-1")).toHaveTextContent(
      "Berechtigung angefragt: bash",
    );
    expect(screen.getByTestId("session-dock-permission-message")).toHaveTextContent("Shell ausführen?");
    expect(screen.getByTestId("session-dock-permission-resources-per-1")).toHaveTextContent("ls -la");

    fireEvent.click(screen.getByTestId("session-dock-permission-once-per-1"));
    expect(onPermissionReply).toHaveBeenCalledWith("per-1", "once");
    fireEvent.click(screen.getByTestId("session-dock-permission-reject-per-1"));
    expect(onPermissionReply).toHaveBeenCalledWith("per-1", "reject");
    // The documented product decision: `decision: "always"` is never offered.
    expect(screen.queryByRole("button", { name: /immer erlauben|dauerhaft/i })).toBeNull();
    expect(screen.queryByTestId("session-dock-permission-always-per-1")).toBeNull();
  });

  it("locks every dock button while busy or offline", () => {
    renderDocks(props({ permissions: [permission], busy: true }));
    expect(screen.getByTestId("session-dock-permission-once-per-1")).toBeDisabled();
    expect(screen.getByTestId("session-dock-permission-reject-per-1")).toBeDisabled();
  });

  it("renders a question dock with native option controls and no JSON paste", async () => {
    const onFormSubmit = vi.fn();
    renderDocks(props({ forms: [form], onFormSubmit }));

    expect(screen.getByTestId("session-dock-question-f-1")).toHaveTextContent("Freigabe?");
    // "Antworten" stays disabled until a native control carries a value.
    expect(screen.getByTestId("session-dock-question-submit-f-1")).toBeDisabled();

    // A closed choice is a native radio group, not a JSON textarea.
    const web = screen.getByTestId("session-dock-form-option-wahl-web");
    const fs = screen.getByTestId("session-dock-form-option-wahl-fs");
    expect(web).toHaveAttribute("role", "radio");
    expect(web).toHaveAttribute("aria-checked", "false");
    fireEvent.click(web);
    expect(web).toHaveAttribute("aria-checked", "true");
    expect(fs).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("session-dock-form-input-anzahl")).toHaveAttribute("type", "number");
    expect(screen.getByTestId("session-dock-form-check-vertraulich")).toHaveAttribute("type", "checkbox");
    // The JSON escape hatch stays available but collapsed.
    expect(screen.getByTestId("session-dock-question-json-f-1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("session-dock-form-check-vertraulich"));
    const submit = screen.getByTestId("session-dock-question-submit-f-1");
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(onFormSubmit).toHaveBeenCalledWith("f-1", { wahl: "web", vertraulich: true });
  });

  it("answers a question through the JSON escape hatch", async () => {
    const onFormSubmit = vi.fn();
    renderDocks(props({ forms: [form], onFormSubmit }));
    fireEvent.click(screen.getByText("Als JSON bearbeiten"));
    const textarea = screen.getByTestId("session-dock-question-json-text-f-1");
    fireEvent.change(textarea, { target: { value: "" } });
    fireEvent.change(textarea, { target: { value: '{"wahl":"fs"}' } });
    fireEvent.click(screen.getByTestId("session-dock-question-json-submit-f-1"));
    expect(onFormSubmit).toHaveBeenCalledWith("f-1", { wahl: "fs" });
  });

  it("lists queued follow-ups with send-now, queue and edit", async () => {
    const handlers = {
      onInboxDeliver: vi.fn(),
      onInboxEdit: vi.fn(),
    };
    renderDocks(props({ inbox, ...handlers }));

    expect(screen.getByTestId("session-dock-inbox")).toHaveTextContent("Warteschlange (1)");
    expect(screen.getByTestId("session-dock-inbox-in-1")).toHaveTextContent("Bitte auch die Tests prüfen");
    expect(screen.getByTestId("session-dock-inbox-delivery-in-1")).toHaveTextContent("Warteschlange");

    fireEvent.click(screen.getByTestId("session-dock-inbox-steer-in-1"));
    expect(handlers.onInboxDeliver).toHaveBeenCalledWith("in-1", "steer");
    fireEvent.click(screen.getByTestId("session-dock-inbox-queue-in-1"));
    expect(handlers.onInboxDeliver).toHaveBeenCalledWith("in-1", "queue");
    fireEvent.click(screen.getByTestId("session-dock-inbox-edit-in-1"));
    expect(handlers.onInboxEdit).toHaveBeenCalledWith(inbox[0]);
  });

  it("shows a staged revert with summary, restore and discard", async () => {
    const onRevertCommit = vi.fn();
    const onRevertDiscard = vi.fn();
    renderDocks(
      props({ revert: { messageID: "m2", fileCount: 2 }, onRevertCommit, onRevertDiscard }),
    );
    expect(screen.getByTestId("session-dock-revert-summary")).toHaveTextContent("m2");
    expect(screen.getByTestId("session-dock-revert-summary")).toHaveTextContent("2 Dateien");
    fireEvent.click(screen.getByTestId("session-dock-revert-commit"));
    expect(onRevertCommit).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("session-dock-revert-discard"));
    expect(onRevertDiscard).toHaveBeenCalled();
  });

  it("stacks every open dock in one column (nothing is dropped at 360px)", () => {
    renderDocks(props({ permissions: [permission], forms: [form], inbox, revert: null }));
    const stack = screen.getByTestId("session-docks");
    expect(stack.className).toContain("flex-col");
    expect(screen.getByTestId("session-dock-question-f-1")).toBeInTheDocument();
    expect(screen.getByTestId("session-dock-permission-per-1")).toBeInTheDocument();
    expect(screen.getByTestId("session-dock-inbox")).toBeInTheDocument();
    expect(screen.queryByTestId("session-dock-revert")).toBeNull();
  });

  it("renders the inbox kind badge inline with a full-width summary", () => {
    renderDocks(props({ inbox }));
    // The kind badge is inline with the text, never a fixed narrow column …
    expect(screen.getByTestId("session-dock-inbox-kind-in-1")).toBeInTheDocument();
    const summary = screen.getByTestId("session-dock-inbox-summary-in-1");
    expect(summary).toHaveTextContent("Bitte auch die Tests prüfen");
    expect(summary.className).toContain("flex-1");
    expect(summary.className).toContain("min-w-0");
    // … and the action buttons sit in their own row, not squeezed onto the
    // summary's flex line (which is what broke it one word per line at 360px).
    const steer = screen.getByTestId("session-dock-inbox-steer-in-1");
    expect(summary.parentElement).not.toBe(steer.parentElement);
  });

  it("caps a permission kind at two and expands the rest in place", () => {
    const per2: DockPermission = { id: "per-2", action: "read", resources: [], message: null };
    const per3: DockPermission = { id: "per-3", action: "write", resources: [], message: "schreiben?" };
    renderDocks(props({ permissions: [permission, per2, per3] }));

    // The two newest show; the oldest collapses behind the "N weitere" row.
    expect(screen.getByTestId("session-dock-permission-per-2")).toBeInTheDocument();
    expect(screen.getByTestId("session-dock-permission-per-3")).toBeInTheDocument();
    expect(screen.queryByTestId("session-dock-permission-per-1")).toBeNull();

    const more = screen.getByTestId("session-docks-more-permissions");
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveTextContent("1 weitere anzeigen");

    // Expand in place, then collapse again.
    fireEvent.click(more);
    expect(screen.getByTestId("session-dock-permission-per-1")).toBeInTheDocument();
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(more).toHaveTextContent("Weniger anzeigen");
    fireEvent.click(more);
    expect(screen.queryByTestId("session-dock-permission-per-1")).toBeNull();
  });

  it("caps inbox rows at two and keeps every other dock intact", () => {
    const many: DockInboxItem[] = [
      { id: "in-1", kind: "user", summary: "erste", delivery: "queue" },
      { id: "in-2", kind: "synthetic", summary: "zweite", delivery: null },
      { id: "in-3", kind: "user", summary: "dritte", delivery: "steer" },
    ];
    renderDocks(props({ inbox: many, permissions: [permission] }));

    // Newest two rows show; the oldest collapses. The single permission (≤ two)
    // is untouched — the cap is per kind.
    expect(screen.getByTestId("session-dock-inbox-in-2")).toBeInTheDocument();
    expect(screen.getByTestId("session-dock-inbox-in-3")).toBeInTheDocument();
    expect(screen.queryByTestId("session-dock-inbox-in-1")).toBeNull();
    expect(screen.getByTestId("session-dock-permission-per-1")).toBeInTheDocument();
    expect(screen.queryByTestId("session-docks-more-permissions")).toBeNull();

    const more = screen.getByTestId("session-docks-more-inbox");
    expect(more).toHaveTextContent("1 weitere anzeigen");
    fireEvent.click(more);
    expect(screen.getByTestId("session-dock-inbox-in-1")).toBeInTheDocument();
  });
});
