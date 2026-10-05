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
  | "search";

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
