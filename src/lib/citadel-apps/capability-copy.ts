/**
 * Each capability as the consent screen words it, its risk, and the permission an installer must
 * hold to grant it -- the last mirrors `required_installer_permission`
 * (server-kernel/src/kernel/apps/rules.rs), which is the control; the UI only says in advance
 * what the server would refuse. A Record over the closed `Capability` union, so a capability
 * added to the protocol does not compile here until it is worded.
 */
import type { Capability } from 'citadel-workspace-client-ts';
import { Permission } from '@/lib/permissions-service/types';

export type Risk = 'low' | 'medium' | 'high' | 'critical';

export interface CapabilityCopy {
  label: string;
  risk: Risk;
  installerNeeds: Permission;
}

const own = (label: string): CapabilityCopy => ({ label, risk: 'low', installerNeeds: Permission.AppInstall });
const storage = (label: string): CapabilityCopy => ({ label, risk: 'low', installerNeeds: Permission.AppInstallAllowStorage });

export const CAPABILITY_COPY: Record<Capability, CapabilityCopy> = {
  canvas: own('Draw in its own area of the page'),
  ui: own('Show its own buttons, menus and dialogs'),
  events: own('Respond to clicks and typing in its own area'),
  navigate: own('Open other pages in this workspace'),
  log: own('Write to its own diagnostic log'),
  'nodes.read': { label: 'Read pages and what they contain', risk: 'medium', installerNeeds: Permission.AppInstallAllowNodeRead },
  'nodes.write': { label: 'Add, rename and move pages', risk: 'high', installerNeeds: Permission.AppInstallAllowNodeWrite },
  'md.edit': { label: 'Edit documents', risk: 'high', installerNeeds: Permission.AppInstallAllowMdEdit },
  'files.read': { label: 'Read files stored in this workspace', risk: 'high', installerNeeds: Permission.AppInstallAllowFiles },
  'files.write': { label: 'Save files to this workspace', risk: 'high', installerNeeds: Permission.AppInstallAllowFiles },
  'chat.read': { label: 'Read messages in the page’s chat', risk: 'medium', installerNeeds: Permission.AppInstallAllowChat },
  'chat.send': { label: 'Send messages in the page’s chat', risk: 'medium', installerNeeds: Permission.AppInstallAllowChat },
  'members.list': { label: 'See who is a member', risk: 'medium', installerNeeds: Permission.AppInstallAllowMembers },
  'members.presence': { label: 'See who is online', risk: 'medium', installerNeeds: Permission.AppInstallAllowMembers },
  'storage.user': storage('Keep its own data for each person'),
  'storage.scope': storage('Keep data shared by everyone it is installed for'),
  'storage.node': storage('Keep its own data on each page'),
  'storage.blob': storage('Keep files of its own'),
  'storage.local': storage('Keep data on this device'),
  'clipboard.read': { label: 'Read your clipboard when you allow it', risk: 'medium', installerNeeds: Permission.AppInstallAllowClipboard },
  'clipboard.write': { label: 'Copy to your clipboard', risk: 'medium', installerNeeds: Permission.AppInstallAllowClipboard },
  notifications: { label: 'Show notifications', risk: 'low', installerNeeds: Permission.AppInstallAllowNotifications },
  documents: { label: 'Edit documents together in real time', risk: 'high', installerNeeds: Permission.AppInstall },
  'net.host': { label: 'Reach these websites from each person’s computer', risk: 'high', installerNeeds: Permission.AppInstallAllowHostNetwork },
  'net.host.private': { label: 'Reach the local network of each person’s computer', risk: 'critical', installerNeeds: Permission.AppInstallAllowPrivateNetwork },
  'net.server': { label: 'Reach these websites from the workspace server', risk: 'high', installerNeeds: Permission.AppInstallAllowServerNetwork },
  'ihttp.serve': { label: 'Offer a service other members’ apps can call', risk: 'medium', installerNeeds: Permission.AppInstallAllowInternalServe },
  'ihttp.call': { label: 'Call services other members’ apps offer', risk: 'medium', installerNeeds: Permission.AppInstallAllowInternalCall },
};

/** Granted only to an app signed by the first-party key (`first_party_only` in rules.rs). */
export const FIRST_PARTY_ONLY: ReadonlySet<Capability> = new Set<Capability>(['documents']);

export const NETWORK_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(['net.host', 'net.host.private', 'net.server']);

export const RISK_LABEL: Record<Risk, string> = { low: 'Low risk', medium: 'Medium risk', high: 'High risk', critical: 'Critical risk' };
