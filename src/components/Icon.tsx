import { Icon as IconifyIcon } from "@iconify/react";

export type AppIconName =
  | "menu"
  | "github"
  | "server"
  | "session"
  | "shell"
  | "pty"
  | "project"
  | "bell"
  | "send"
  | "trash"
  | "stop"
  | "refresh"
  | "plus"
  | "close"
  | "search"
  | "fork"
  | "compact"
  | "file"
  | "columns"
  | "tool"
  | "copy"
  | "check"
  | "edit"
  | "glasses"
  | "list"
  | "find-file"
  | "web"
  | "task"
  | "write"
  | "patch"
  | "todos"
  | "question"
  | "skill"
  | "chevron";

const ICONS: Record<AppIconName, string> = {
  menu: "mdi:menu",
  github: "mdi:github",
  server: "mdi:server",
  session: "mdi:chat-outline",
  shell: "mdi:console",
  pty: "mdi:terminal",
  project: "mdi:folder-outline",
  bell: "mdi:bell-outline",
  send: "mdi:send",
  trash: "mdi:trash-can-outline",
  stop: "mdi:stop-circle-outline",
  refresh: "mdi:refresh",
  plus: "mdi:plus",
  close: "mdi:close",
  search: "mdi:magnify",
  fork: "mdi:source-fork",
  compact: "mdi:compress",
  file: "mdi:file-outline",
  columns: "mdi:view-column",
  tool: "mdi:wrench-outline",
  copy: "mdi:content-copy",
  check: "mdi:check",
  edit: "mdi:pencil-outline",
  // Tool-card icons (parity with the original's `getToolInfo`).
  glasses: "mdi:glasses",
  list: "mdi:format-list-bulleted",
  "find-file": "mdi:file-find-outline",
  web: "mdi:web",
  task: "mdi:account-supervisor-outline",
  write: "mdi:file-edit-outline",
  patch: "mdi:file-document-edit-outline",
  todos: "mdi:format-list-checks",
  question: "mdi:help-circle-outline",
  skill: "mdi:brain",
  chevron: "mdi:chevron-right",
};

interface IconProps {
  name: AppIconName;
  className?: string;
  label?: string;
}

/** Single Iconify entry point: all UI icons go through here, no inline SVGs. */
export default function Icon({ name, className, label }: IconProps) {
  if (label !== undefined) {
    return (
      <span role="img" aria-label={label}>
        <IconifyIcon icon={ICONS[name]} className={className} aria-hidden="true" />
      </span>
    );
  }
  return <IconifyIcon icon={ICONS[name]} className={className} aria-hidden="true" />;
}
