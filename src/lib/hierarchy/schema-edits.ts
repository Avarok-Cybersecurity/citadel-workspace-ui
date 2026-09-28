/**
 * Edits to a draft hierarchy schema, each refusing what the server would refuse.
 *
 * The Structure view stages edits on a copy of the schema and saves them with one
 * UpdateTreeSchema. Every edit here returns either the new draft or the reason it cannot be
 * made, using the server's rules (citadel-workspace-server-kernel `schema_rules.rs`), so a drag
 * the server would refuse is refused as it happens rather than after Save.
 */
import type { EntityTypeConfig, NestingRule, TreeSchema } from '@/components/layout/sidebar/tree-node-types';

export const WORKSPACE_LEVEL: string = 'Workspace';
/** Mirrors the server's limits. */
export const MAX_LEVEL_NAME_CHARS: number = 32;
export const MAX_LABEL_CHARS: number = 40;
export const MAX_PLACEHOLDER_CHARS: number = 120;
export const MAX_LEVELS: number = 16;
/** The icons both sides know: the server's LEVEL_ICONS, the client's ICON_MAP. */
export const LEVEL_ICONS: readonly string[] = ['building-2', 'briefcase', 'message-square', 'folder', 'users', 'folder-kanban', 'layers'];
/** A new level's icon until the admin picks one. */
export const NEW_LEVEL_ICON: string = 'folder';

export type EditResult = { ok: true; schema: TreeSchema } | { ok: false; reason: string };

const clone = (schema: TreeSchema): TreeSchema => structuredClone(schema);
const refuse = (reason: string): EditResult => ({ ok: false, reason });

export function childrenOf(schema: TreeSchema, level: string): string[] {
  return schema.rules.find((r: NestingRule) => r.parent_type === level)?.allowed_child_types ?? [];
}

export function levelNames(schema: TreeSchema): string[] {
  return schema.entity_type_configs.map((c: EntityTypeConfig) => c.type_name);
}

/** Whether `from` can already reach `to` by nesting (so an edge to->from would close a loop). */
function reaches(schema: TreeSchema, from: string, to: string): boolean {
  const seen: Set<string> = new Set<string>();
  const stack: string[] = [from];
  while (stack.length > 0) {
    const at: string = stack.pop() as string;
    if (at === to) return true;
    if (seen.has(at)) continue;
    seen.add(at);
    stack.push(...childrenOf(schema, at));
  }
  return false;
}

export function usableLevelName(name: string): boolean {
  return name.length >= 1 && name.length <= MAX_LEVEL_NAME_CHARS && name.trim() === name && /^[\p{L}\p{N} _-]+$/u.test(name);
}

/** A new level, not yet nested anywhere: connect it to a parent to place it. */
export function addLevel(schema: TreeSchema, label: string): EditResult {
  const name: string = label.trim();
  if (!usableLevelName(name)) return refuse(`"${label}" is not a usable level name (1 to ${MAX_LEVEL_NAME_CHARS} letters, digits, spaces, - or _).`);
  if (levelNames(schema).includes(name)) return refuse(`There is already a level called ${name}.`);
  if (levelNames(schema).length >= MAX_LEVELS) return refuse(`A hierarchy can have at most ${MAX_LEVELS} levels.`);
  const next: TreeSchema = clone(schema);
  next.entity_type_configs.push({
    type_name: name, icon: NEW_LEVEL_ICON, label: name, plural_label: `${name}s`,
    name_placeholder: '', description_placeholder: '', chat_default: true,
  });
  return { ok: true, schema: next };
}

/** Allow `child` directly inside `parent`. */
export function connect(schema: TreeSchema, parent: string, child: string): EditResult {
  if (child === WORKSPACE_LEVEL) return refuse('The Workspace is the top of the hierarchy; nothing can contain it.');
  if (parent === child || reaches(schema, child, parent)) return refuse(`${child} would end up inside itself.`);
  if (childrenOf(schema, parent).includes(child)) return { ok: true, schema };
  const next: TreeSchema = clone(schema);
  const rule: NestingRule | undefined = next.rules.find((r: NestingRule) => r.parent_type === parent);
  if (rule) rule.allowed_child_types.push(child);
  else next.rules.push({ parent_type: parent, allowed_child_types: [child] });
  return { ok: true, schema: next };
}

