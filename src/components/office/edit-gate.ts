/**
 * Whether the office page offers Edit, and what it says when it does not.
 *
 * Two defects: a member denied Edit Content got an enabled Edit after a reload
 * (the gate treated "not answered yet" as yes), and on a page with no node --
 * the workspace view before, or without, a default office -- Edit opened an
 * editor whose Save said "This page is still loading" forever, because there
 * is no page to write to.
 */
import { gateOnKnownAnswer, type ActionGate, type UsePermissionResult } from '@/hooks/use-permission-result';
import { levelsPhrase } from '@/lib/entity-type-registry';

/** Why a page with no node cannot be edited or saved. */
export function noPageReason(nodesLoading: boolean): string {
  return nodesLoading
    ? 'The workspace is still opening. Try again in a moment.'
    : `This page isn't stored anywhere, so there is nothing to save to. Open one of the workspace's ${levelsPhrase()} to edit its page.`;
}

export function editGate(nodeId: string | undefined, nodesLoading: boolean, edit: UsePermissionResult): ActionGate {
  if (!nodeId) return { enabled: false, reason: noPageReason(nodesLoading) };
  return gateOnKnownAnswer(edit);
}
