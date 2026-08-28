/**
 * Which field the user should be taken to when a submit is refused.
 *
 * Submitting the profile step with mismatched passwords left focus on the Join
 * button. The error was announced and the field was marked invalid, and neither
 * of those moves anyone: a screen-reader user hears "the passwords you entered
 * do not match" while their cursor sits on a button, and a keyboard user has to
 * shift-tab back through the form hunting for which field it meant.
 *
 * The order is the form's own order, so "first" means first on screen, not
 * first in whatever order the checks happen to be written.
 */

/** The profile step's fields, in the order they are rendered. */
export const JOIN_FIELD_ORDER = ['fullName', 'username', 'password', 'confirmPassword'] as const;

export type JoinField = (typeof JOIN_FIELD_ORDER)[number];

/**
 * The first field that is empty, or failing a rule — whichever comes first on
 * screen. `null` when the form is submittable.
 */
export function firstInvalidField(
  values: Record<JoinField, string>,
  errors: Record<JoinField, string | null>,
): JoinField | null {
  for (const field of JOIN_FIELD_ORDER) {
    if (!values[field] || errors[field]) return field;
  }
  return null;
}
