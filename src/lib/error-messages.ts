import { describeError } from './describe-error';
/**
 * Transforms technical error messages into user-friendly messages
 */
/**
 * `unknown`, not `string | Error`.
 *
 * Three call sites — login, registration and workspace initialization, which
 * is every flow a new user meets — narrowed with
 * `err instanceof Error ? err : String(err)` before calling this. `String()`
 * on a structured rejection is `[object Object]`, and the revfs and websocket
 * layers both reject with one. That string then matches none of the branches
 * below, is not protocol jargon and is under 200 characters, so it reached the
 * user through the passthrough as:
 *
 *   Something went wrong: [object Object]
 *
 * Taking `unknown` and normalising here removes the coercion from all three at
 * once, rather than asking each to remember.
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  const errorMessage: string = describeError(error);
  
  // Connection-related errors
  if (errorMessage.includes('WebSocket connection failed') || 
      errorMessage.includes('Failed to initialize WASM client')) {
    // Not "check your internet connection". This socket is SAME-ORIGIN /ws,
    // proxied to the internal service — the local agent that owns protocol
    // connections. When it fails, the usual cause is that the agent is not
    // running or is restarting, and a user who goes off to check their wifi is
    // being sent somewhere that cannot help.
    //
    // Genuine loss of network is already covered, and better: OfflineBanner
    // watches navigator.onLine, and WorkspaceApp suppresses the retry modal
    // while offline so the two never both fire. That left this string handling
    // only the case its advice did not fit.
    return 'Unable to reach the Citadel agent on this machine. It may not be running yet, or may be restarting — try again in a moment.';
  }
  
  if (errorMessage.includes('Connection closed before receiving a handshake')) {
    return 'The workspace server is not responding. It may be restarting. Please try again in a moment.';
  }
  
  if (errorMessage.includes('Session Already Connected') || 
      errorMessage.includes('already connected')) {
    return 'You are already connected in another window or tab. Would you like to take over this session?';
  }
  
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    return 'The connection request timed out. Please check your network and try again.';
  }
  
  // Authentication errors
  if (errorMessage.includes('Invalid credentials') || 
      errorMessage.includes('Authentication failed')) {
    return 'Invalid username or password. Please check your credentials and try again.';
  }
  
  if (errorMessage.includes('User not found')) {
    return 'No account found with that username. Please check your username or create a new account.';
  }
  
  // The SDK's actual message is `Username <name> already exists!`, captured
  // from the live toast. The previous literal 'User already exists' never
  // matched it, so the single most ordinary registration failure — picking a
  // name someone already has — fell through to the raw
  // "Something went wrong: Username bob already exists!" fallback.
  if (/already exists/i.test(errorMessage) && /user/i.test(errorMessage)) {
    return 'An account with that username already exists. Please choose a different username.';
  }
  
  // Workspace errors
  if (errorMessage.includes('Workspace not found')) {
    return 'The workspace could not be found. Please check the workspace address.';
  }
  
  if (errorMessage.includes('Workspace initialization failed')) {
    return 'Failed to initialize the workspace. Please check your workspace password.';
  }
  
  if (/invalid workspace password|workspace master password/i.test(errorMessage)) {
    return 'Incorrect workspace password. Please try again.';
  }
  
  // Network errors
  if (errorMessage.includes('NetworkError') || 
      errorMessage.includes('ERR_NETWORK')) {
    return 'Network error. Please check your internet connection.';
  }
  
  if (errorMessage.includes('CORS')) {
    return 'Connection blocked by security settings. Please contact your administrator.';
  }
  
  // Account/password errors, matched case-insensitively.
  //
  // These were all-lowercase `.includes()` needles, and `.includes()` is
  // case-sensitive — while the SDK emits `#[form = "Invalid password"]` with a
  // capital I (citadel_io/src/error/code.rs). So the branch handling the
  // product's single most common error could never fire, and a mistyped
  // password fell through to "Something went wrong: Invalid password".
  //
  // Exactly the bug documented above for 'User already exists', which was
  // fixed with a case-insensitive regex. Same remedy here.
  if (/invalid password|wrong password|password mismatch|incorrect password/i.test(errorMessage)) {
    return 'Incorrect password. Please check your password and try again.';
  }

  // "Client does not exist" is LOCAL, and saying otherwise sends people to
  // create a second identity for an account that is perfectly intact.
  //
  // Measured: signing in as a real, registered account from a fresh agent
  // (`--data-dir` pointed somewhere new, which is what a new machine or a
  // reinstall looks like) answers
  //
  //   ConnectFailure { message: "Client does not exist" }
  //
  // ...from the SDK's own account manager, before the server is consulted at
  // all. A Citadel account is not a row on a server: the client holds its CID
  // and key material, and the agent keeps them under --data-dir. Lose that
  // directory and the account cannot be signed into from that machine, however
  // healthy it is on the server.
  //
  // The generic branch below claimed "No account found with that username on
  // this server", which is false in the one place it matters and whose advice --
  // "register a new account" -- is not reversible: the user gets a NEW CID, and
  // their peers' registrations still point at the old one.
  if (/client does not exist/i.test(errorMessage)) {
    return (
      'This machine has no account by that name. Citadel keeps your account in the agent\'s ' +
      'data directory (--data-dir), not only on the server, so signing in needs the machine ' +
      'you registered on. If you registered elsewhere, or started the agent with a different ' +
      '--data-dir, use that one. Registering again would create a separate account.'
    );
  }

  if (/does not exist|not registered|no user|account not found/i.test(errorMessage)) {
    return 'No account found with that username on this server. Please check your username or register a new account.';
  }

  if (errorMessage.includes('Connection refused') || 
      errorMessage.includes('ECONNREFUSED')) {
    return 'Could not reach the server. Please check the server address and ensure the server is running.';
  }

  if (errorMessage.includes('connect failed') || 
      errorMessage.includes('Connection failed')) {
    return 'Failed to connect to the workspace server. Please verify your credentials and server address.';
  }

  // Generic errors
  if (errorMessage.includes('Internal server error')) {
    return 'The server encountered an error. Please try again later.';
  }
  
  if (errorMessage.includes('Service unavailable')) {
    return 'The service is temporarily unavailable. Please try again in a few minutes.';
  }
  
  // Unmatched text is passed through, because a generic sentence hides the one
  // clue anybody has. What it must NOT pass through is protocol vocabulary: the
  // words below are the transport's, and to a user they read as the app
  // speaking a language it never taught them.
  const cleanedMessage: string = errorMessage
    .replace(/Error:\s*/i, '')
    .replace(/^\s+|\s+$/g, '');

  const isProtocolJargon: boolean =
    /\b(ratchet|handshake|ILM|CID|toolset|packet|codec|serde|deserializ|kem|psk)\b/i.test(
      cleanedMessage,
    );

  if (cleanedMessage && cleanedMessage.length < 200 && !isProtocolJargon) {
    return `Something went wrong: ${cleanedMessage}`;
  }
  return 'An unexpected error occurred. Please try again or contact support if the problem persists.';
}

