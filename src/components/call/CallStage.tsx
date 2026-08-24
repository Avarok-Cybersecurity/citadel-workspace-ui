import { useMemo } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ParticipantTile, type ConnectionQuality } from './ParticipantTile';
import { CallControls } from './CallControls';
import type { CallState } from '@/lib/call/call-state';

interface CallStageProps {
  call: CallState;
  selfUsername: string;
  localStream: MediaStream | null;
  remoteStreams: Map<bigint, MediaStream>;
  qualities?: Map<bigint, ConnectionQuality>;
  duration: string;
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
  duration,
  onToggleMic,
  onToggleCamera,
  onLeave,
}: CallStageProps) {
  const visible = useMemo(
    () => [...call.participants.values()].filter((p) => p.status !== 'declined' && p.status !== 'left'),
    [call.participants],
  );

  const anyVideo = call.selfMedia.video || visible.some((p) => p.media.video);
  const tileCount = visible.length + 1;

  return (
    <section
      data-testid="call-stage"
      aria-label={callLabel(call, visible.length)}
      className="m-3 rounded-lg border border-border bg-card p-3"
    >
      {call.status === 'failed' ? (
        <StatusPanel
          tone="error"
          title="The call could not start"
          detail={call.reason ?? 'Something went wrong setting up the call.'}
        />
      ) : call.status === 'ringing-out' ? (
        <StatusPanel tone="pending" title="Calling…" detail={ringingDetail(visible.length)} />
      ) : (
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
      )}

      <div className="mt-3">
        <CallControls
          media={call.selfMedia}
          canToggleVideo={call.status === 'active' || call.status === 'connecting'}
          onToggleMic={onToggleMic}
          onToggleCamera={onToggleCamera}
          onLeave={onLeave}
          duration={duration}
        />
      </div>
    </section>
  );
}

function callLabel(call: CallState, others: number): string {
  if (call.status === 'ringing-out') return 'Outgoing call, ringing';
  return others === 1 ? 'Call in progress' : `Call in progress with ${others} people`;
}

function ringingDetail(count: number): string {
  return count === 1 ? 'Waiting for them to answer.' : `Waiting for ${count} people to answer.`;
}

function StatusPanel({
  tone,
  title,
  detail,
}: {
  tone: 'pending' | 'error';
  title: string;
  detail: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-md bg-surface p-4"
      // Assertive for a failure the user must act on; polite while ringing,
      // which is information rather than a demand.
      role={tone === 'error' ? 'alert' : 'status'}
      data-testid={tone === 'error' ? 'call-error' : 'call-ringing'}
    >
      {tone === 'error' ? (
        <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
      ) : (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary-accent" aria-hidden="true" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
