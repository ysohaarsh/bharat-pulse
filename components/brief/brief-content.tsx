import { parseMarkdown, type Inline } from "./markdown";

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.bold ? (
          <strong key={i} className="font-semibold text-foreground">
            {p.text}
          </strong>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** Renders brief text via the safe markdown subset (React text nodes only). */
export function BriefContent({ content }: { content: string }) {
  const blocks = parseMarkdown(content);
  return (
    <div className="flex flex-col gap-3 font-sans leading-relaxed text-foreground/90">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return b.level === 2 ? (
              <h2 key={i} className="mt-2 font-mono text-sm font-bold uppercase tracking-[0.2em] text-accent">
                <InlineText parts={b.content} />
              </h2>
            ) : (
              <h3 key={i} className="mt-1 text-sm font-semibold uppercase tracking-wide text-muted">
                <InlineText parts={b.content} />
              </h3>
            );
          case "list":
            return (
              <ul key={i} className="ml-5 flex list-disc flex-col gap-1 marker:text-accent">
                {b.items.map((item, j) => (
                  <li key={j}>
                    <InlineText parts={item} />
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={i}>
                <InlineText parts={b.content} />
              </p>
            );
        }
      })}
    </div>
  );
}
