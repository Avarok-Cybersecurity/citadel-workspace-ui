// @vitest-environment node
/** The create request: a paid one carries the person's overage choice and cannot be built without it; Free never carries one. */
import { describe, it, expect } from 'vitest';
import { createTenantRequest } from '../create-request';
import type { FlowDraft } from '../create-flow';

const paid: FlowDraft = { displayName: 'Acme', slug: 'acme', plan: { tier: 'team', interval: 'month', seats: 3, storageBlocks: 0, linkPacks: 0 } };
const free: FlowDraft = { ...paid, plan: { ...paid.plan, tier: 'free' } };

describe('the create request', () => {
  it('carries a paid workspace\'s choice, either way', () => {
    expect(createTenantRequest(paid, 't', false).overage_billing).toBe(false);
    expect(createTenantRequest(paid, 't', true).overage_billing).toBe(true);
  });

  it('cannot be built for a paid workspace that has not chosen', () => {
    expect(() => createTenantRequest(paid, 't', undefined)).toThrow(/overage-billing choice/);
  });

  it('never carries one for Free, whatever is handed in', () => {
    expect(createTenantRequest(free, 't', undefined)).not.toHaveProperty('overage_billing');
    expect(createTenantRequest(free, 't', true)).not.toHaveProperty('overage_billing');
  });
});
