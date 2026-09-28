/**
 * The editor's graphs are views of the schema and of the tree, laid out top-down.
 *
 * No mocks: the real conversion and the real dagre layout.
 */
import { describe, it, expect } from 'vitest';
import type { DomainNode, TreeSchema } from '@/components/layout/sidebar/tree-node-types';
import { schemaToGraph, treeToGraph, dropProblem, edgeId, moveDestinations } from '../schema-graph';

const cfg = (type_name: string, label: string = type_name): TreeSchema['entity_type_configs'][number] => ({
  type_name, icon: 'folder', label, plural_label: `${label}s`, name_placeholder: '', description_placeholder: '', chat_default: true,
});
const SCHEMA: TreeSchema = {
  id: 's', name: 's', max_depth: 2,
  rules: [{ parent_type: 'Workspace', allowed_child_types: ['Office'] }, { parent_type: 'Office', allowed_child_types: ['Room'] }],
  entity_type_configs: [cfg('Workspace'), cfg('Office', 'Department'), cfg('Room')],
};
const node = (id: string, parent: string | null, type: string, name: string): DomainNode =>
  ({ id, parent_id: parent, entity_type: { Child: type }, name } as unknown as DomainNode);

describe('the Structure graph', () => {
  it('has a node per level, labelled as the schema labels it, and an edge per nesting rule', () => {
    const { nodes, edges } = schemaToGraph(SCHEMA);
    expect(nodes.map((n) => [n.id, n.data.label, n.data.isRoot])).toEqual([
      ['Workspace', 'Workspace', true], ['Office', 'Department', false], ['Room', 'Room', false],
    ]);
    expect(edges.map((e) => e.id)).toEqual([edgeId('Workspace', 'Office'), edgeId('Office', 'Room')]);
  });

  it('is laid out top-down: each level below the one containing it', () => {
    const { nodes } = schemaToGraph(SCHEMA);
    const y = (id: string): number => nodes.find((n) => n.id === id)!.position.y;
    expect(y('Workspace')).toBeLessThan(y('Office'));
    expect(y('Office')).toBeLessThan(y('Room'));
  });
});

describe('the Organisation graph', () => {
  it('hangs every node from its parent, and top-level nodes from the workspace', () => {
    const { nodes, edges } = treeToGraph([node('o1', 'workspace-root', 'Office', 'Ops'), node('r1', 'o1', 'Room', 'Standup')], 'Avarok');
    expect(nodes.map((n) => n.data.name)).toEqual(['Avarok', 'Ops', 'Standup']);
    expect(edges.map((e) => [e.source, e.target])).toEqual([['workspace-root', 'o1'], ['o1', 'r1']]);
  });

  it('refuses a drop the schema does not allow, in the schema\'s words', () => {
    const label = (t: string): string => SCHEMA.entity_type_configs.find((c) => c.type_name === t)!.label;
    expect(dropProblem(SCHEMA, 'Room', 'Office', label)).toBeNull();
    expect(dropProblem(SCHEMA, 'Office', 'Room', label)).toBe('A Room cannot contain a Department.');
  });
});

describe('where a node may be moved', () => {
  const nodes: Record<string, DomainNode> = {
    o1: { ...node('o1', 'workspace-root', 'Office', 'Ops'), depth: 1, allowed_child_types: ['Room'] } as DomainNode,
    o2: { ...node('o2', 'workspace-root', 'Office', 'Sales'), depth: 1, allowed_child_types: ['Room'] } as DomainNode,
    r1: { ...node('r1', 'o1', 'Room', 'Standup'), depth: 2, allowed_child_types: [] } as DomainNode,
  };

  it('offers a room every other office, and not the one it is in, nor the top', () => {
    expect(moveDestinations(SCHEMA, nodes, 'r1', 'Avarok')).toEqual([{ id: 'o2', name: 'Sales' }]);
  });

  it('offers an office nothing it cannot hold, and not the top it already sits at', () => {
    expect(moveDestinations(SCHEMA, nodes, 'o1', 'Avarok')).toEqual([]);
  });

  it('offers the top to a level allowed there once it sits lower down', () => {
    const lowered: Record<string, DomainNode> = { ...nodes, o2: { ...nodes.o2, parent_id: 'o1', depth: 2 } as DomainNode };
    expect(moveDestinations(SCHEMA, lowered, 'o2', 'Avarok')[0]).toEqual({ id: 'workspace-root', name: 'Avarok' });
  });
});

