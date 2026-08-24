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
import type { WorkspaceTheme, ThemeTokenKey, ThemeMode, HslColor } from '@/lib/theme/theme-types';
import { debugLog } from '@/lib/debug-config';

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
  const [selectedToken, setSelectedToken] = useState<ThemeTokenKey | null>(null);
  const [saving, setSaving] = useState(false);

  // Reopening starts from whatever is saved, so an abandoned edit does not
  // resurrect itself the next time the modal opens.
  useEffect(() => {
    if (open) {
      setDraft(savedTheme);
      setSelectedToken(null);
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
      if (!selectedToken) return;
      editDraft((t) => setToken(t, mode, selectedToken, color));
    },
    [editDraft, mode, selectedToken],
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
              onSelectToken={canEdit ? setSelectedToken : () => undefined}
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
          </div>

          <div className="space-y-4">
            {activeRegion && canEdit ? (
              <div className="space-y-2" data-testid="appearance-color-editor">
                <div>
                  <p className="text-sm font-medium text-foreground">{activeRegion.label}</p>
                  <p className="text-xs text-muted-foreground">{activeRegion.description}</p>
                </div>
                <ColorWheel
                  label={activeRegion.label}
                  value={palette[activeRegion.token]}
                  onChange={handleColorChange}
                />
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setSelectedToken(null)}>
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
