import type { P2PMessage } from '@/lib/p2p';

/**
 * A line the app writes into the thread (`message_type: 'system_notice'`).
 * Nobody typed it, so it has no bubble, no sender styling and no actions.
 */
export function SystemNoticeLine({ message }: { message: P2PMessage }): JSX.Element {
  return (
    <p role="status" className="w-full text-center text-xs text-muted-foreground py-1">
      {message.content}
    </p>
  );
}
