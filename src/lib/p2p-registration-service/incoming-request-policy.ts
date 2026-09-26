/**
 * What to do with an incoming P2P registration request.
 *
 * This is the enforcement point for "accept requests from people you're not
 * connected with". A P2P conversation can only start after both sides are
 * registered, and the SDK holds the requester's `register_to_peer` open until
 * THIS client answers, so declining here is a refusal the requester actually
 * receives (as `PeerRegisterFailure`), not a message dropped on the floor.
 *
 * Pure decision plus a dispatcher over injected effects; the wiring to the
 * real stores lives in incoming-registration.ts.
 */

export type IncomingRequestAction = 'auto-accept' | 'ask' | 'decline';

export interface IncomingRequestFacts {
  acceptsRequestsFromStrangers: boolean;
  /** Already mutually registered with us. */
  isContact: boolean;
  /** We have an outgoing request to them: this is them answering it. */
  weAskedThemFirst: boolean;
  autoAccept: boolean;
}

export function decideIncomingRequest(facts: IncomingRequestFacts): IncomingRequestAction {
  const isStranger: boolean = !facts.isContact && !facts.weAskedThemFirst;
  // Before auto-accept: auto-accept means "don't ask me", not "let strangers in".
  if (isStranger && !facts.acceptsRequestsFromStrangers) return 'decline';
  return facts.autoAccept ? 'auto-accept' : 'ask';
}

export interface IncomingRegistration {
  /** The session the request is addressed to. */
  recipientCid: bigint;
  peerCid: bigint;
  peerUsername: string | undefined;
}

export interface IncomingRegistrationDeps {
  acceptsRequestsFromStrangers: () => boolean;
  isContact: (peerCid: bigint) => boolean;
  weAskedThemFirst: (peerCid: bigint, recipientCid: bigint) => boolean;
  readAutoAccept: (recipientCid: bigint) => Promise<boolean>;
  accept: (request: IncomingRegistration) => Promise<void>;
  ask: (request: IncomingRegistration) => Promise<void>;
  decline: (request: IncomingRegistration) => Promise<void>;
}

export async function handleIncomingRegistration(
  request: IncomingRegistration,
  deps: IncomingRegistrationDeps,
): Promise<IncomingRequestAction> {
  const action: IncomingRequestAction = decideIncomingRequest({
    acceptsRequestsFromStrangers: deps.acceptsRequestsFromStrangers(),
    isContact: deps.isContact(request.peerCid),
    weAskedThemFirst: deps.weAskedThemFirst(request.peerCid, request.recipientCid),
    autoAccept: await deps.readAutoAccept(request.recipientCid),
  });
  if (action === 'decline') await deps.decline(request);
  else if (action === 'auto-accept') await deps.accept(request);
  else await deps.ask(request);
  return action;
}
