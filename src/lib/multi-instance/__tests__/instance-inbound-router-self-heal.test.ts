import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventEmitter } from '../../event-emitter';

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

    const cidRoutedMessage = {
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

  it('also processes the message locally so the leader still has a chance to handle it', () => {
    instanceManagerMock.findInstanceByCid.mockReturnValue(null);

    const local = vi.fn();
    eventEmitter.on('websocket-message', local);

    const cidRoutedMessage = {
      FileTransferRequestNotification: {
        cid: '67890',
        peer_cid: '11',
        request_id: null,
      },
    };

    try {
      instanceInboundRouter.routeMessage(cidRoutedMessage);
      expect(local).toHaveBeenCalledTimes(1);
      expect(local).toHaveBeenCalledWith(cidRoutedMessage);
    } finally {
      eventEmitter.off('websocket-message', local);
    }
  });

  it('does NOT request a CID report when an instance already owns the target CID', () => {
    instanceManagerMock.findInstanceByCid.mockReturnValue('follower-instance');

    const cidRoutedMessage = {
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
    );
  });

  it('does NOT request a CID report when the leader itself owns the target CID', () => {
    instanceManagerMock.findInstanceByCid.mockReturnValue('leader-instance');

    const local = vi.fn();
    eventEmitter.on('websocket-message', local);

    const cidRoutedMessage = {
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
