/**
 * State-to-sound wiring: ring while ringing, silence the instant the state
 * leaves ringing, chime on connect and hang-up. The sound module is mocked at
 * the module boundary because it IS the injected audio layer — its own logic
 * is covered against fakes in call-sounds.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { CallSoundEffects } from '../CallSoundEffects';
import { CallContext, type CallContextValue } from '@/lib/call/call-context';
import type { CallState } from '@/lib/call/call-state';

const player = {
  startRing: vi.fn(() => Promise.resolve()),
  stopRing: vi.fn(),
  chime: vi.fn(),
  isRinging: vi.fn(() => false),
};

vi.mock('@/lib/call/call-sounds', () => ({
  callSounds: () => player,
}));

function contextValue(call: CallState | null): CallContextValue {
  return {
    call,
    localStream: null,
    remoteStreams: new Map(),
    remoteAudioStreams: new Map(),
  qualities: new Map(),
    captureFailure: null,
    capability: { supported: true },
    startCall: async () => {},
    accept: async () => {},
    decline: async () => {},
    leave: async () => {},
    toggleMic: async () => {},
    toggleCamera: async () => {},
  };
}

function callState(status: CallState['status']): CallState {
  return {
    callId: 'call-9',
    status,
    roomId: null,
    outgoing: status === 'ringing-out',
    caller: null,
    selfMedia: { audio: true, video: false, screen: false },
    participants: new Map(),
    reason: null,
  };
}

function mount(call: CallState | null) {
  return render(
    <CallContext.Provider value={contextValue(call)}>
      <CallSoundEffects />
    </CallContext.Provider>,
  );
}

function update(view: ReturnType<typeof mount>, call: CallState | null) {
  view.rerender(
    <CallContext.Provider value={contextValue(call)}>
      <CallSoundEffects />
    </CallContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CallSoundEffects', () => {
  it('rings for an incoming call and stops on accept, chiming when active', async () => {
    const view = mount(callState('ringing-in'));
    await waitFor(() => expect(player.startRing).toHaveBeenCalledWith('incoming', 'call-9'));

    update(view, callState('connecting'));
    await waitFor(() => expect(player.stopRing).toHaveBeenCalled());
    expect(player.chime).not.toHaveBeenCalled();

    update(view, callState('active'));
    await waitFor(() => expect(player.chime).toHaveBeenCalledWith('connected'));
  });

  it('plays the quieter ringback for the caller', async () => {
    mount(callState('ringing-out'));
    await waitFor(() => expect(player.startRing).toHaveBeenCalledWith('ringback', 'call-9'));
  });

  it('stops on decline without any chime', async () => {
    const view = mount(callState('ringing-in'));
    await waitFor(() => expect(player.startRing).toHaveBeenCalled());

    update(view, null);
    await waitFor(() => expect(player.stopRing).toHaveBeenCalled());
    expect(player.chime).not.toHaveBeenCalled();
  });

  it('chimes the lower tone when an active call ends', async () => {
    const view = mount(callState('active'));
    await waitFor(() => expect(player.chime).toHaveBeenCalledWith('connected'));

    update(view, callState('ended'));
    await waitFor(() => expect(player.chime).toHaveBeenCalledWith('ended'));
  });

  it('touches no audio at all while there has never been a call', async () => {
    mount(null);
    // Give any (wrong) dynamic import a chance to land before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(player.startRing).not.toHaveBeenCalled();
    expect(player.stopRing).not.toHaveBeenCalled();
    expect(player.chime).not.toHaveBeenCalled();
  });
});
