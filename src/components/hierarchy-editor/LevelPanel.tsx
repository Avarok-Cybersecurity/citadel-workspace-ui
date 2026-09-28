/**
 * The side panel for one level in the Structure view: its labels, icon, placeholders, whether
 * its chat starts on, and removal.
 *
 * Every change goes through `schema-edits`, so the panel can never hold a value the server would
 * refuse; a refused change shows its reason instead of being applied.
 */
import type { EntityTypeConfig } from '@/components/layout/sidebar/tree-node-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { resolveIcon } from '@/lib/entity-type-registry';
import { LEVEL_ICONS, MAX_LABEL_CHARS, MAX_PLACEHOLDER_CHARS, WORKSPACE_LEVEL } from '@/lib/hierarchy/schema-edits';

type LevelPatch = Partial<Omit<EntityTypeConfig, 'type_name'>>;

interface LevelPanelProps {
  config: EntityTypeConfig;
  /** How many existing nodes are of this level; a level in use cannot be removed. */
  inUse: number;
  /** Every other level, and which of them this one may contain: the keyboard's way to nest. */
  others: Array<{ typeName: string; label: string }>;
  contains: string[];
  onChange: (patch: LevelPatch) => void;
  onToggleChild: (child: string, allowed: boolean) => void;
  onRemove: () => void;
}

const TEXT_FIELDS: Array<{ key: 'label' | 'plural_label' | 'name_placeholder' | 'description_placeholder'; title: string; max: number }> = [
  { key: 'label', title: 'Name of one', max: MAX_LABEL_CHARS },
  { key: 'plural_label', title: 'Name of several', max: MAX_LABEL_CHARS },
  { key: 'name_placeholder', title: 'Name hint', max: MAX_PLACEHOLDER_CHARS },
  { key: 'description_placeholder', title: 'Description hint', max: MAX_PLACEHOLDER_CHARS },
];

export function LevelPanel({ config, inUse, others, contains, onChange, onToggleChild, onRemove }: LevelPanelProps): JSX.Element {
  const isRoot: boolean = config.type_name === WORKSPACE_LEVEL;
  return (
    <aside className="w-full md:w-72 shrink-0 space-y-4 overflow-y-auto border-t md:border-t-0 md:border-l border-border p-4" data-testid="level-panel">
      <h3 className="font-semibold">{config.label}</h3>
      {TEXT_FIELDS.map(({ key, title, max }) => (
        <div key={key} className="space-y-1">
          <Label htmlFor={`level-${key}`}>{title}</Label>
          <Input
            id={`level-${key}`}
            data-testid={`level-${key}`}
            value={config[key]}
            maxLength={max}
            onChange={(e) => onChange({ [key]: e.target.value })}
          />
        </div>
      ))}
      <div className="space-y-1">
        <Label htmlFor="level-icon">Icon</Label>
        <Select value={config.icon} onValueChange={(icon: string) => onChange({ icon })}>
          <SelectTrigger id="level-icon" data-testid="level-icon"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LEVEL_ICONS.map((name: string) => {
              const Icon: ReturnType<typeof resolveIcon> = resolveIcon(name);
              return (
                <SelectItem key={name} value={name}>
                  <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{name}</span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Can contain</legend>
        {others.map(({ typeName, label }) => (
          <div key={typeName} className="flex items-center gap-2">
            <Checkbox
              id={`contains-${typeName}`}
              data-testid={`contains-${typeName}`}
              checked={contains.includes(typeName)}
              onCheckedChange={(on: boolean | 'indeterminate') => onToggleChild(typeName, on === true)}
            />
            <Label htmlFor={`contains-${typeName}`} className="font-normal">{label}</Label>
          </div>
        ))}
      </fieldset>
      {!isRoot && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="level-chat">New ones start with chat on</Label>
          <Switch id="level-chat" data-testid="level-chat-default" checked={config.chat_default} onCheckedChange={(chat_default: boolean) => onChange({ chat_default })} />
        </div>
      )}
      {!isRoot && (
        <div className="space-y-1">
          <Button variant="destructive" className="w-full" disabled={inUse > 0} onClick={onRemove} data-testid="level-remove">
            Remove level
          </Button>
          {inUse > 0 && (
            <p className="text-xs text-muted-foreground">
              {inUse} {inUse === 1 ? 'item uses' : 'items use'} this level. Move or delete {inUse === 1 ? 'it' : 'them'} first.
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
