/**
 * The workspace's "require a human check to sign in" setting, behind a port.
 *
 * It lives in the workspace's settings on the kernel (WorkspaceProtocol,
 * admin-only), as `require_turnstile_sign_in`, off unless an admin turns it
 * on. The kernel does not carry the field yet: this module is the one place the
 * UI touches it, so wiring the real request means replacing `kernelAdmissionSetting`
 * and nothing else.
 *
 * Until then `read` finds no field and answers null ("this server does not
 * support it"), the switch says so and stays disabled, and `write` is never
 * reached. It refuses, rather than pretending to save, if it ever is.
 */
import { ADMISSION_COPY } from './copy';

export const REQUIRE_TURNSTILE_FIELD: 'require_turnstile_sign_in' = 'require_turnstile_sign_in';

export interface AdmissionSettingPort {
  /** The stored value, or null when this workspace's server has no such setting. */
  read: (workspace: Readonly<Record<string, unknown>> | undefined) => boolean | null;
  /** Resolves once the server has stored it; rejects with the server's reason. */
  write: (workspaceId: string, required: boolean) => Promise<void>;
}

export const kernelAdmissionSetting: AdmissionSettingPort = {
  read: (workspace: Readonly<Record<string, unknown>> | undefined): boolean | null => {
    const value: unknown = workspace?.[REQUIRE_TURNSTILE_FIELD];
    return typeof value === 'boolean' ? value : null;
  },
  write: async (): Promise<void> => { throw new Error(ADMISSION_COPY.serverUnsupported); },
};
