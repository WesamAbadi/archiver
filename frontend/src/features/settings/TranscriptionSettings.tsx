import { useState } from 'react';
import { AlertTriangle, Mic } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import type { AppSettingsResponse, TranscriptionProvider } from '@/lib/types';
import { useAppSettings, useUpdateAppSettings } from './api';

/**
 * Transcription settings — which service transcribes uploads, and with which model.
 *
 * The server owns *which* providers exist and what their default models are; this
 * file owns how they're described, because that is presentation and has no reason
 * to travel over the wire.
 */

/** UI order. The selection is a radio group, so order is what the admin reads first. */
const PROVIDER_ORDER: TranscriptionProvider[] = ['GROQ', 'GOOGLE'];

const PROVIDER_META: Record<TranscriptionProvider, { label: string; detail: string }> = {
  GROQ: {
    label: 'Groq · Whisper',
    detail:
      'Timestamps come from Whisper’s decoder, so lyric sync and seek links land accurately. Handles long files.',
  },
  GOOGLE: {
    label: 'Google · Gemini',
    detail:
      'Timestamps are estimated by the model, so sync can drift. Accepts fewer audio formats and files up to 14 MB.',
  },
};

export function TranscriptionSection() {
  const settings = useAppSettings();

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-center gap-2">
        <Mic className="size-4 text-accent" />
        <h2 className="font-display text-lg text-ink">Transcription</h2>
        {settings.data?.isDefault && <Badge tone="neutral">defaults</Badge>}
      </div>

      {settings.isPending ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <Spinner className="size-4" /> Reading settings…
        </div>
      ) : settings.isError ? (
        <p className="mt-4 text-sm text-danger">Could not read transcription settings.</p>
      ) : settings.data ? (
        // Keyed on the saved value: after a successful save the cache updates,
        // the key changes, and the form remounts clean — so "unsaved changes"
        // can't survive a save, and no effect has to synchronise draft state.
        <TranscriptionForm
          key={`${settings.data.provider}:${settings.data.model}`}
          settings={settings.data}
        />
      ) : null}
    </section>
  );
}

function TranscriptionForm({ settings }: { settings: AppSettingsResponse }) {
  const update = useUpdateAppSettings();

  const [provider, setProvider] = useState<TranscriptionProvider>(settings.provider);
  const [model, setModel] = useState(settings.model);

  // A blank field means "use the selected provider's default" — the field's
  // placeholder shows which id that resolves to.
  const effectiveModel = model.trim() || settings.defaultModels[provider];
  const isDirty = provider !== settings.provider || effectiveModel !== settings.model;
  const missingKey = !settings.available[provider];

  function handleProviderChange(next: TranscriptionProvider) {
    if (next === provider) return;
    setProvider(next);
    // Carry the model id across only if it was blank. A `whisper-*` id sent to
    // Google fails on the next job, which is exactly the kind of failure that
    // only shows up in a background queue where nobody is watching.
    setModel('');
  }

  function handleSave() {
    update.mutate(
      { provider, model: model.trim() || undefined },
      {
        onSuccess: (saved) => {
          toast.success(
            `Transcriptions now use ${PROVIDER_META[saved.provider].label} · ${saved.model}.`,
          );
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Could not save settings.');
        },
      },
    );
  }

  return (
    <>
      <div
        role="radiogroup"
        aria-label="Transcription provider"
        className="mt-4 grid gap-2 sm:grid-cols-2"
      >
        {PROVIDER_ORDER.map((id) => {
          const selected = provider === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => handleProviderChange(id)}
              className={cn(
                'rounded-md border p-3.5 text-left transition-colors',
                selected
                  ? 'border-accent-dim bg-accent/10'
                  : 'border-border bg-surface-2 hover:border-border-strong',
              )}
            >
              <span className="flex items-center gap-2">
                {/* The dot is decorative; `aria-checked` is what conveys state. */}
                <span
                  aria-hidden
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    selected ? 'bg-accent' : 'bg-border-strong',
                  )}
                />
                <span className="text-sm font-medium text-ink">{PROVIDER_META[id].label}</span>
              </span>
              <span className="mt-1.5 block text-[12.5px] leading-relaxed text-ink-muted">
                {PROVIDER_META[id].detail}
              </span>
              {!settings.available[id] && (
                <span className="mt-2 flex items-center gap-1.5 text-[12px] text-warning">
                  <AlertTriangle className="size-3 shrink-0" />
                  No API key configured — jobs will fail
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <TextField
          label="Model"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder={settings.defaultModels[provider]}
          hint={`Leave blank to use ${settings.defaultModels[provider]}.`}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          className="font-mono text-[13px]"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-faint">
          {settings.isDefault
            ? 'Never changed, so the defaults above apply.'
            : `Saved: ${PROVIDER_META[settings.provider].label} · ${settings.model}`}
        </p>
        <Button
          variant="primary"
          onClick={handleSave}
          loading={update.isPending}
          disabled={!isDirty || missingKey}
        >
          Save
        </Button>
      </div>
    </>
  );
}
