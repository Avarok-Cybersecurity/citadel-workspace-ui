import { useEffect, useMemo, useState } from 'react';
import { CallProvider } from './CallProvider';
import { CallSoundEffects } from './CallSoundEffects';
import { IncomingCallCard } from './IncomingCallCard';
import { useCall } from '@/lib/call/call-context';
import { connectionManager } from '@/lib/connection';
import type { MessageSenderConfig } from '@/lib/p2p/message-sender-types';

/**
 * Mounts calling for the whole app: the provider that owns a call, and the
 * ringing card that has to be reachable from wherever the user happens to be.
 */
export function CallLayer({ children }: { children: React.ReactNode }) {
  const [selfCid, setSelfCid] = useState<bigint | null>(null);

  useEffect(() => {
    // Polled rather than subscribed because connection identity settles
    // asynchronously during login, and calling is unavailable until it has.
    const read = () => setSelfCid(connectionManager.getConnectionInfo()?.cid ?? null);
    read();
    const timer = window.setInterval(read, 2000);
    return () => window.clearInterval(timer);
  }, []);

  const senderConfig = useMemo<Pick<MessageSenderConfig, 'getCurrentCid'>>(
    () => ({
      getCurrentCid: async () => connectionManager.getConnectionInfo()?.cid ?? null,
    }),
    [],
  );

  return (
    <CallProvider selfCid={selfCid} senderConfig={senderConfig as MessageSenderConfig}>
      <CallSoundEffects />
      <RingingCall />
      {children}
    </CallProvider>
  );
}

/**
 * The ringing card, rendered wherever the user is.
 *
 * Separate from CallLayer so it can consume the context CallLayer provides —
 * a component cannot read a provider it is itself rendering.
 */
function RingingCall() {
  const { call, accept, decline } = useCall();

  if (!call || call.status !== 'ringing-in') return null;

  const caller = [...call.participants.values()][0];
  if (!caller) return null;

  return (
    <IncomingCallCard
      callerName={caller.username}
      media={caller.media}
      roomName={call.roomId}
      onAccept={(media) => void accept(media)}
      onDecline={() => void decline()}
    />
  );
}
