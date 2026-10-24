/**
 * TEST DOUBLE: the tab half of a runtime, for a test about zones. Such a test mounts no app tab, so
 * one asked for is a test mounting something it did not mean to, and it says so.
 */
import type { AppZoneHandle, AppZoneRuntime } from '../../app-zone-environment';

export const NO_TABS: AppZoneRuntime['mountPane'] = (): AppZoneHandle => {
  throw new Error('this zone test mounts no app tab');
};
