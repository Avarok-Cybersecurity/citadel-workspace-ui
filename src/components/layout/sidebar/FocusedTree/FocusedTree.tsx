/**
 * The focused hierarchy: the ancestor stack, then the selected node among its
 * siblings, with only the selected node's children unfolded (plus any peer the
 * user peeks into). Selection alone defines the view -- see focused-view.ts --
 * so only the peeks and an expanded deep stack are local state, and both reset
 * whenever the selection moves.
 *
 * Only ancestors, one sibling set and one child set are mounted, so a
 * 2,000-node estate costs what a 20-node one does.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { SidebarMenu } from '@/components/ui/sidebar';
import type { DomainNode } from '../tree-node-types';
import { childIndex, focusedView, stackRows, type ChildIndex, type FocusedView, type StackRow } from '../focused-view';
import { AnimatePresence, AutoHeight, PresenceScope } from './tree-motion';
import { AncestorRow, MoreAncestorsRow } from './AncestorRow';
import { SiblingRow } from './SiblingRow';
import type { NodeActions } from './NodeActionsMenu';
import { addChildLabel, childCountLabel } from './level-labels';
import { useTreeKeyboard, type TreeKeyboard } from './useTreeKeyboard';

interface FocusedTreeProps {
  nodes: Readonly<Record<string, DomainNode>>;
  root: DomainNode;
  selectedId: string | null;
  isMobile: boolean;
  /** The ⋯ menu's handlers for a stored node; the synthetic root offers only Admin Settings and Add. */
  actions: NodeActions;
  /** False when creating would be refused: no Add rows, no "Add Child". */
  canAdd: boolean;
  onSelect: (nodeId: string) => void;
  onAdd: (parentId: string) => void;
}

export function FocusedTree({ nodes, root, selectedId, isMobile, actions, canAdd, onSelect, onAdd }: FocusedTreeProps): JSX.Element {
  const index: ChildIndex = useMemo((): ChildIndex => childIndex(nodes, root), [nodes, root]);
  const view: FocusedView = useMemo(
    (): FocusedView => focusedView({ nodes, children: index, selectedId, root }),
    [nodes, index, selectedId, root],
  );
  const [peeked, setPeeked] = useState<ReadonlySet<string>>(new Set());
  const [stackOpen, setStackOpen] = useState<boolean>(false);
  useEffect((): void => {
    setPeeked(new Set());
    setStackOpen(false);
  }, [view.selected.id]);

  const togglePeek: (nodeId: string) => void = useCallback((nodeId: string): void => {
    setPeeked((prev: ReadonlySet<string>): ReadonlySet<string> => {
      const next: Set<string> = new Set(prev);
      if (!next.delete(nodeId)) next.add(nodeId);
      return next;
    });
  }, []);

  const keyboard: TreeKeyboard = useTreeKeyboard({
    viewKey: `${view.selected.id}|${[...peeked].join(',')}|${stackOpen}`,
    onSelect,
    onPeek: togglePeek,
  });

  const rows: StackRow[] = stackRows(view.ancestors, stackOpen);
  const parent: DomainNode | undefined = view.ancestors[view.ancestors.length - 1];
  const isStoredRoot: boolean = Boolean(nodes[root.id]);
  const actionsFor = (node: DomainNode): NodeActions => {
    const withAdd: NodeActions = { ...actions, onNodeCreate: canAdd ? actions.onNodeCreate : undefined };
    if (node.id !== root.id || isStoredRoot) return withAdd;
    return { onAdminSettings: withAdd.onAdminSettings, onNodeCreate: withAdd.onNodeCreate };
  };

  return (
    <SidebarMenu ref={keyboard.treeRef} role="tree" aria-label="Workspace hierarchy" onKeyDown={keyboard.onKeyDown} className="gap-0.5">
      <AnimatePresence initial={false}>
        {rows.length > 0 && (
          <motion.li
            key="ancestor-stack"
            role="none"
            layout="position"
            data-testid="tree-ancestor-stack"
            className="mb-2 overflow-hidden border border-primary-accent/35 bg-primary-accent/10 p-1"
            style={{ borderRadius: 7 }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <PresenceScope>
              <AutoHeight>
                <ul role="group" className="relative flex flex-col gap-px">
                  <AnimatePresence initial={false} mode="popLayout">
                    {rows.map((row: StackRow, i: number) => row.kind === 'more' ? (
                      <MoreAncestorsRow key="more" hidden={row.hidden} level={i + 1} isMobile={isMobile} onExpand={() => setStackOpen(true)} />
                    ) : (
                      <AncestorRow
                        key={row.node.id}
                        node={row.node}
                        level={row.level}
                        parentId={view.ancestors[row.level - 2]?.id ?? null}
                        childCountLabel={row.node.id === parent?.id ? childCountLabel(view.siblings) : null}
                        isMobile={isMobile}
                        onSelect={onSelect}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </AutoHeight>
            </PresenceScope>
          </motion.li>
        )}
      </AnimatePresence>
      <li role="none">
        {/* A very wide sibling set (sixty rooms on a floor) scrolls here; the stack above stays put. */}
        <motion.div layoutScroll className="max-h-[60vh] overflow-y-auto">
          <ul role="group" className="relative flex flex-col gap-0.5">
            <AnimatePresence initial={false} mode="popLayout">
              {view.siblings.map((sibling: DomainNode) => (
                <SiblingRow
                  key={sibling.id}
                  node={sibling}
                  level={view.ancestors.length + 1}
                  parentId={parent?.id ?? null}
                  isSelected={sibling.id === view.selected.id}
                  isRoot={sibling.id === root.id}
                  index={index}
                  isPeek={peeked.has(sibling.id)}
                  isMobile={isMobile}
                  addLabel={canAdd ? addChildLabel(sibling) : null}
                  actions={actionsFor(sibling)}
                  onSelect={onSelect}
                  onTogglePeek={togglePeek}
                  onAdd={onAdd}
                />
              ))}
            </AnimatePresence>
          </ul>
        </motion.div>
      </li>
    </SidebarMenu>
  );
}
