import { Button } from '@/components/ui/button';
import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CallMediaKinds } from '@/types/p2p-commands';
import { useCallDuration } from './use-call-duration';

interface CallControlsProps {
  media: CallMediaKinds;
  /** False while the call is still connecting; leaving must stay available. */
  canToggleVideo: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
  /** Shown beside the controls; hidden below sm where space is scarce. */
  /**
   * Whether the call clock should be running.
   *
   * This used to take the formatted string, computed by a 1 Hz hook up in
   * `use-direct-call` — which is called from `P2PChat`, so every tick
   * re-rendered the entire conversation, including every message bubble, for
   * the whole duration of every call. Owning the tick here confines it to the
   * one element that displays it.
   */
  running: boolean;
}

/**
 * The in-call control row.
 *
 * Five controls, not fifty. Everything here is something a person reaches for
 * mid-sentence, so each is a single press with no menu in the way.
 */
export function CallControls({
  media,
  canToggleVideo,
  onToggleMic,
  onToggleCamera,
  onLeave,
  running,
}: CallControlsProps) {
  const duration: string = useCallDuration(running);
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" data-testid="call-controls">
      <ToggleButton
        active={media.audio}
        onClick={onToggleMic}
        testId="call-toggle-mic"
        label="Microphone"
        OnIcon={Mic}
        OffIcon={MicOff}
      />

      <ToggleButton
        active={media.video}
        onClick={onToggleCamera}
        disabled={!canToggleVideo}
        testId="call-toggle-camera"
        label="Camera"
        OnIcon={Video}
        OffIcon={VideoOff}
      />

      <span
        className="hidden px-2 text-sm tabular-nums text-muted-foreground sm:inline"
        // Announcing every second would make a screen reader unusable; the
        // duration is reported once when the call ends instead.
        aria-hidden="true"
        data-testid="call-duration"
      >
        {duration}
      </span>

      <Button
        variant="destructive"
        size="sm"
        onClick={onLeave}
        data-testid="call-leave"
        className="ml-1"
      >
        <PhoneOff className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Leave
      </Button>
    </div>
  );
}

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
  label: string;
  OnIcon: typeof Mic;
  OffIcon: typeof MicOff;
}

function ToggleButton({ active, onClick, disabled, testId, label, OnIcon, OffIcon }: ToggleButtonProps) {
  const Icon = active ? OnIcon : OffIcon;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      // aria-pressed carries the state, so the label must NOT also flip with
      // it. Paired, they contradict: "Mute microphone" + pressed announced as
      // "Mute microphone, pressed", which a listener reads as *muted* -- while
      // the mic was in fact live. On a privacy control that is the worst
      // possible direction to be wrong in. The label now names the thing and
      // the state names the state, which is what aria-pressed is for.
      aria-pressed={active}
      aria-label={label}
      // The visible tooltip can still say what the click will DO, because a
      // sighted user reads it alongside the icon rather than as a sentence.
      title={active ? `${label} on` : `${label} off`}
      className={cn(
        'h-10 w-10 rounded-full',
        active
          ? 'bg-surface text-foreground hover:bg-surface/80'
          // Destructive fill for "off" is the universal convention for a muted
          // mic, and it survives every workspace theme because it is a token.
          : 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}
