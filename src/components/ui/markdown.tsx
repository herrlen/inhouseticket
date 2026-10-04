import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { parseMarkdown, type Inline } from "@/lib/markdown";

function inline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        // Single newlines inside a paragraph become line breaks.
        return (
          <Fragment key={i}>
            {n.v.split("\n").map((part, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {part}
              </Fragment>
            ))}
          </Fragment>
        );
      case "strong":
        return <strong key={i}>{inline(n.c)}</strong>;
      case "em":
        return <em key={i}>{inline(n.c)}</em>;
      case "code":
        return <code key={i} className="rounded bg-bg px-1 py-0.5 font-mono text-[0.9em]">{n.v}</code>;
      case "link":
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline underline-offset-2">
            {inline(n.c)}
          </a>
        );
      case "mention":
        return (
          <span key={i} className="rounded bg-accent/10 px-1 font-medium text-accent">
            @{n.name}
          </span>
        );
    }
  });
}

/** Renders light Markdown without ever injecting HTML. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 text-sm leading-relaxed break-words", className)}>
      {parseMarkdown(source).map((b, i) => {
        switch (b.t) {
          case "p":
            return <p key={i}>{inline(b.c)}</p>;
          case "ul":
            return (
              <ul key={i} className="ml-5 list-disc">
                {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="ml-5 list-decimal">
                {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
              </ol>
            );
          case "pre":
            return <pre key={i} className="overflow-x-auto rounded-[var(--radius-badge)] bg-bg p-2 font-mono text-xs">{b.v}</pre>;
        }
      })}
    </div>
  );
}
