/**
 * A call must not be silently abandoned when the user navigates away from it.
 *
 * The only `<audio>` element lived inside `ParticipantTile`, which mounts only
 * in the conversation the call belongs to. Opening another chat, the file
 * manager or the directory unmounted every tile — so the peer's audio stopped
 * instantly while the microphone kept transmitting, and nothing on screen said
 * the user was still in a call or offered a way out. Deaf, still audible, no
 * hang-up.
 *
 * Both halves are asserted here: the audio element is owned above the router,
 * and a control to leave appears exactly when the call's own surface is not.
 */
import { describe, it, expect, vi, beforeEach   } from 'vitest';
import { render, screen, act , type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CallAudioHost } from '../CallAudioHost';
import { OngoingCallBar } from '../OngoingCallBar';
import { registerCallStage } from '../call-stage-presence';
import { CallContext , type CallContextValue } from '@/lib/call/call-context';
import type { CallState } from '@/lib/call/call-state';

const PEER: bigint = 42n;

function callState(status: CallState['status']): CallState {
  return {
    callId: 'c1',
    status,
    roomId: null,
    selfMedia: { audio: true, video: false, screen: false },
    participants: new Map([
      [PEER, { cid: PEER, username: 'bob', status: 'joined', media: { audio: true, video: false, screen: false }, speaking: false }],
    ]),
  } as unknown as CallState;
}

function harness(overrides: Partial<CallContextValue>) {
  const leave: ReturnType<typeof vi.fn> = vi.fn((): Promise<void> => Promise.resolve());
  const value: CallContextValue = {
    call: callState('active'),
    localStream: null,
    remoteStreams: new Map(),
    remoteAudioStreams: new Map(),
    remoteScreenStreams: new Map(),
    screenStream: null,
    qualities: new Map(),
    captureFailure: null,
    capability: { supported: true },
    leave,
    ...overrides,
  } as unknown as CallContextValue;
  return { value, leave };
}

beforeEach(() => {
  // jsdom has no media pipeline; play() must not reject into the render path.
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: () => Promise.resolve(),
  });
});

describe('CallAudioHost', () => {
  it('renders one audio element per remote stream, independent of any tile', () => {
    const stream: MediaStream = new (class {} as unknown as typeof MediaStream)();
    const { value } = harness({ remoteAudioStreams: new Map([[PEER, stream]]) });

    const { container } = render(
      <CallContext.Provider value={value}>
        <CallAudioHost />
      </CallContext.Provider>,
    );

    // Queried from the DOM rather than by role: the element is aria-hidden on
    // purpose — it is a speaker, not something to announce.
    expect(container.querySelectorAll('audio')).toHaveLength(1);
  });

  it('renders nothing when there is no remote audio', () => {
    const { value } = harness({});
    const { container } = render(
      <CallContext.Provider value={value}>
        <CallAudioHost />
      </CallContext.Provider>,
    );
    expect(container.querySelectorAll('audio')).toHaveLength(0);
  });
});

describe('OngoingCallBar', () => {
  function renderBar(value: CallContextValue): RenderResult {
    return render(
      <MemoryRouter>
        <CallContext.Provider value={value}>
          <OngoingCallBar />
        </CallContext.Provider>
      </MemoryRouter>,
    );
  }

  it('offers a way to leave when the call surface is not on screen', async () => {
    const { value, leave } = harness({});
    renderBar(value);

    const button: HTMLElement = screen.getByRole('button', { name: /leave call/i });
    await userEvent.click(button);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('names who the call is with', () => {
    const { value } = harness({});
    renderBar(value);
    expect(screen.getByText(/in call with bob/i)).toBeInTheDocument();
  });

  it('stands down while the call surface IS on screen', () => {
    const { value } = harness({});
    let release: () => void = () => undefined;
    act(() => {
      release = registerCallStage();
    });

    renderBar(value);
    expect(screen.queryByRole('button', { name: /leave call/i })).toBeNull();

    act(() => release());
  });

  it('shows nothing when there is no call', () => {
    const { value } = harness({ call: null });
    renderBar(value);
    expect(screen.queryByRole('button', { name: /leave call/i })).toBeNull();
  });

  it('shows nothing for an incoming call, which has its own card', () => {
    const { value } = harness({ call: callState('ringing-in') });
    renderBar(value);
    expect(screen.queryByRole('button', { name: /leave call/i })).toBeNull();
  });
});
