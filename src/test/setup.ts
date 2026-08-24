// Test setup file
import '@testing-library/jest-dom';

/**
 * jsdom does not implement matchMedia.
 *
 * Anything using useIsMobile — the sidebar, the responsive layout shells —
 * throws "window.matchMedia is not a function" on render without this. Shimmed
 * in the environment rather than mocked per component, because it is a gap in
 * jsdom rather than something about our code, and stubbing it inside a test
 * would mean testing a component with its responsive behaviour removed.
 *
 * Reports "not matching", i.e. the desktop branch of every query. A test that
 * cares about the mobile branch should override this for itself, so that
 * intent is visible in the test rather than assumed from a default here.
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
