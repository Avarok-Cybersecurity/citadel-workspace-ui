/**
 * Whether script-driven motion may run.
 *
 * Two independent reasons to stop moving, either one sufficient -- the same
 * pair index.css honours for CSS motion: the OS asks for reduced motion, or the
 * user switched Animations off (applyAppearanceSettings marks the document with
 * REDUCE_MOTION_CLASS). Measured in the focused sidebar, those CSS rules do
 * also stop framer's layout animation -- but as a side effect of a rule written
 * for CSS transitions, not as anything framer promises. Script motion reads
 * both preferences itself, so honouring them does not rest on that accident.
 */
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { REDUCE_MOTION_CLASS } from '@/lib/appearance-settings';

function animationsSwitchedOn(): boolean {
  return !document.documentElement.classList.contains(REDUCE_MOTION_CLASS);
}

export function useMotionAllowed(): boolean {
  const osReduces: boolean | null = useReducedMotion();
  const [switchedOn, setSwitchedOn] = useState<boolean>(animationsSwitchedOn);
  useEffect((): (() => void) => {
    const observer: MutationObserver = new MutationObserver((): void => setSwitchedOn(animationsSwitchedOn()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    setSwitchedOn(animationsSwitchedOn());
    return (): void => observer.disconnect();
  }, []);
  return switchedOn && osReduces !== true;
}
