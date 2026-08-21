'use client';

// Link handling for the factory pane, in one place because it has been a source
// of bugs twice: a link that opens in the same tab loses the demo, and a link
// that swallows the sentence's final full stop 404s in a way that looks like a
// broken product rather than a broken match.

// The last character cannot be punctuation: runner narration writes "see
// https://…/pull/9." and a href with that full stop on the end is a 404.
export const URL_RE = /(https?:\/\/[^\s<>"')]*[^\s<>"'),.;:!?])/g;

/** Every link the pane opens goes to its own tab; the demo stays put. */
export function Link({
  href,
  className,
  title,
  children,
}: {
  href: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} title={title}>
      {children}
    </a>
  );
}

/** Plain text with its URLs turned into links. */
export function Linkify({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <Link key={i} href={part} className={className}>
            {part}
          </Link>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