/** Stop allowing `child` inside `parent`. The server refuses the save if nodes still sit there. */
export function disconnect(schema: TreeSchema, parent: string, child: string): EditResult {
  const next: TreeSchema = clone(schema);
  const rule: NestingRule | undefined = next.rules.find((r: NestingRule) => r.parent_type === parent);
  if (rule) rule.allowed_child_types = rule.allowed_child_types.filter((c: string) => c !== child);
  return { ok: true, schema: next };
}

/** Change a level's display settings. Its type name is its identity and does not change. */
export function updateLevel(schema: TreeSchema, level: string, patch: Partial<Omit<EntityTypeConfig, 'type_name'>>): EditResult {
  const next: TreeSchema = clone(schema);
  const config: EntityTypeConfig | undefined = next.entity_type_configs.find((c: EntityTypeConfig) => c.type_name === level);
  if (!config) return refuse(`There is no level called ${level}.`);
  Object.assign(config, patch);
  // An empty label is allowed here, mid-edit, and stops the save instead (draftProblem):
  // refusing it would make a label impossible to clear and retype.
  if ([config.label, config.plural_label].some((l: string) => l.length > MAX_LABEL_CHARS)) {
    return refuse(`Labels must be at most ${MAX_LABEL_CHARS} characters.`);
  }
  if ([config.name_placeholder, config.description_placeholder].some((p: string) => p.length > MAX_PLACEHOLDER_CHARS)) {
    return refuse(`Placeholders must be at most ${MAX_PLACEHOLDER_CHARS} characters.`);
  }
  if (!LEVEL_ICONS.includes(config.icon)) return refuse('Pick one of the icons offered.');
  return { ok: true, schema: next };
}

/** Remove a level entirely. Refused while any office, room or other node of it exists. */
export function removeLevel(schema: TreeSchema, level: string, nodesOfLevel: number): EditResult {
  if (level === WORKSPACE_LEVEL) return refuse('The Workspace level cannot be removed.');
  if (nodesOfLevel > 0) return refuse(`${nodesOfLevel} ${nodesOfLevel === 1 ? 'item uses' : 'items use'} this level. Move or delete them first.`);
  const next: TreeSchema = clone(schema);
  next.entity_type_configs = next.entity_type_configs.filter((c: EntityTypeConfig) => c.type_name !== level);
  next.rules = next.rules
    .filter((r: NestingRule) => r.parent_type !== level)
    .map((r: NestingRule) => ({ ...r, allowed_child_types: r.allowed_child_types.filter((c: string) => c !== level) }));
  return { ok: true, schema: next };
}

/** What would stop the draft saving, before it is sent. The server re-checks all of it. */
export function draftProblem(schema: TreeSchema): string | null {
  if (childrenOf(schema, WORKSPACE_LEVEL).length === 0) return 'Nothing is allowed directly under the Workspace yet.';
  const placed: Set<string> = new Set<string>([WORKSPACE_LEVEL, ...schema.rules.flatMap((r: NestingRule) => r.allowed_child_types)]);
  const unplaced: string[] = levelNames(schema).filter((n: string) => !placed.has(n));
  const unnamed: EntityTypeConfig | undefined = schema.entity_type_configs.find(
    (c: EntityTypeConfig) => c.label.trim() === '' || c.plural_label.trim() === '',
  );
  if (unnamed) return `Give the level ${unnamed.type_name} a name for one and for several.`;
  if (unplaced.length > 0) return `Connect ${unplaced.join(', ')} under another level, or remove ${unplaced.length === 1 ? 'it' : 'them'}.`;
  return null;
}
