/**
 * The Advanced tab's state: this chat's saved settings, and the change that
 * takes effect at once -- a retention period is applied to the stored
 * conversation straight away, and a new encryption level re-opens a live
 * connection at it (lib/p2p/chat-level-change.ts).
 */
import { useEffect, useState } from 'react';
import {
  chatAdvancedSettings,
  DEFAULT_CHAT_ADVANCED_SETTINGS,
  type ChatAdvancedSettings,
  type ChatSecurityLevel,
  type Retention,
} from '@/lib/p2p/chat-advanced-settings';
import { changeChatLevel, chatLevelStatus, type ChatLevelResult } from '@/lib/p2p/chat-level-change';
import { peerLink, peerPauseStore } from '@/lib/p2p-pause';
import { getCurrentCid } from '@/lib/p2p/current-cid';
import { applyRetention } from '@/lib/p2p/retention-sweep';

export interface ChatAdvancedControls {
  /** Null until the saved settings have been read. */
  settings: ChatAdvancedSettings | null;
  /** What the last change did, in words; null before any change. */
  status: string | null;
  error: string | null;
  changeRetention: (retention: Retention) => Promise<void>;
  changeSecurityLevel: (level: ChatSecurityLevel) => Promise<void>;
}

async function ownCid(): Promise<bigint> {
  const own: bigint | null = await getCurrentCid();
  if (own === null) throw new Error('No signed-in session for these settings');
  return own;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useChatAdvancedSettings(isOpen: boolean, peerCid: bigint): ChatAdvancedControls {
  const [settings, setSettings] = useState<ChatAdvancedSettings | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled: boolean = false;
    ownCid()
      .then((own: bigint): Promise<ChatAdvancedSettings> => chatAdvancedSettings.get(own, peerCid))
      .then((loaded: ChatAdvancedSettings): void => { if (!cancelled) setSettings(loaded); })
      .catch((e: unknown): void => {
        if (cancelled) return;
        // Shown as the defaults so they can be chosen again, with the reason
        // beside them: the controls would otherwise stay disabled for good.
        setError(`Could not read this chat's settings: ${describe(e)}. Choosing a value replaces them.`);
        setSettings({ ...DEFAULT_CHAT_ADVANCED_SETTINGS });
      });
    return (): void => { cancelled = true; };
  }, [isOpen, peerCid]);

  const changeRetention = async (retention: Retention): Promise<void> => {
    setError(null);
    try {
      setSettings(await chatAdvancedSettings.set(await ownCid(), peerCid, { retention }));
      const removed: number = await applyRetention(peerCid);
      setStatus(retention === 'forever'
        ? 'Saved. Messages on this device are kept.'
        : `Saved. ${removed} older message${removed === 1 ? '' : 's'} deleted from this device.`);
    } catch (e: unknown) {
      setError(`Retention was not applied: ${describe(e)}`);
    }
  };

  const changeSecurityLevel = async (level: ChatSecurityLevel): Promise<void> => {
    setError(null);
    setStatus(`Saving ${level}…`);
    try {
      const result: ChatLevelResult = await changeChatLevel({
        save: (own: bigint, peer: bigint, change: Partial<ChatAdvancedSettings>): Promise<ChatAdvancedSettings> => chatAdvancedSettings.set(own, peer, change),
        pauseStatus: (own: bigint, peer: bigint) => peerPauseStore.status(own, peer),
        link: peerLink,
      }, await ownCid(), peerCid, level);
      setSettings(result.settings);
      setStatus(chatLevelStatus(result));
    } catch (e: unknown) {
      setStatus(null);
      setError(`The encryption level was not changed: ${describe(e)}`);
    }
  };

  return { settings, status, error, changeRetention, changeSecurityLevel };
}
