import { useEffect } from 'react';

const SITE = 'ArchiveDrop';

/**
 * Set the document title for a route.
 *
 * A single-page app serves one `<title>` for every URL, so without this every
 * tab and every history entry reads the same thing — useless the moment someone
 * has the archive open in more than one tab, or wants to find a recording again
 * from their history. `null` restores the site title.
 *
 * The cleanup matters: leaving one route for a page that sets no title should
 * put the site title back, not leave the previous recording's name in the tab.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${SITE}` : SITE;

    return () => {
      document.title = previous;
    };
  }, [title]);
}
