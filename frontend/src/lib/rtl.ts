/**
 * Right-to-left text handling.
 *
 * Salvaged from the old `WatchPage`, where this regex was inlined and then
 * re-declared in a second component with a slightly different range — so the
 * transcript header and the transcript body could disagree about whether the
 * same line was RTL. One implementation, used by both.
 *
 * Captions are frequently Arabic, so this is a real product requirement, not a
 * nicety: without `dir="rtl"` the punctuation and mixed Latin/Arabic lines
 * render in the wrong order.
 */

/** Arabic, Arabic Supplement/Extended, and both Arabic presentation blocks. */
const RTL_CHAR_PATTERN =
  /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/** True when the text contains any right-to-left character. */
export function isRTL(text: string): boolean {
  return RTL_CHAR_PATTERN.test(text);
}

/**
 * Direction to render a string in.
 *
 * A line that is mostly Latin but contains one Arabic word should stay LTR —
 * flipping the whole line would scramble it — so this compares the counts
 * rather than testing for any RTL character.
 */
export function textDirection(text: string): 'rtl' | 'ltr' {
  if (!text) return 'ltr';

  let rtlCount = 0;
  let ltrCount = 0;
  for (const char of text) {
    if (RTL_CHAR_PATTERN.test(char)) rtlCount += 1;
    else if (/[A-Za-z]/.test(char)) ltrCount += 1;
  }

  return rtlCount > ltrCount ? 'rtl' : 'ltr';
}

/**
 * A font stack that renders Arabic well. Inter Tight has no Arabic coverage, so
 * without this the browser falls back to whatever it likes (often a poor match)
 * and Arabic lines look visibly different from Latin ones.
 */
export const RTL_FONT_STACK = '"Noto Sans Arabic", "Noto Naskh Arabic", system-ui, sans-serif';

/** Props to spread onto an element so it renders the text correctly. */
export function dirProps(text: string): { dir: 'rtl' | 'ltr'; lang?: string } {
  const dir = textDirection(text);
  return dir === 'rtl' ? { dir, lang: 'ar' } : { dir };
}
