import { parseMarkdown, type Inline } from "./markdown";

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.bold ? (
          <strong key={i} className="font-semibold text-ink">
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
    <div className="flex max-w-[70ch] flex-col gap-4 font-sans text-[15px] leading-7 text-ink-soft">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return b.level === 2 ? (
              <h2
                key={i}
                className="mt-3 border-b border-border pb-1 font-display text-base uppercase tracking-[0.06em] text-maroon"
              >
                <InlineText parts={b.content} />
              </h2>
            ) : (
              <h3 key={i} className="mt-1 text-sm font-semibold text-ink">
                <InlineText parts={b.content} />
              </h3>
            );
          case "list":
            return (
              <ul key={i} className="ml-5 flex list-disc flex-col gap-1 marker:text-maroon">
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
