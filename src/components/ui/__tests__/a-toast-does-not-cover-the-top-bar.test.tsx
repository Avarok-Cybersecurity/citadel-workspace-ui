/**
 * A toast must not land on the header it is announcing over.
 *
 * Toasts were moved to `top-center` on phones because at the bottom they sat on
 * the join form's submit button — `elementFromPoint` at the centre of "Join"
 * returned the toast, and nothing failed: the button was present, visible,
 * enabled and named, and a tap landed on the notice.
 *
 * They then landed on the TOP BAR instead. A CI probe at 375px reported the
 * account avatar as `on screen | covered by li.group` — Sonner renders each
 * toast as an `<li>` whose first class is `group`. While any toast was up, the
 * only route to Profile, Settings and Sign Out was untappable on a phone.
 *
 * Moving a collision is not fixing one.
 *
 * The offset is asserted to READ the header-height variable rather than to
 * equal a number: `3.5rem` is already written in four places, and a fifth copy
 * would drift the moment the header changed.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { Toaster, MOBILE_TOAST_OFFSET } from '../sonner';

const isMobile: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: isMobile }));
vi.mock('next-themes', () => ({ useTheme: (): { theme: string } => ({ theme: 'dark' }) }));

describe('the toaster on a phone', () => {
  it('offsets below the fixed header, by the header’s own variable', () => {
    expect(MOBILE_TOAST_OFFSET).toContain('--app-header-height');
    // The offline banner pushes the header down; a toast that ignored it would
    // land on the header again exactly when the app is telling you it is
    // offline.
    expect(MOBILE_TOAST_OFFSET).toContain('--offline-banner-height');
  });

  it('applies that offset to the container, and only on a phone', async (): Promise<void> => {
    // Sonner renders its positioned list only once there is something in it, so
    // the offset cannot be observed on an empty toaster.
    isMobile.mockReturnValue(true);
    const mobile: ReturnType<typeof render> = render(<Toaster />);
    act((): void => { toast('anything'); });
    const mobileList: HTMLElement = await waitFor((): HTMLElement => {
      const found: HTMLElement | null = document.querySelector('[data-sonner-toaster]');
      expect(found, 'the toaster should render its list once a toast exists').not.toBeNull();
      return found as HTMLElement;
    });
    expect(mobileList.getAttribute('style') ?? '').toContain('--app-header-height');
    act((): void => { toast.dismiss(); });
    mobile.unmount();

    // Desktop is unchanged: a bottom-right toast lands in empty margin, and
    // giving it a header offset would move it for no reason.
    isMobile.mockReturnValue(false);
    const desktop: ReturnType<typeof render> = render(<Toaster />);
    act((): void => { toast('anything'); });
    const desktopList: HTMLElement = await waitFor((): HTMLElement => {
      const found: HTMLElement | null = document.querySelector('[data-sonner-toaster]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(desktopList.getAttribute('style') ?? '').not.toContain('--app-header-height');
    act((): void => { toast.dismiss(); });
    desktop.unmount();
  });
});
