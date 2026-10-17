/** The share dialog in its two widest states: choosing who and how long, and the link shown once. */
import { ShareLinkDialogView } from '@/components/share/ShareLinkDialogView';
import { SecureLinkPanel } from '@/components/share/SecureLinkPanel';
import { draftOf } from '@/lib/share/grant-draft';
import { shareTarget } from '@/lib/share/share-target';

const NOOP = () => {};
const TARGET = shareTarget(
  { kind: 'group-chat', groupId: 'g-1', name: 'Quarterly planning — design, engineering and operations', members: ['alice', 'bob', 'carol', 'dave'] },
  { cid: 1n, username: 'alice' },
);
const DRAFT = { ...draftOf(TARGET.defaultGrant), members: ['bartholomew.longname', 'carol'], roles: ['member'], workspace: true };

const flowIn = (phase) => ({
  draft: DRAFT, setDraft: NOOP, preset: '7d', setPreset: NOOP, oneTime: true, setOneTime: NOOP,
  quota: { kind: 'known', quota: { live: 12, perMember: 50, pool: 100, poolUsed: 30 } }, phase, create: async () => {},
});

function ShareDialog({ phase }) {
  return (
    <ShareLinkDialogView open onClose={NOOP} targets={[TARGET]} plainLinks={[]} plainNote="" mode="secure" onMode={NOOP} secureUnavailable={null}
      secure={<SecureLinkPanel flow={flowIn(phase)} target={TARGET} members={['bob', 'dave']} roles={[{ id: 'member', name: 'Member' }]} isAdmin onManageLinks={NOOP} />} />
  );
}

export const SHARE_SCENARIOS = {
  'share-secure-editing': () => <ShareDialog phase={{ kind: 'editing' }} />,
  'share-secure-created': () => <ShareDialog phase={{ kind: 'created', url: `${location.origin}/?redirect=${'x'.repeat(43)}&server=work.example.com` }} />,
};
