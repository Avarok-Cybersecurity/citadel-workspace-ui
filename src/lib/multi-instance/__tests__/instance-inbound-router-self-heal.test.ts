import { describe, it, expect, vi, beforeEach   } from 'vitest';
import { eventEmitter } from '../../event-emitter';
import { ORPHAN_BUFFER_TIMEOUT_MS } from '../orphan-buffer';

// Mocks for both module-level singletons must be set up before the router is
// imported. The router subscribes to event-emitter inside its constructor and
// captures the singleton references, so any vi.mock factory has to be in place
// before the first `import` of the SUT module.
const instanceChannelMock = vi.hoisted(() => ({
  requestCidReport: vi.fn(),
  forwardToInstance: vi.fn(),
  broadcast: vi.fn(),
}));

const instanceManagerMock = vi.hoisted(() => ({
  instanceId: 'leader-instance',
  findInstanceByCid: vi.fn<(cid: bigint) => string | null>(),
  getAllInstances: vi.fn(() => [] as Array<{ instanceId: string; cid: bigint | null }>),
  registerInstance: vi.fn(),
}));

vi.mock('../instance-channel', () => ({ instanceChannel: instanceChannelMock }));
vi.mock('../instance-manager', () => ({ instanceManager: instanceManagerMock }));

// Import after mocks are in place.
import { instanceInboundRouter } from '../instance-inbound-router';

