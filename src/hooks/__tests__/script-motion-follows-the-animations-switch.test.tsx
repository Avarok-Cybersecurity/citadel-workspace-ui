/**
 * Script-driven motion stops when the user switches Animations off.
 *
 * index.css stops CSS motion under `.reduce-motion`; framer's motion is
 * script-driven, so the focused sidebar's FLIP reads the switch itself (see
 * use-motion-allowed) and must follow it while mounted.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { applyAppearanceSettings, defaultAppearanceSettings } from '@/lib/appearance-settings';
import { useMotionAllowed } from '../use-motion-allowed';

function Probe(): JSX.Element {
  return <output data-testid="motion">{String(useMotionAllowed())}</output>;
}

afterEach(() => applyAppearanceSettings(defaultAppearanceSettings));

describe('useMotionAllowed', () => {
  it('is on by default and follows the switch both ways', async () => {
    applyAppearanceSettings(defaultAppearanceSettings);
    render(<Probe />);
    expect(screen.getByTestId('motion')).toHaveTextContent('true');

    await act(async () => { applyAppearanceSettings({ ...defaultAppearanceSettings, animationsEnabled: false }); });
    expect(screen.getByTestId('motion')).toHaveTextContent('false');

    await act(async () => { applyAppearanceSettings(defaultAppearanceSettings); });
    expect(screen.getByTestId('motion')).toHaveTextContent('true');
  });

  it('starts off when the switch was already off', () => {
    applyAppearanceSettings({ ...defaultAppearanceSettings, animationsEnabled: false });
    render(<Probe />);
    expect(screen.getByTestId('motion')).toHaveTextContent('false');
  });
});
