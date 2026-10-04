import { createPortal } from 'react-dom';
import { useSyncExternalStore } from 'react';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { avatarSlotsSnapshot, subscribeToAvatarSlots, type AvatarSlot } from './cursor-avatar-slots';

/** Draws each collaborator's avatar into the slot their cursor tag reserved. */
export function CursorAvatars(): JSX.Element {
  const slots: readonly AvatarSlot[] = useSyncExternalStore(subscribeToAvatarSlots, avatarSlotsSnapshot);
  return (
    <>
      {slots.map((slot) => createPortal(
        <MemberAvatar username={slot.name} name={slot.name} className="h-4 w-4" />,
        slot.element,
        String(slot.id),
      ))}
    </>
  );
}
