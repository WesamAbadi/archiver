import { Fragment } from 'react';
import { dirProps } from '@/lib/rtl';

/**
 * Mark every occurrence of `term` inside `text`.
 *
 * Scope, honestly: this is a **best-effort cosmetic** match, not a mirror of the
 * server's `archivedrop_normalize_text`. Case is ignored and that's it. The
 * common Arabic article case works anyway — `صباح` is a literal substring of
 * `الصباح`, so it highlights without any special handling — but text carrying
 * harakat, or a query using a different hamza form, will highlight nothing.
 *
 * That's a deliberate trade. Re-implementing the normalization in JS would
 * create a second definition of "normalized" that could drift from the SQL one
 * and silently highlight the wrong characters. When the text can't be matched
 * literally, showing it unhighlighted is the honest outcome.
 */
export function Highlight({
  text,
  term,
  className,
}: {
  text: string;
  term: string;
  className?: string;
}) {
  const needle = term.trim();

  // Direction is decided by the TEXT, not by the term, so an Arabic line stays
  // RTL even when the query is Latin.
  const { dir, lang } = dirProps(text);

  if (!needle) {
    return (
      <span className={className} dir={dir} lang={lang}>
        {text}
      </span>
    );
  }

  const lowerText = text.toLocaleLowerCase();
  const lowerNeedle = needle.toLocaleLowerCase();

  const parts: { value: string; match: boolean }[] = [];
  let cursor = 0;
  for (;;) {
    const at = lowerText.indexOf(lowerNeedle, cursor);
    if (at === -1) break;
    if (at > cursor) parts.push({ value: text.slice(cursor, at), match: false });
    parts.push({ value: text.slice(at, at + needle.length), match: true });
    cursor = at + needle.length;
  }
  if (cursor < text.length) parts.push({ value: text.slice(cursor), match: false });

  return (
    <span className={className} dir={dir} lang={lang}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part.match ? (
            <mark className="rounded-xs bg-accent/22 text-ink">{part.value}</mark>
          ) : (
            part.value
          )}
        </Fragment>
      ))}
    </span>
  );
}
