/**
 * Avarok's platform terms as the wizard can show them BEFORE any session exists (`GetTerms` needs
 * one). The server's copy is the authority: this version is what the user is told they accepted,
 * and the sign-in step records acceptance only when the server's current version is this one.
 * `platform-terms-parity.test.ts` fails when this drifts from `citadel-workspace-types`.
 */
export const SHOWN_PLATFORM_TERMS_VERSION: number = 1;

export const SHOWN_PLATFORM_TERMS_TEXT: string = `# Citadel Workspace platform terms

Citadel Workspace is operated by Avarok Cybersecurity. By joining a workspace you agree that:

1. You use the service lawfully and do not use it to harm others or to attack the service.
2. Sharing diagnostic logs is optional and off unless you turn it on. When it is on, your agent
   sends warning and error lines, with usernames, file names and addresses removed, to this
   workspace's server, where the workspace's admins can read them. Avarok can read them only
   while an admin has granted support access, and every read is recorded for the admins.
   Turning it off deletes what was stored.
3. These terms can change. When they do, you are asked to accept the new version before
   diagnostic logs are sent again.
`;
