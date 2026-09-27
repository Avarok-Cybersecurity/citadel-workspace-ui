/**
 * Sentences about the hierarchy use the workspace's own words for its levels.
 *
 * Owner, 2026-09-27: the hierarchy is editable, "default to Workspace -> Office -> Room".
 * Permission names, refusals and empty states said "offices and rooms" regardless, so a workspace
 * organised as divisions and teams was told about offices it does not have.
 *
 * No mocks: the registry is fed a real schema, as the tree:schema:loaded handler feeds it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { TreeSchema } from '@/components/layout/sidebar/tree-node-types';
import { levelsPhrase, setTreeSchema } from '../entity-type-registry';
import { Permission, permissionLabel } from '../permissions-service/types';

const cfg = (type_name: string, plural: string): TreeSchema['entity_type_configs'][number] => ({
  type_name, icon: 'folder', label: type_name, plural_label: plural, name_placeholder: '', description_placeholder: '', chat_default: true,
});
const schema = (levels: Array<[string, string]>): TreeSchema => ({
  id: 's', name: 's', max_depth: levels.length, rules: [],
  entity_type_configs: [cfg('Workspace', 'Workspaces'), ...levels.map(([t, p]) => cfg(t, p))],
});

afterEach(() => { setTreeSchema(schema([['Office', 'Offices'], ['Room', 'Rooms']])); });

describe('the words for the levels', () => {
  it('are offices and rooms by default', () => {
    setTreeSchema(schema([['Office', 'Offices'], ['Room', 'Rooms']]));
    expect(levelsPhrase()).toBe('offices and rooms');
    expect(permissionLabel(Permission.CreateNode)).toBe('Create offices and rooms');
  });

  it('are the custom levels in a workspace organised differently', () => {
    setTreeSchema(schema([['Division', 'Divisions'], ['Department', 'Departments'], ['Team', 'Teams']]));
    expect(levelsPhrase()).toBe('divisions, departments and teams');
    expect(permissionLabel(Permission.ManageNodeMembers)).toBe('Manage who is in divisions, departments and teams');
  });

});
