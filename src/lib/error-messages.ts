/**
 * Transforms technical error messages into user-friendly messages
 */
export function getUserFriendlyErrorMessage(error: string | Error): string {
  const errorMessage = typeof error === 'string' ? error : error.message;
  
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
    return 'Unable to reach the connection service. It may not be running yet, or may be restarting — try again in a moment.';
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
  
  // If no specific match, include the actual error text for debugging
  // Instead of hiding it behind a completely generic message
  const cleanedMessage = errorMessage
    .replace(/Error:\s*/i, '')
    .replace(/^\s+|\s+$/g, '');
  
  if (cleanedMessage && cleanedMessage.length < 200) {
    return `Something went wrong: ${cleanedMessage}`;
  }
  return 'An unexpected error occurred. Please try again or contact support if the problem persists.';
}

/**
 * Gets a user-friendly title for an error
 */
export function getErrorTitle(error: string | Error): string {
  const errorMessage = typeof error === 'string' ? error : error.message;
  
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