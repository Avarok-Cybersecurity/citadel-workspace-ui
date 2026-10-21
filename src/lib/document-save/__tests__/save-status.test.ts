/** The title bar's status and the unload warning, from where a document's edits are. Pure. */
import { describe, expect, it } from 'vitest';
import { saveStatus, warnsOnUnload, type SaveInputs, type SaveStatus } from '@/lib/document-save/save-status';
import { SAVE_STATUS_TEXT } from '@/lib/document-save/save-status-text';

const AT_REST: SaveInputs = { autoSave: true, link: 'up', unacknowledged: 0, syncRequested: false, local: 'written', halted: false, locked: false };
const held = (changes: Partial<SaveInputs>): SaveInputs => ({ ...AT_REST, unacknowledged: 2, ...changes });

describe('the save status', () => {
  it.each<[string, SaveInputs, SaveStatus]>([
    ['everything acknowledged, whatever else', { ...AT_REST, autoSave: false, link: 'down', local: 'failed', halted: true }, 'saved'],
    ['AutoSave on, sending', held({}), 'saving'],
    ['AutoSave on, link down', held({ link: 'down' }), 'offline'],
    ['AutoSave off, kept on the device', held({ autoSave: false }), 'savedToDevice'],
    ['AutoSave off, Save pressed', held({ autoSave: false, syncRequested: true }), 'saving'],
    ['AutoSave off, Save pressed offline', held({ autoSave: false, syncRequested: true, link: 'down' }), 'offline'],
    ['a write to the device in flight', held({ local: 'writing' }), 'unsavedOnDevice'],
    ['a write to the device failed', held({ autoSave: false, local: 'failed' }), 'unsavedOnDevice'],
    ['the server refuses the edits', held({ halted: true }), 'unsavedOnDevice'],
    ['copies kept here are locked', { ...AT_REST, locked: true }, 'locked'],
    ['locked, edits written here and on their way', held({ locked: true }), 'locked'],
    ['locked, and edits not yet written here: losing them comes first', held({ locked: true, local: 'failed' }), 'unsavedOnDevice'],
  ])('%s', (_name: string, inputs: SaveInputs, status: SaveStatus) => {
    expect(saveStatus(inputs)).toBe(status);
  });

  it('warns on unload only when edits are neither acknowledged nor written to this device', () => {
    expect(warnsOnUnload(held({ local: 'writing' }))).toBe(true);
    expect(warnsOnUnload(held({ local: 'failed' }))).toBe(true);
    expect(warnsOnUnload(held({ autoSave: false }))).toBe(false);
    expect(warnsOnUnload(held({ halted: true }))).toBe(false);
    expect(warnsOnUnload({ ...AT_REST, local: 'failed' })).toBe(false);
  });

  it('has words for every status', () => {
    expect(SAVE_STATUS_TEXT).toEqual({
      saved: 'Saved',
      saving: 'Saving…',
      offline: 'Offline: changes will sync when you\'re back online',
      savedToDevice: 'Saved to this device',
      unsavedOnDevice: 'Unsaved changes on this device',
      locked: 'Locked on this device',
    });
  });
});
