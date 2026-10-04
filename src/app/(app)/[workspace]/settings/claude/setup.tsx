"use client";

import { useState } from "react";
import { de } from "@/lib/i18n/de";
import { TokenForm } from "./token-form";

/** Token creation plus ready-to-paste config; the snippets fill in a freshly created token. */
export function ClaudeSetup({ workspaceId, mcpUrl }: { workspaceId: string; mcpUrl: string }) {
  const [token, setToken] = useState<string | null>(null);
  const value = token ?? de.claude.tokenPlaceholder;
  const code = `claude mcp add --transport http inhouseticket ${mcpUrl} --header "Authorization: Bearer ${value}"`;
  const desktop = JSON.stringify(
    { mcpServers: { inhouseticket: { command: "npx", args: ["-y", "mcp-remote", mcpUrl, "--header", `Authorization: Bearer ${value}`] } } },
    null,
    2,
  );

  return (
    <>
      <section aria-labelledby="token-create-heading" className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <h2 id="token-create-heading" className="mb-3 font-semibold">
          {de.claude.createTitle}
        </h2>
        <TokenForm workspaceId={workspaceId} onToken={setToken} />
      </section>

      <section aria-labelledby="setup-heading" className="flex flex-col gap-4">
        <h2 id="setup-heading" className="font-semibold">
          {de.claude.setupTitle}
        </h2>
        <Snippet title={de.claude.codeTitle} text={de.claude.codeText} code={code} />
        <Snippet title={de.claude.desktopTitle} text={de.claude.desktopText} code={desktop} />
      </section>
    </>
  );
}

function Snippet({ title, text, code }: { title: string; text: string; code: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-[13px] text-muted">{text}</p>
      <pre tabIndex={0} aria-label={title} className="overflow-x-auto rounded-[var(--radius-badge)] border border-border bg-bg p-3 font-mono text-[12px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
