/**
 * Transforms technical error messages into user-friendly messages
 */
export function getUserFriendlyErrorMessage(error: string | Error): string {
  const errorMessage = typeof error === 'string' ? error : error.message;
  
  // Connection-related errors
  if (errorMessage.includes('WebSocket connection failed') || 
      errorMessage.includes('Failed to initialize WASM client')) {
    return 'Unable to connect to the workspace server. Please check your internet connection and try again.';
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
  
  if (errorMessage.includes('User already exists')) {
    return 'An account with that username already exists. Please choose a different username.';
  }
  
  // Workspace errors
  if (errorMessage.includes('Workspace not found')) {
    return 'The workspace could not be found. Please check the workspace address.';
  }
  
  if (errorMessage.includes('Workspace initialization failed')) {
    return 'Failed to initialize the workspace. Please check your workspace password.';
  }
  
  if (errorMessage.includes('Invalid workspace password') || 
      errorMessage.includes('workspace master password')) {
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
  
  // Generic errors
  if (errorMessage.includes('Internal server error')) {
    return 'The server encountered an error. Please try again later.';
  }
  
  if (errorMessage.includes('Service unavailable')) {
    return 'The service is temporarily unavailable. Please try again in a few minutes.';
  }
  
  // If no specific match, return a generic user-friendly message
  return 'An unexpected error occurred. Please try again or contact support if the problem persists.';
}

/**
 * Gets a user-friendly title for an error
 */
export function getErrorTitle(error: string | Error): string {
  const errorMessage = typeof error === 'string' ? error : error.message;
  
  if (errorMessage.includes('connection') || errorMessage.includes('WebSocket')) {
    return 'Connection Error';
  }
  
  if (errorMessage.includes('authentication') || errorMessage.includes('credentials')) {
    return 'Authentication Error';
  }
  
  if (errorMessage.includes('workspace')) {
    return 'Workspace Error';
  }
  
  if (errorMessage.includes('network')) {
    return 'Network Error';
  }
  
  if (errorMessage.includes('timeout')) {
    return 'Request Timeout';
  }
  
  return 'Error';
}