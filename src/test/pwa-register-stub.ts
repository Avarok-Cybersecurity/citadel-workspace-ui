/**
 * Stand-in for `virtual:pwa-register/react`, which vite-plugin-pwa generates at
 * build time and therefore does not exist under vitest — the import fails to
 * resolve before any `vi.mock` can intervene, so an alias is the only way to let
 * PwaUpdatePrompt be tested at all.
 *
 * Intentionally inert. Tests mock this specifier with their own controllable
 * implementation; this exists so the module graph resolves, and so a test that
 * forgets to mock gets a component that does nothing rather than a crash.
 */
export interface RegisterSWOptions {
  onRegisteredSW?: (url: string, registration?: ServiceWorkerRegistration) => void;
  onRegisterError?: (error: unknown) => void;
}

export function useRegisterSW(_options?: RegisterSWOptions) {
  return {
    offlineReady: [false, () => {}] as [boolean, (value: boolean) => void],
    needRefresh: [false, () => {}] as [boolean, (value: boolean) => void],
    updateServiceWorker: async (_reloadPage?: boolean) => {},
  };
}