describe('InstanceInboundRouter self-heal (CID-routed message for unknown CID)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Router only routes when it's the active leader; flip it on for every
    // test so a previous test's "not leader" state can't bleed through.
    eventEmitter.emit('instance:leader-changed', {
      isLeader: true,
      leaderId: 'leader-instance',
    });
  });

  it('asks every other instance to re-broadcast its CID when the target CID is unowned', () => {
    instanceManagerMock.findInstanceByCid.mockReturnValue(null);

    const cidRoutedMessage: { MessageNotification: { cid: string; peer_cid: string; message: number[]; request_id: null; }; } = {
      MessageNotification: {
        cid: '12345',
        peer_cid: '99',
        message: [1, 2, 3],
        request_id: null,
      },
    };

    instanceInboundRouter.routeMessage(cidRoutedMessage);

    expect(instanceChannelMock.requestCidReport).toHaveBeenCalledTimes(1);
    expect(instanceChannelMock.forwardToInstance).not.toHaveBeenCalled();
  });

  it('buffers the orphaned message instead of processing it locally up front', () => {
    instanceManagerMock.findInstanceByCid.mockReturnValue(null);

    const local: ReturnType<typeof vi.fn> = vi.fn();
    eventEmitter.on('websocket-message', local);

    const cidRoutedMessage: { FileTransferRequestNotification: { cid: string; peer_cid: string; request_id: null; }; } = {
      FileTransferRequestNotification: {
        cid: '67890',
        peer_cid: '11',
        request_id: null,
      },
    };

    try {
      instanceInboundRouter.routeMessage(cidRoutedMessage);
      // Pre-buffer behaviour: would have called local immediately.
      // Post-buffer: local processing is deferred until either the
      // fallback timer fires or a matching cid-update arrives.
      expect(local).not.toHaveBeenCalled();
      expect(instanceChannelMock.requestCidReport).toHaveBeenCalledTimes(1);
    } finally {
      eventEmitter.off('websocket-message', local);
    }
  });

  it('drains the buffer to the correct instance when its cid-report arrives in time', () => {
    instanceManagerMock.findInstanceByCid
      .mockReturnValueOnce(null)        // first lookup: unowned, message gets buffered
      .mockReturnValueOnce('follower-x') // second lookup (replay): now owned by follower-x
      ;

    const local: ReturnType<typeof vi.fn> = vi.fn();
    eventEmitter.on('websocket-message', local);

    const cidRoutedMessage: { MessageNotification: { cid: string; peer_cid: string; message: number[]; request_id: null; }; } = {
      MessageNotification: {
        cid: '44444',
        peer_cid: '99',
        message: [1, 2, 3],
        request_id: null,
      },
    };

    try {
      instanceInboundRouter.routeMessage(cidRoutedMessage);
      expect(local).not.toHaveBeenCalled();
      expect(instanceChannelMock.forwardToInstance).not.toHaveBeenCalled();

      // Follower's cid-report lands. Emitted here by hand because this suite
      // mocks instanceManager wholesale — see the companion test below, which
      // covers the half this cannot: that the real registerInstance actually
      // emits. Without that, deleting the sole production emitter leaves the
      // buffer undrained (orphaned messages, call media included, land on the
      // leader tab) while this test stays green.
      eventEmitter.emit('instance:registered', {
        instanceId: 'follower-x',
        cid: 44444n,
      });

      expect(instanceChannelMock.forwardToInstance).toHaveBeenCalledTimes(1);
      // The third argument is the ack id: forwards are retained by the leader
      // until the target confirms, so it must be present and non-empty.
      expect(instanceChannelMock.forwardToInstance).toHaveBeenCalledWith(
        'follower-x',
        cidRoutedMessage,
        expect.any(String),
      );
      // Local processing was NOT triggered — the buffer + replay path
      // bypasses the fallback when the owner shows up in time.
      expect(local).not.toHaveBeenCalled();
    } finally {
      eventEmitter.off('websocket-message', local);
    }
  });

  it('falls back to local processing when the fallback timer fires before any cid-report', async () => {
    instanceManagerMock.findInstanceByCid.mockReturnValue(null);

    const local = vi.fn();
    eventEmitter.on('websocket-message', local);

    const cidRoutedMessage: { MessageNotification: { cid: string; peer_cid: string; message: number[]; request_id: null; }; } = {
      MessageNotification: {
        cid: '99999',
        peer_cid: '11',
        message: [9, 9, 9],
        request_id: null,
      },
    };

    try {
      vi.useFakeTimers();
      instanceInboundRouter.routeMessage(cidRoutedMessage);
      expect(local).not.toHaveBeenCalled();

      // Advance past the orphan buffer's fallback timeout. No
      // `instance:registered` arrived, so the fallback timer fires
      // and the leader processes the message locally — preserving the
      // pre-buffer guarantee that no message is ever silently dropped.
      vi.advanceTimersByTime(ORPHAN_BUFFER_TIMEOUT_MS + 1);

      // A MessageNotification is now held briefly for the P2P handler, which
      // never attaches in a unit test. The hold is bounded precisely so this
      // guarantee survives: past the release timeout it is emitted regardless,
      // to whoever IS listening. Holding forever would trade a rare lost
      // message for a permanently stranded one.
      vi.advanceTimersByTime(2001);

      expect(local).toHaveBeenCalledTimes(1);
      expect(local).toHaveBeenCalledWith(cidRoutedMessage);
    } finally {
      vi.useRealTimers();
      eventEmitter.off('websocket-message', local);
    }
  });

  it('does NOT request a CID report when an instance already owns the target CID', () => {
    instanceManagerMock.findInstanceByCid.mockReturnValue('follower-instance');

    const cidRoutedMessage: { MessageNotification: { cid: string; peer_cid: string; message: number[]; request_id: null; }; } = {
      MessageNotification: {
        cid: '12345',
        peer_cid: '99',
        message: [1, 2, 3],
        request_id: null,
      },
    };

    instanceInboundRouter.routeMessage(cidRoutedMessage);

    expect(instanceChannelMock.requestCidReport).not.toHaveBeenCalled();
    expect(instanceChannelMock.forwardToInstance).toHaveBeenCalledTimes(1);
    expect(instanceChannelMock.forwardToInstance).toHaveBeenCalledWith(
      'follower-instance',
      cidRoutedMessage,
      expect.any(String),
    );
  });

  it('does NOT request a CID report when the leader itself owns the target CID', () => {
    instanceManagerMock.findInstanceByCid.mockReturnValue('leader-instance');

    const local = vi.fn();
    eventEmitter.on('websocket-message', local);

    const cidRoutedMessage: { PeerRegisterNotification: { cid: string; peer_cid: string; request_id: null; }; } = {
      PeerRegisterNotification: {
        cid: '12345',
        peer_cid: '99',
        request_id: null,
      },
    };

    try {
      instanceInboundRouter.routeMessage(cidRoutedMessage);
      expect(instanceChannelMock.requestCidReport).not.toHaveBeenCalled();
      expect(instanceChannelMock.forwardToInstance).not.toHaveBeenCalled();
      expect(local).toHaveBeenCalledWith(cidRoutedMessage);
    } finally {
      eventEmitter.off('websocket-message', local);
    }
  });
});
