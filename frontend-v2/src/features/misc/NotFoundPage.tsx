import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <FileQuestion className="size-10 text-ink-faint" />
      <h1 className="mt-6 font-display text-3xl text-ink">Nothing filed here</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">
        The page you asked for isn&apos;t in the archive.
      </p>
      <Link to="/library" className="mt-8">
        <Button variant="primary">Back to the library</Button>
      </Link>
    </main>
  );
}
