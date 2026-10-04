/**
 * A follower asks its leader what the agent said, over the instance channel,
 * and reads both capabilities from the ack. Real: askLeaderForCapabilities.
 * Stood in: the channel to the leader (a BroadcastChannel, absent in jsdom),
 * recorded and answered with what a leader's ack carries.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { askLeaderForCapabilities } from '@/lib/websocket-service/module-init';
import { instanceChannel } from '@/lib/multi-instance';

function leaderSays(data: unknown, status: 'processed' | 'error' = 'processed'): void {
  vi.spyOn(instanceChannel, 'sendToLeader').mockResolvedValue({ status, data, error: 'no leader' } as never);
}
afterEach((): void => { vi.restoreAllMocks(); });

describe('the follower\'s reading of the leader\'s ack', () => {
  it('takes both capabilities', async (): Promise<void> => {
    leaderSays({ agentIlm: true, supervisesP2p: true });
    expect(await askLeaderForCapabilities()).toEqual({ agentIlm: true, supervisesP2p: true });
    leaderSays({ agentIlm: false, supervisesP2p: true });
    expect(await askLeaderForCapabilities()).toEqual({ agentIlm: false, supervisesP2p: true });
    leaderSays({ agentIlm: true, supervisesP2p: false });
    expect(await askLeaderForCapabilities()).toEqual({ agentIlm: true, supervisesP2p: false });
  });

  it('reads a leader that predates the capability as not supervising', async (): Promise<void> => {
    leaderSays({ agentIlm: true });
    expect(await askLeaderForCapabilities()).toEqual({ agentIlm: true, supervisesP2p: false });
  });

  it('reads an empty ack as neither', async (): Promise<void> => {
    leaderSays(undefined);
    expect(await askLeaderForCapabilities()).toEqual({ agentIlm: false, supervisesP2p: false });
  });

  it('fails when the leader could not answer', async (): Promise<void> => {
    leaderSays(undefined, 'error');
    await expect(askLeaderForCapabilities()).rejects.toThrow('could not say');
  });
});
