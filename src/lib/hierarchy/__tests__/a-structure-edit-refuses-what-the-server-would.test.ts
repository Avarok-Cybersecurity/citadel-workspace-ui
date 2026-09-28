/**
 * The hierarchy editor refuses, as the drag happens, the edits the server would refuse on save.
 *
 * Mirrors citadel-workspace-server-kernel `schema_rules.rs`: no cycles, nothing above the
 * Workspace, usable names, labels that fit, only drawable icons, and no removing a level that
 * offices or rooms still use.
 *
 * No mocks: pure edits over the real default schema shape.
 */
import { describe, it, expect } from 'vitest';
import type { TreeSchema } from '@/components/layout/sidebar/tree-node-types';
import { addLevel, connect, disconnect, removeLevel, updateLevel, draftProblem, childrenOf, type EditResult } from '../schema-edits';

const cfg = (type_name: string): TreeSchema['entity_type_configs'][number] => ({
  type_name, icon: 'folder', label: type_name, plural_label: `${type_name}s`, name_placeholder: '', description_placeholder: '', chat_default: true,
});
const DEFAULT: TreeSchema = {
  id: 'default', name: 'Default Schema', max_depth: 3,
  rules: [
    { parent_type: 'Workspace', allowed_child_types: ['Office'] },
    { parent_type: 'Office', allowed_child_types: ['Room'] },
    { parent_type: 'Room', allowed_child_types: [] },
  ],
  entity_type_configs: [cfg('Workspace'), cfg('Office'), cfg('Room')],
};

const ok = (r: EditResult): TreeSchema => { if (!r.ok) throw new Error(r.reason); return r.schema; };
const reason = (r: EditResult): string => { if (r.ok) throw new Error('expected a refusal'); return r.reason; };

describe('a structure edit', () => {
  it('adds a level and nests it, leaving the original untouched', () => {
    const withDesk: TreeSchema = ok(connect(ok(addLevel(DEFAULT, 'Desk')), 'Room', 'Desk'));
    expect(childrenOf(withDesk, 'Room')).toEqual(['Desk']);
    expect(childrenOf(DEFAULT, 'Room')).toEqual([]);
    expect(draftProblem(withDesk)).toBeNull();
  });

  it('refuses a loop, nesting the Workspace, and a level inside itself', () => {
    expect(reason(connect(DEFAULT, 'Room', 'Office'))).toContain('inside itself');
    expect(reason(connect(DEFAULT, 'Office', 'Office'))).toContain('inside itself');
    expect(reason(connect(DEFAULT, 'Room', 'Workspace'))).toContain('top of the hierarchy');
  });

  it('refuses a duplicate or unusable name', () => {
    expect(reason(addLevel(DEFAULT, 'Office'))).toContain('already');
    expect(reason(addLevel(DEFAULT, 'Of<fice'))).toContain('not a usable level name');
  });

  it('refuses a label that does not fit and an icon nothing can draw', () => {
    expect(reason(updateLevel(DEFAULT, 'Office', { label: 'x'.repeat(41) }))).toContain('Labels');
    expect(reason(updateLevel(DEFAULT, 'Office', { icon: 'https://evil.example/x.svg' }))).toContain('icons');
    expect(ok(updateLevel(DEFAULT, 'Office', { label: 'Department', plural_label: 'Departments' })).entity_type_configs[1].label).toBe('Department');
  });

  it('refuses removing a level that is in use, and removes it everywhere when it is not', () => {
    expect(reason(removeLevel(DEFAULT, 'Room', 3))).toContain('3 items use this level');
    const noRooms: TreeSchema = ok(removeLevel(DEFAULT, 'Room', 0));
    expect(childrenOf(noRooms, 'Office')).toEqual([]);
    expect(noRooms.entity_type_configs.map((c) => c.type_name)).toEqual(['Workspace', 'Office']);
  });

  it('names what would stop a save: an empty top, or a level connected to nothing', () => {
    expect(draftProblem(ok(disconnect(DEFAULT, 'Workspace', 'Office')))).toContain('directly under the Workspace');
    expect(draftProblem(ok(addLevel(DEFAULT, 'Desk')))).toContain('Connect Desk');
    // Clearing a label to retype it is allowed mid-edit; it is the save that is stopped.
    expect(draftProblem(ok(updateLevel(DEFAULT, 'Office', { label: '' })))).toContain('Give the level Office a name');
  });
});
