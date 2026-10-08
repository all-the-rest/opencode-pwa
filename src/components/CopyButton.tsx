import { t } from "@lingui/core/macro";
import { useState } from "react";
import Icon from "./Icon.tsx";

/**
 * Small clipboard button for code/message blocks. Copies silently:
 * `navigator.clipboard` first, legacy `execCommand` fallback, no error UI —
 * a failed copy simply keeps the "Kopieren" state.
 */
export default function CopyButton({
  text,
  testid,
  className = "",
}: {
  text: string;
  testid?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      } catch {
        return;
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const label = copied ? t`Kopiert` : t`Kopieren`;
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-xs opacity-70 hover:opacity-100 ${className}`}
      title={label}
      aria-label={label}
      data-testid={testid}
      onClick={() => void handleCopy()}
    >
      <Icon name={copied ? "check" : "copy"} />
    </button>
  );
}
