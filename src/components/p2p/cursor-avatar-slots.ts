/**
 * Where collaborator avatars are drawn.
 *
 * The cursor widget is plain DOM that ProseMirror owns, so it cannot hold a
 * React component -- and a second React root would lose the workspace context
 * MemberAvatar reads its picture from. The widget instead leaves an empty slot
 * element and registers it here; the editor renders `MemberAvatar` into every
 * registered slot through a portal, inside the app's own tree.
 */

import { notifyEach } from '@/lib/notify-listeners';

export interface AvatarSlot { id: number; element: HTMLElement; name: string }

type Listener = () => void;
let slots: readonly AvatarSlot[] = [];
let nextId: number = 0;
const listeners: Set<Listener> = new Set<Listener>();

function publish(next: readonly AvatarSlot[]): void {
  slots = next;
  notifyEach(listeners, 'avatar slots');
}

/** Registers a slot; the returned function removes it. */
export function registerAvatarSlot(element: HTMLElement, name: string): () => void {
  const slot: AvatarSlot = { id: nextId++, element, name };
  publish([...slots, slot]);
  return (): void => publish(slots.filter((s) => s !== slot));
}

export function subscribeToAvatarSlots(listener: Listener): () => void {
  listeners.add(listener);
  return (): void => { listeners.delete(listener); };
}

export function avatarSlotsSnapshot(): readonly AvatarSlot[] {
  return slots;
}
