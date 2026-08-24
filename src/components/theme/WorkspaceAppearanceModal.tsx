import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { RotateCcw, Sun, Moon } from 'lucide-react';
import { ThemePreview } from './ThemePreview';
import { ColorWheel } from './ColorWheel';
import { PresetGallery } from './PresetGallery';
import { useWorkspaceTheme } from '@/lib/theme/workspace-theme-context';
import { PRESET_THEMES } from '@/lib/theme/presets';
import { beginEdit, setToken, renameTheme, canRename, resetDarkToDerived } from '@/lib/theme/theme-editing';
import { PREVIEW_REGIONS } from '@/lib/theme/preview-regions';
import { toCssColor } from '@/lib/theme/hsl';
import type { WorkspaceTheme, ThemeTokenKey, ThemeMode, HslColor } from '@/lib/theme/theme-types';
import { debugLog } from '@/lib/debug-config';

/**
 * What the colour wheel is pointed at. The workspace icon is not a palette
 * token, so this is a tagged union rather than a nullable token.
 */
type Selection = { kind: 'token'; token: ThemeTokenKey } | { kind: 'icon' } | null;

interface WorkspaceAppearanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  /** False when the viewer lacks the `themes` permission; the editor becomes read-only. */
  canEdit: boolean;
  onSave: (theme: WorkspaceTheme) => Promise<void>;
}

/**
 * Workspace Appearance.
 *
 * The theme set here is the workspace's and applies to every member, which is
 * why it needs its own permission. A member without it still sees the modal —
 * seeing which theme the workspace uses is not privileged — but every control is
 * disabled rather than hidden, so the feature is discoverable and its gate is
 * legible.
 *
 * Editing previews live against the whole app, not just the little mock: the
 * preview shows the layout, but only applying the theme for real shows what
 * living in it feels like. Closing without saving restores the saved theme.
 */
