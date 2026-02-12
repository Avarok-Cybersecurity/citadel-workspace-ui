/**
 * Placeholder for future strongly-typed websocket message event payloads.
 *
 * Currently, websocket-message event handlers receive InternalServiceResponse
 * (a discriminated union) but access variant keys via optional chaining which
 * requires `any` at the event boundary. A proper fix would migrate all handlers
 * to use isResponseType() guards from citadel-workspace-client-ts.
 *
 * Until that migration, message handlers use inline eslint-disable comments
 * for the unavoidable `any` at the event boundary.
 */

// Re-export InternalServiceResponse for convenience in files that need it
export type { InternalServiceResponse } from 'citadel-workspace-client-ts';
