/**
 * The control plane's billing routes, against the contract at the fetch boundary: what is sent
 * (claim codes in the body, never the URL), what each answer becomes, and that a malformed one is
 * a ControlPlaneError like every other route's.
 */
import { describe, it, expect } from 'vitest';
import { ControlPlaneError, createControlPlane, PORTAL_ORIGIN, type ControlPlane, type TenantStatus } from '../control-plane-client';
import { staleCustomerTermsVersion } from '../billing-portal';
import { contractFake, type ContractFake } from './contract-fake';
import { POLICY_BODY, usageBody } from '@/lib/billing/__tests__/billing-fixtures';

const CODE: string = 'ef'.repeat(32);

async function refusal(promise: Promise<unknown>): Promise<ControlPlaneError> {
  try {
    await promise;
  } catch (error: unknown) {
    if (error instanceof ControlPlaneError) return error;
    throw error;
  }
  throw new Error('expected a ControlPlaneError, got success');
}

const api = (fake: ContractFake): ControlPlane => createControlPlane(fake.fetch, '/api');

describe('the billing policy route', () => {
  it('reads the policy', async () => {
    const fake: ContractFake = contractFake();
    fake.policyReplies.push({ status: 200, body: POLICY_BODY });
    expect((await api(fake).policy()).dunning.graceDays).toBe(23);
    expect(fake.requests[0]).toMatchObject({ method: 'GET', path: '/api/billing/policy' });
  });

  it('refuses a policy missing a key, as a 502', async () => {
    const fake: ContractFake = contractFake();
    fake.policyReplies.push({ status: 200, body: { ...POLICY_BODY, dunning: {} } });
    expect((await refusal(api(fake).policy())).status).toBe(502);
  });
});

describe('usage and overage', () => {
  it('posts the claim code in the body and reads the meters', async () => {
    const fake: ContractFake = contractFake();
    fake.usageReplies.push({ status: 200, body: usageBody() });
    const report: Awaited<ReturnType<ControlPlane['usage']>> = await api(fake).usage('acme', CODE);
    expect(report.dimensions).toHaveLength(3);
    expect(fake.requests[0]).toEqual({ method: 'POST', path: '/api/tenants/acme/usage', body: { claim_code: CODE } });
  });

  it('refuses malformed meters, and keeps a refusal\'s code', async () => {
    const fake: ContractFake = contractFake();
    fake.usageReplies.push({ status: 200, body: usageBody({ dimensions: [{ id: 'x' }] }) });
    expect((await refusal(api(fake).usage('acme', CODE))).status).toBe(502);
    const owner: ContractFake = contractFake();
    owner.usageReplies.push({ status: 403, body: { error: 'not-owner' } });
    expect((await refusal(api(owner).usage('acme', CODE))).code).toBe('not-owner');
  });

  it('turns overage billing on, and reads back what the control plane holds', async () => {
    const fake: ContractFake = contractFake();
    fake.overageReplies.push({ status: 200, body: { overage_billing: true } });
    expect(await api(fake).setOverageBilling('acme', CODE, true)).toBe(true);
    expect(fake.requests[0]).toEqual({ method: 'POST', path: '/api/tenants/acme/overage', body: { claim_code: CODE, enabled: true } });
    const bad: ContractFake = contractFake();
    bad.overageReplies.push({ status: 200, body: { overage_billing: 'on' } });
    expect((await refusal(api(bad).setOverageBilling('acme', CODE, true))).status).toBe(502);
  });
});

describe('the portal and the Customer Terms', () => {
  it('names the current version on a stale-terms refusal, and resends with it', async () => {
    const fake: ContractFake = contractFake();
    fake.portalReplies.push({ status: 409, body: { error: 'customer-terms-stale', current: 2, document: 'customer-terms' } });
    fake.portalReplies.push({ status: 200, body: { portal_url: `${PORTAL_ORIGIN}/p/x` } });
    const stale: ControlPlaneError = await refusal(api(fake).openPortal('acme', CODE, undefined));
    expect(staleCustomerTermsVersion(stale)).toBe(2);
    await api(fake).openPortal('acme', CODE, 2);
    expect(fake.requests.map((r) => r.body)).toEqual([
      { claim_code: CODE },
      { claim_code: CODE, accepted_customer_terms_version: 2 },
    ]);
  });

  it('reads no version from any other refusal, or a stale one without a number', () => {
    expect(staleCustomerTermsVersion(new ControlPlaneError(409, 'x', 'slug-taken', { current: 2 }))).toBeUndefined();
    expect(staleCustomerTermsVersion(new ControlPlaneError(409, 'x', 'customer-terms-stale', { current: '2' }))).toBeUndefined();
    expect(staleCustomerTermsVersion(new Error('x'))).toBeUndefined();
  });
});

describe('the billing level on /status', () => {
  it('asks without a session id when it has none, and reads the level', async () => {
    const fake: ContractFake = contractFake();
    fake.statusReplies.push({ status: 200, body: { status: 'active', billing: { state: 'active', alert: 'over', overage_billing: true } } });
    const status: TenantStatus = await api(fake).tenantStatus('acme', undefined);
    expect(fake.requests[0].path).toBe('/api/tenants/acme/status');
    expect(status.status === 'active' && status.billing).toEqual({ billing: { state: 'active' }, alert: 'over', overageBilling: true });
  });

  it('reads an old server\'s answer as no level, and a malformed level as an error', async () => {
    const old: ContractFake = contractFake();
    old.statusReplies.push({ status: 200, body: { status: 'active' } });
    const status: TenantStatus = await api(old).tenantStatus('acme', undefined);
    expect(status.status === 'active' && status.billing).toBeUndefined();
    const bad: ContractFake = contractFake();
    bad.statusReplies.push({ status: 200, body: { status: 'active', billing: { state: 'active', alert: 'loud' } } });
    expect((await refusal(api(bad).tenantStatus('acme', undefined))).status).toBe(502);
  });
});
