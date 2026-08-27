import { useNavigate } from 'react-router-dom';
import { PhoneOff, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCall } from '@/lib/call/call-context';
import { useCallStageVisible } from './call-stage-presence';
import { useCallDuration } from './use-call-duration';

/**
 * "You are in a call" — shown when the call's own surface is not on screen.
 *
 * Without this, navigating away from a call's conversation left no indication
 * anywhere that the call was still running, and no way to end it: the only
 * hang-up control lives on the stage that just unmounted. A user could walk
 * away from a live microphone believing the call had ended with the page.
 */
export function OngoingCallBar() {
  const { call, leave } = useCall();
  const stageVisible = useCallStageVisible();
  const navigate = useNavigate();
  const duration = useCallDuration(call?.status === 'active');

  if (!call) return null;
  if (stageVisible) return null;
  // Ringing has its own card; this is for calls that are already running.
  if (call.status !== 'active' && call.status !== 'connecting') return null;

  // `participants` holds the other side only — self is rendered separately by
  // the stage. Filtered the same way the stage filters, so the count the bar
  // reports and the tiles the user would see on Return agree.
  const others = [...call.participants.values()].filter(
    (p) => p.status !== 'declined' && p.status !== 'left',
  );
  const who = others.length === 1 ? others[0].username : `${others.length} people`;

  const returnToCall = () => {
    if (call.roomId) {
      navigate(`/groups/${call.roomId}`);
      return;
    }
    const peer = others[0];
    // `channel`, which is the param the Messages page reads. This said `peer`,
    // which nothing reads anywhere -- so during a 1:1 call, leaving the
    // conversation and pressing Return landed on "No conversation selected",
    // the call stage never came back, and the bar kept floating over it. Wired
    // from one end: the button navigated, the page never listened.
    if (peer) navigate(`/messages?channel=${peer.cid.toString()}`);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-lg"
    >
      <Radio className="h-4 w-4 shrink-0 text-primary-accent" aria-hidden="true" />
      <span className="min-w-0 truncate text-sm">
        In call with {who}
        <span className="ml-2 tabular-nums text-muted-foreground">{duration}</span>
      </span>
      <Button size="sm" variant="secondary" onClick={returnToCall}>
        Return
      </Button>
      <Button
        size="sm"
        variant="destructive"
        aria-label="Leave call"
        onClick={() => void leave()}
      >
        <PhoneOff className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
