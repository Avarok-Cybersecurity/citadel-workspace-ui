/**
 * The workspace setting "Require a human check (Cloudflare Turnstile) to sign
 * in": off by default, admin-only, and turning it ON asks first because older
 * apps cannot pass it.
 *
 * Doubled: the setting's port (lib/admission/workspace-setting.ts), which is
 * the kernel request -- not wired on the server yet -- and nothing else. The
 * production port is asserted too: with no field on the record it reports the
 * server cannot do it, rather than saving into nowhere.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkspaceContext, type WorkspaceState } from '@/contexts/WorkspaceContext';
import { ADMISSION_COPY } from '@/lib/admission/copy';
import { kernelAdmissionSetting, type AdmissionSettingPort } from '@/lib/admission/workspace-setting';
import { TurnstileAdmissionSwitch } from '../TurnstileAdmissionSwitch';

type Write = (workspaceId: string, required: boolean) => Promise<void>;

function renderSwitch(role: string, port: AdmissionSettingPort, workspace: Record<string, unknown> = { id: 'ws-1', name: 'Bench' }): void {
  const state: Partial<WorkspaceState> = { workspace: workspace as never, currentUser: { role } as never };
  render(
    <WorkspaceContext.Provider value={{ state: state as WorkspaceState, dispatch: (): void => {} } as never}>
      <TurnstileAdmissionSwitch port={port} />
    </WorkspaceContext.Provider>,
  );
}
function fakePort(stored: boolean | null): AdmissionSettingPort & { write: ReturnType<typeof vi.fn<Write>> } {
  return { read: (): boolean | null => stored, write: vi.fn<Write>(async (): Promise<void> => undefined) };
}
const toggle = (): HTMLElement => screen.getByTestId('turnstile-admission-toggle');

describe('the human-check setting', () => {
  it('is off by default, with its label and explanation', () => {
    renderSwitch('admin', fakePort(false));
    expect(screen.getByLabelText(ADMISSION_COPY.settingLabel)).toBe(toggle());
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(ADMISSION_COPY.settingHint)).toBeInTheDocument();
  });

  it('asks before turning it on, and writes only once confirmed', async () => {
    const port: ReturnType<typeof fakePort> = fakePort(false);
    renderSwitch('admin', port);
    fireEvent.click(toggle());
    expect(await screen.findByText(ADMISSION_COPY.confirmBody)).toBeInTheDocument();
    expect(port.write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('turnstile-admission-confirm'));
    await waitFor(() => expect(port.write).toHaveBeenCalledExactlyOnceWith('ws-1', true));
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
  });

  it('Cancel leaves it off', async () => {
    const port: ReturnType<typeof fakePort> = fakePort(false);
    renderSwitch('admin', port);
    fireEvent.click(toggle());
    fireEvent.click(await screen.findByTestId('turnstile-admission-cancel'));
    expect(port.write).not.toHaveBeenCalled();
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
  });

  it('turns off without asking', async () => {
    const port: ReturnType<typeof fakePort> = fakePort(true);
    renderSwitch('admin', port);
    fireEvent.click(toggle());
    await waitFor(() => expect(port.write).toHaveBeenCalledExactlyOnceWith('ws-1', false));
  });

  it('is disabled, with the reason, for a member who is not an admin', () => {
    renderSwitch('member', fakePort(false));
    expect(toggle()).toBeDisabled();
    expect(screen.getByTestId('turnstile-admission-reason')).toHaveTextContent(ADMISSION_COPY.adminsOnly);
  });

  it('is disabled, with the reason, on a server that has no such setting (the production port today)', () => {
    renderSwitch('admin', kernelAdmissionSetting);
    expect(toggle()).toBeDisabled();
    expect(screen.getByTestId('turnstile-admission-reason')).toHaveTextContent(ADMISSION_COPY.serverUnsupported);
  });

  it('the production port reads the kernel field once the server sends it', () => {
    expect(kernelAdmissionSetting.read({ require_turnstile_sign_in: true })).toBe(true);
    expect(kernelAdmissionSetting.read({ require_turnstile_sign_in: false })).toBe(false);
    expect(kernelAdmissionSetting.read({})).toBeNull();
  });
});
