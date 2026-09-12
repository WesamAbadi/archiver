import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ToastViewport } from '@/components/ui/toast';
import { LoginPage } from '@/features/auth/LoginPage';
import { RedirectIfAuthed, RequireAuth } from '@/features/auth/guards';
import { LibraryPage } from '@/features/library/LibraryPage';
import { WatchPage } from '@/features/watch/WatchPage';
import { CaptionEditorPage } from '@/features/editor/CaptionEditorPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { NotFoundPage } from '@/features/misc/NotFoundPage';

/**
 * Routes.
 *
 * The archive is public to read, so the shell wraps everything and the guard
 * sits on the two destinations that actually change something — the caption
 * editor and settings. Putting `RequireAuth` on the shell (as it used to be)
 * would gate the whole app, and a visitor would never see the archive at all.
 *
 * There is no `/search`: searching is a box on the home page that swaps the grid
 * for results, so a separate route and tab would only have been a second way to
 * load the same thing.
 */
export default function App() {
  return (
    <>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/watch/:id" element={<WatchPage />} />

          <Route
            path="/watch/:id/edit"
            element={
              <RequireAuth>
                <CaptionEditorPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <LoginPage />
            </RedirectIfAuthed>
          }
        />
      </Routes>

      <ToastViewport />
    </>
  );
}
