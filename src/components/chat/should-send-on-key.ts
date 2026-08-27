/**
 * Does this keypress mean "send"?
 *
 * Named and extracted because the rule has a third clause that is easy to omit
 * and impossible to notice in testing unless you use an IME: while a candidate
 * window is open, Enter CONFIRMS the composition — it is not a submit. Without
 * the `isComposing` check, a user typing Japanese, Chinese or Korean sends a
 * half-composed message every time they choose a character.
 *
 * The P2P composer never had this bug because it submits through a native
 * `<form>`, which browsers already suppress during composition. Composers that
 * handle Enter themselves have to say it out loud.
 */
export function shouldSendOnKey(event: {
  key: string;
  shiftKey: boolean;
  nativeEvent: { isComposing: boolean };
}): boolean {
  if (event.nativeEvent.isComposing) return false;
  return event.key === 'Enter' && !event.shiftKey;
}
