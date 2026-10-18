import { createControlPlane, type ControlPlane } from './control-plane-client';

/** Composition root: the control plane at `base`, over this page's fetch. */
export function browserControlPlane(base: string): ControlPlane {
  return createControlPlane((input: string, init?: RequestInit): Promise<Response> => fetch(input, init), base);
}
