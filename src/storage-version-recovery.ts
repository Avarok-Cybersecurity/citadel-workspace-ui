/**
 * The rollback recovery screen.
 *
 * Split out of `main.tsx`, which was at its line budget and holds the app's
 * boot sequence. This is one self-contained thing: the last-resort screen shown
 * when IndexedDB refuses to open because the stored schema is NEWER than this
 * build understands — the shape a user hits after a rollback, or after opening
 * an old cached bundle.
 */
/**
 * A recovery screen for the rollback case, built with safe DOM APIs.
 *
 * Unregisters the service worker before reloading: the stale bundle is very
 * often being served FROM the worker's precache, so a plain reload would hand
 * the user the same old build and the same error.
 */
export function showStorageVersionRecovery(): void {
  const rootElement = document.getElementById('root');
  if (!rootElement || rootElement.dataset.recovery === 'storage-version') return;
  rootElement.dataset.recovery = 'storage-version';
  rootElement.replaceChildren();

  const panel = document.createElement('div');
  panel.setAttribute('role', 'alert');
  panel.style.cssText =
    'max-width:34rem;margin:12vh auto;padding:2rem;font-family:system-ui,sans-serif;line-height:1.6';

  const heading = document.createElement('h1');
  heading.textContent = 'This version is older than your saved data';
  heading.style.cssText = 'font-size:1.25rem;margin:0 0 0.75rem';

  const body = document.createElement('p');
  body.textContent =
    'Your browser is running an older build of Citadel than the data stored on this device. ' +
    'That usually means a cached copy loaded, or the app was rolled back. Getting the current ' +
    'version will fix it — your data is untouched.';
  body.style.cssText = 'margin:0 0 1.25rem';

  const button = document.createElement('button');
  button.textContent = 'Get the current version';
  button.style.cssText =
    'padding:0.6rem 1rem;border-radius:0.5rem;border:1px solid currentColor;background:transparent;' +
    'color:inherit;font:inherit;cursor:pointer';
  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Reloading…';
    void navigator.serviceWorker?.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
      .catch(() => undefined)
      .finally(() => window.location.reload());
  });

  panel.append(heading, body, button);
  rootElement.append(panel);
}