/**
 * Gets a user-friendly title for an error
 */
export function getErrorTitle(error: unknown): string {
  const errorMessage: string = describeError(error);
  
  if (errorMessage.includes('connection') || errorMessage.includes('WebSocket') ||
      errorMessage.includes('Connection') || errorMessage.includes('ECONNREFUSED')) {
    return 'Connection Error';
  }
  
  if (errorMessage.includes('authentication') || errorMessage.includes('credentials') ||
      errorMessage.includes('password') || errorMessage.includes('Password')) {
    return 'Authentication Error';
  }
  
  if (errorMessage.includes('workspace') || errorMessage.includes('Workspace')) {
    return 'Workspace Error';
  }
  
  if (errorMessage.includes('network') || errorMessage.includes('Network')) {
    return 'Network Error';
  }
  
  if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
    return 'Request Timeout';
  }

  // Checked before the generic fallback so the commonest registration failure
  // gets a title that says what happened. Previously it rendered as a bare
  // "Error" over the raw server string.
  if (/already exists/i.test(errorMessage) && /user/i.test(errorMessage)) {
    return 'Username Taken';
  }

  if (errorMessage.includes('not found') || errorMessage.includes('not exist') ||
      errorMessage.includes('not registered')) {
    return 'Account Not Found';
  }
  
  return 'Error';
}