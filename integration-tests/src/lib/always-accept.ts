/**
 * The first file offer a person has to answer by hand asks "Always accept files from {peer}?"
 * (AlwaysAcceptDialog), once per peer, as the offer arrives. It is modal: until it is answered
 * the offer's own Accept button sits under its overlay, so a spec that accepts by hand answers
 * it first.
 *
 * "Ask me each time" keeps every later offer a manual Accept, which is what the specs calling
 * this measure; "always" would accept this offer and every later one without a click.
 */
import type { Locator, Page } from 'playwright';
import { isVisibleWithin } from './utils.js';

/** Pages that have answered: the question is never asked twice, so a second wait would only stall. */
const answered: WeakSet<Page> = new WeakSet<Page>();

/**
 * Answer the question with "Ask me each time" if this page has not yet, and say whether it was
 * asked. `withinMs` bounds the wait for the dialog after the offer is already on screen: both
 * come from the same arrival.
 */
export async function keepAskingEachTime(page: Page, withinMs: number): Promise<boolean> {
  if (answered.has(page)) return false;
  const dialog: Locator = page.getByTestId('always-accept-dialog');
  if (!(await isVisibleWithin(dialog, withinMs))) return false;
  await dialog.getByTestId('always-accept-no').click();
  await dialog.waitFor({ state: 'detached', timeout: 10000 });
  answered.add(page);
  return true;
}