export function WorkspaceAppearanceModal({
  open,
  onOpenChange,
  workspaceName,
  canEdit,
  onSave,
}: WorkspaceAppearanceModalProps) {
  const { theme: savedTheme, previewTheme } = useWorkspaceTheme();

  const [draft, setDraft] = useState<WorkspaceTheme>(savedTheme);
  const [mode, setMode] = useState<ThemeMode>('dark');
  /**
   * What the colour wheel is editing. The workspace icon is not a palette token,
   * so a plain token union cannot express it — hence a tagged selection rather
   * than a second piece of state that could disagree with the first.
   */
  const [selection, setSelection] = useState<Selection>(null);
  const selectedToken = selection?.kind === 'token' ? selection.token : null;
  const [saving, setSaving] = useState(false);

  // Reopening starts from whatever is saved, so an abandoned edit does not
  // resurrect itself the next time the modal opens.
  useEffect(() => {
    if (open) {
      setDraft(savedTheme);
      setSelection(null);
    }
  }, [open, savedTheme]);

  // Preview the draft across the entire app while the modal is open, and hand
  // the app back its saved theme on close.
  useEffect(() => {
    previewTheme(open ? draft : null);
    return () => previewTheme(null);
  }, [open, draft, previewTheme]);

  const allThemes = useMemo(() => {
    // A custom draft is offered alongside the presets so it can be switched back
    // to after trying another one.
    const customs = draft.isPreset ? [] : [draft];
    return [...PRESET_THEMES, ...customs];
  }, [draft]);

  const palette = mode === 'dark' ? draft.dark : draft.light;
  const activeRegion = selectedToken
    ? PREVIEW_REGIONS.find((r) => r.token === selectedToken) ?? null
    : null;

  const editDraft = useCallback(
    (change: (t: WorkspaceTheme) => WorkspaceTheme) => {
      setDraft((current) => {
        // Editing a preset copies it first, so presets stay pristine and
        // "put it back" is always available.
        const editable = beginEdit(current, allThemes.map((t) => t.name));
        return change(editable);
      });
    },
    [allThemes],
  );

  const handleColorChange = useCallback(
    (color: HslColor) => {
      if (!selection) return;
      if (selection.kind === 'icon') {
        editDraft((t) => ({ ...t, icon: { ...t.icon, color } }));
        return;
      }
      editDraft((t) => setToken(t, mode, selection.token, color));
    },
    [editDraft, mode, selection],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      toast.success('Workspace appearance updated', {
        description: 'Every member will see this theme.',
      });
      onOpenChange(false);
    } catch (error) {
      debugLog('WorkspaceAppearance', 'Failed to save theme', error);
      toast.error('Could not save appearance', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const dirty = draft !== savedTheme;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid="workspace-appearance-modal">
        <DialogHeader>
          <DialogTitle>Workspace Appearance</DialogTitle>
          <DialogDescription>
            {canEdit
              ? 'This theme applies to everyone in the workspace. Each member still chooses light or dark for themselves.'
              : 'You do not have permission to change the workspace theme.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1fr_220px]">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Tabs value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
                <TabsList data-testid="appearance-mode-tabs">
                  <TabsTrigger value="light" data-testid="appearance-mode-light">
                    <Sun className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Light
                  </TabsTrigger>
                  <TabsTrigger value="dark" data-testid="appearance-mode-dark">
                    <Moon className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Dark
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {mode === 'dark' && !draft.darkIsDerived && canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="appearance-rederive-dark"
                  onClick={() => editDraft(resetDarkToDerived)}
                  title="Recompute the dark palette from the light one"
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Match light
                </Button>
              )}
            </div>

            {/* Clicking a part of the mock selects the token it paints. */}
            <ThemePreview
              palette={palette}
              icon={draft.icon}
              radius={draft.radius}
              workspaceName={workspaceName}
              selectedToken={selectedToken}
              onSelectToken={canEdit ? (token) => setSelection({ kind: 'token', token }) : () => undefined}
            />

            <div className="space-y-2">
              <Label htmlFor="theme-name">Theme name</Label>
              <Input
                id="theme-name"
                data-testid="appearance-theme-name"
                value={draft.name}
                disabled={!canEdit || (draft.isPreset && !canRename(draft))}
                onChange={(e) =>
                  setDraft((current) =>
                    canRename(current)
                      ? renameTheme(current, e.target.value, allThemes.map((t) => t.name))
                      : current,
                  )
                }
              />
              {draft.isPreset && (
                <p className="text-xs text-muted-foreground">
                  Presets keep their name. Changing a colour creates your own copy, which you can rename.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-icon">Workspace icon</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="appearance-icon-color"
                  aria-label="Change the workspace icon colour"
                  disabled={!canEdit}
                  onClick={() => setSelection({ kind: 'icon' })}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold transition-transform duration-150 motion-safe:hover:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  style={{
                    backgroundColor: toCssColor(draft.icon.color),
                    color: toCssColor(palette.primaryForeground),
                  }}
                >
                  {draft.icon.emoji ?? workspaceName.slice(0, 1).toUpperCase()}
                </button>
                <Input
                  id="workspace-icon"
                  data-testid="appearance-icon-emoji"
                  placeholder="Emoji (optional)"
                  value={draft.icon.emoji ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => {
                    // One emoji, taken by code point so a multi-byte glyph is not
                    // sliced in half into an unrenderable fragment.
                    const first = [...e.target.value.trim()][0];
                    editDraft((t) => ({
                      ...t,
                      icon: { ...t.icon, emoji: first || undefined },
                    }));
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Shown in the workspace switcher. Without an emoji it uses the workspace initial.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {canEdit && selection ? (
              <div className="space-y-2" data-testid="appearance-color-editor">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {selection.kind === 'icon' ? 'Workspace icon' : activeRegion?.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selection.kind === 'icon'
                      ? 'The colour behind the workspace icon in the switcher and sidebar.'
                      : activeRegion?.description}
                  </p>
                </div>
                <ColorWheel
                  label={selection.kind === 'icon' ? 'Workspace icon' : activeRegion?.label ?? 'Colour'}
                  value={selection.kind === 'icon' ? draft.icon.color : palette[selection.token]}
                  onChange={handleColorChange}
                />
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setSelection(null)}>
                  Done
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Presets</Label>
                <PresetGallery
                  themes={allThemes}
                  selectedId={draft.id}
                  mode={mode}
                  onSelect={(t) => canEdit && setDraft(t)}
                />
                {canEdit && (
                  <p className="text-xs text-muted-foreground">
                    Click any part of the preview to change its colour.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            data-testid="appearance-save"
            onClick={handleSave}
            disabled={!canEdit || !dirty || saving}
          >
            {saving ? 'Saving…' : 'Save for everyone'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
