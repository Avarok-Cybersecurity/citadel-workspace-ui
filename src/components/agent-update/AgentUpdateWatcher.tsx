/**
 * Keeps this window's view of the agent's updater current: every `UpdateAvailable`
 * the agent broadcasts, and its status once at start (an agent before 0.8.8 does not
 * answer, and then there is simply nothing to show).
 */
import { useEffect } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import { applyUpdaterMessage } from '@/lib/agent-update/update-state';
import { askUpdater } from '@/lib/agent-update/requests';
import { debugLog } from '@/lib/debug-config';

export function AgentUpdateWatcher(): null {
  useEffect(() => {
    const off: () => void = eventEmitter.on('websocket-message', (message: unknown): void => {
      applyUpdaterMessage(message);
    });
    askUpdater('UpdateGetStatus').catch((e: unknown): void => debugLog('AgentUpdate', 'no updater status', e));
    return off;
  }, []);
  return null;
}
