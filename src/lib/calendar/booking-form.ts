/**
 * The invitee's answers to an event type's questions (design §3.1 "Invitee questions"), checked
 * before a booking is sent: every required question answered, a choice one of its options, and no
 * answer to a question the type does not ask. The host's instance checks the same at claim (C6).
 */
import type { Answer } from './generated/Answer';
import type { Question } from './generated/Question';

export type FormCheck = { ok: true; answers: Answer[] } | { ok: false; errors: ReadonlyMap<string, string> };

export function checkAnswers(questions: readonly Question[], given: ReadonlyMap<string, string>): FormCheck {
  const errors: Map<string, string> = new Map();
  const answers: Answer[] = [];
  for (const id of given.keys()) {
    if (!questions.some((q: Question): boolean => q.id === id)) errors.set(id, 'This question is not asked here.');
  }
  for (const q of questions) {
    const value: string = (given.get(q.id) ?? '').trim();
    if (value === '') {
      if (q.required) errors.set(q.id, `${q.label} is required.`);
      continue;
    }
    if (typeof q.kind === 'object' && !q.kind.choice.options.includes(value)) {
      errors.set(q.id, `Choose one of the options for ${q.label}.`);
      continue;
    }
    answers.push({ question_id: q.id, value });
  }
  return errors.size === 0 ? { ok: true, answers } : { ok: false, errors };
}
