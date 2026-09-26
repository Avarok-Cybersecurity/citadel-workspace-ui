/**
 * Changing a chat's encryption level saves it and re-opens a live link at it.
 *
 * The level is read when a channel opens, so a link already up stays at the
 * old level until it is re-opened. A paused contact is saved but not dialled:
 * that would break the pause. The fakes stand in for the three I/O
 * boundaries only -- the settings store, the pause record, and the P2P link.
 */
import { describe, it, expect } from 'vitest';
import { changeChatLevel, chatLevelStatus, type ChatLevelChangeDeps, type ChatLevelResult } from '../chat-level-change';
import { DEFAULT_CHAT_ADVANCED_SETTINGS, type ChatAdvancedSettings } from '../chat-advanced-settings';
import type { PauseStatus } from '@/lib/p2p-pause/pause-rules';

interface Recorded { calls: string[]; deps: ChatLevelChangeDeps }

function fakes(connected: boolean, pause: PauseStatus): Recorded {
  const calls: string[] = [];
  let stored: ChatAdvancedSettings = { ...DEFAULT_CHAT_ADVANCED_SETTINGS };
  return {
    calls,
    deps: {
      save: async (_own: bigint, _peer: bigint, change: Partial<ChatAdvancedSettings>): Promise<ChatAdvancedSettings> => {
        calls.push(`save:${String(change.securityLevel)}`);
        stored = { ...stored, ...change };
        return stored;
      },
      pauseStatus: async (): Promise<PauseStatus> => pause,
      link: {
        isConnected: (): boolean => connected,
        drop: async (): Promise<void> => { calls.push('drop'); },
        reconnect: async (): Promise<void> => { calls.push('reconnect'); },
      },
    },
  };
}

describe('changing a chat encryption level', () => {
  it('saves it, then drops and redials a live link once', async () => {
    const f: Recorded = fakes(true, 'active');
    const result: ChatLevelResult = await changeChatLevel(f.deps, 1n, 2n, 'High');
    expect(f.calls).toEqual(['save:High', 'drop', 'reconnect']);
    expect(result.settings.securityLevel).toBe('High');
    expect(chatLevelStatus(result)).toMatch(/Reconnected at High/);
  });

  it('only saves when no link is up', async () => {
    const f: Recorded = fakes(false, 'active');
    const result: ChatLevelResult = await changeChatLevel(f.deps, 1n, 2n, 'Extreme');
    expect(f.calls).toEqual(['save:Extreme']);
    expect(chatLevelStatus(result)).toMatch(/next connection .* uses Extreme/);
  });

  it('never dials a paused contact', async () => {
    const f: Recorded = fakes(true, 'paused');
    const result: ChatLevelResult = await changeChatLevel(f.deps, 1n, 2n, 'High');
    expect(f.calls).toEqual(['save:High']);
    expect(chatLevelStatus(result)).toMatch(/paused/);
  });

  it('treats an unreadable pause record as paused', async () => {
    const f: Recorded = fakes(true, 'unknown');
    await changeChatLevel(f.deps, 1n, 2n, 'Reinforced');
    expect(f.calls).toEqual(['save:Reinforced']);
  });
});
