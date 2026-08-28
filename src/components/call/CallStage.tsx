import { useEffect, useMemo } from 'react';
import { AlertCircle, PhoneOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getInitials } from '@/components/chat/shared/formatters';
import { ParticipantTile, type ConnectionQuality } from './ParticipantTile';
import { CallControls } from './CallControls';
import type { CallParticipant, CallState } from '@/lib/call/call-state';
import { registerCallStage } from './call-stage-presence';

interface CallStageProps {
  call: CallState;
  selfUsername: string;
  localStream: MediaStream | null;
  remoteStreams: Map<bigint, MediaStream>;
  /** Remote audio per peer; each tile owns playing its participant's sound. */
  qualities?: Map<bigint, ConnectionQuality>;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
}

/**
 * The in-call surface, docked above the conversation it belongs to.
 *
 * Docked rather than a route or a modal. A route would fight the existing
 * /messages and /groups model and kill media on unmount; a modal would block the
 * file transfers and documents people plausibly want DURING a call. Sitting
 * above the message list keeps the chat usable, which is the entire reason to
 * put calling inside a messaging product.
 */
export function CallStage({
  call,
  selfUsername,
  localStream,
  remoteStreams,
  qualities,
  onToggleMic,
  onToggleCamera,
  onLeave,
}: CallStageProps) {
  // Tells OngoingCallBar to stand down: the call's own surface is on screen, so
  // the user can already see and end the call from here.
  useEffect(() => registerCallStage(), []);

  const visible: CallParticipant[] = useMemo(
    () => [...call.participants.values()].filter((p) => p.status !== 'declined' && p.status !== 'left'),
    [call.participants],
  );

  const anyVideo = call.selfMedia.video || visible.some((p) => p.media.video);
  const tileCount: number = visible.length + 1;

  return (
    <section
      data-testid="call-stage"
      aria-label={callLabel(call, visible.length)}
      className="m-3 rounded-lg border border-border bg-card p-3"
    >
      {call.status === 'failed' ? (
        <ErrorPanel
          title="The call could not start"
          detail={call.reason ?? 'Something went wrong setting up the call.'}
        />
      ) : call.status === 'ringing-out' ? (
        <OutgoingCallPanel invitees={visible} onCancel={onLeave} />
      ) : (
        <>
          {/* Accept-to-first-frame gap: without this the stage looks frozen at
              the exact moment the user is judging whether the call worked. */}
          {call.status === 'connecting' && <ConnectingBanner />}
          <div
          className={cn(
            'grid gap-2',
            // Audio-only stays a compact strip: a grid of avatars is a lot of
            // space to spend saying nothing.
            !anyVideo && 'grid-cols-1',
            anyVideo && tileCount <= 2 && 'grid-cols-1 sm:grid-cols-2',
            anyVideo && tileCount > 2 && 'grid-cols-2',
          )}
          data-testid="call-participants"
        >
          {visible.map((participant) => (
            <ParticipantTile
              key={participant.cid.toString()}
              participant={participant}
              stream={remoteStreams.get(participant.cid) ?? null}
              isSelf={false}
              quality={qualities?.get(participant.cid) ?? 'good'}
            />
          ))}
          <ParticipantTile
            participant={{
              cid: -1n,
              username: selfUsername,
              status: 'active',
              media: call.selfMedia,
              speaking: false,
            }}
            stream={localStream}
            isSelf
          />
          </div>
        </>
      )}

      <div className="mt-3">
        <CallControls
          media={call.selfMedia}
          canToggleVideo={call.status === 'active' || call.status === 'connecting'}
          onToggleMic={onToggleMic}
          onToggleCamera={onToggleCamera}
          onLeave={onLeave}
          running={call.status === 'active'}
        />
      </div>
    </section>
  );
}

function callLabel(call: CallState, others: number): string {
  if (call.status === 'ringing-out') return 'Outgoing call, ringing';
  if (call.status === 'connecting') return 'Call connecting';
  return others === 1 ? 'Call in progress' : `Call in progress with ${others} people`;
}

function ringingDetail(count: number): string {
  return count === 1 ? 'Waiting for them to answer.' : `Waiting for ${count} people to answer.`;
}

/**
 * Who is being called, not just that a call exists. The halo rings animate
 * only under motion-safe; reduced-motion users get the same layout with a
 * static accent ring, not a slowed-down animation.
 */
function OutgoingCallPanel({
  invitees,
  onCancel,
}: {
  invitees: CallParticipant[];
  onCancel: () => void;
}) {
  const first: CallParticipant = invitees[0];
  const calleeName: string = first?.username ?? 'Unknown';
  const title: string =
    invitees.length > 1 ? `Calling ${calleeName} and ${invitees.length - 1} more…` : `Calling ${calleeName}…`;

  return (
    // Polite live region: ringing is information, not a demand.
    <div
      role="status"
      data-testid="call-ringing"
      className="flex flex-col items-center gap-4 rounded-md bg-surface px-4 py-8"
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2 border-primary-accent motion-safe:animate-ring-pulse"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2 border-primary-accent motion-safe:animate-ring-pulse motion-safe:[animation-delay:1.2s]"
        />
        <Avatar className="h-16 w-16 ring-2 ring-primary-accent/70">
          <AvatarFallback className="bg-card text-lg text-foreground">
            {getInitials(calleeName)}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{ringingDetail(invitees.length)}</p>
      </div>
      <Button variant="destructive" size="sm" onClick={onCancel} data-testid="call-cancel">
        <PhoneOff className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Cancel
      </Button>
    </div>
  );
}

function ConnectingBanner() {
  return (
    <div
      role="status"
      data-testid="call-connecting"
      className="mb-2 flex items-center gap-2 rounded-md bg-surface px-3 py-2"
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-primary-accent opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-accent" />
      </span>
      <p className="text-xs text-muted-foreground">Connecting…</p>
    </div>
  );
}

function ErrorPanel({ title, detail }: { title: string; detail: string }) {
  return (
    // Assertive: a failure the user must act on.
    <div
      className="flex items-center gap-3 rounded-md bg-surface p-4"
      role="alert"
      data-testid="call-error"
    >
      <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
