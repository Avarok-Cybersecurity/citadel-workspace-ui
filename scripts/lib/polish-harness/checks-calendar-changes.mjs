import { strict as assert } from 'node:assert';
import { fitsAndReads } from './checks-calendar-panels.mjs';

/**
 * Changing what is already on the calendar, from the controls in an event's details (scenario
 * `calendar-changes`: an editor of Platform, one of Platform's own events that goes down to Team,
 * and a booking the viewer hosts). The details with their Edit and Cancel controls fit at 375px and
 * on a desktop, with 44px targets and axe clean; cancelling the event from the UI takes its
 * projection off the page below; and the host cancelling the booking from the UI cancels it.
 */
const PROJECTION = 'node:n2|cal/inherit/n1/review';

async function opened(page, url, viewport, title) {
  const width = viewport.width < 600 ? 375 : viewport.width;
  await page.setViewportSize({ width, height: viewport.height });
  await page.goto(url('calendar-changes'));
  await page.getByTestId('calendar-tab').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
  await page.getByTestId('calendar-event-details').waitFor({ state: 'visible' });
  return width;
}

async function theEventControlsFit({ page, url, viewport }) {
  const width = await opened(page, url, viewport, 'Quarterly review');
  await page.getByRole('button', { name: 'Edit event' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Cancel event' }).waitFor({ state: 'visible' });
  await fitsAndReads(page, width, "the event's details");
}

async function cancellingAnEventTakesItOffThePagesBelow({ page, url, viewport }) {
  await opened(page, url, viewport, 'Quarterly review');
  assert.ok((await page.evaluate(() => window.__calendarKeys())).includes(PROJECTION), 'the scenario did not start with the projection on Team');
  await page.getByRole('button', { name: 'Cancel event' }).click();
  await page.getByText('The event is cancelled.').waitFor({ state: 'visible', timeout: 5000 });
  const keys = await page.evaluate(() => window.__calendarKeys());
  assert.ok(!keys.includes(PROJECTION), 'the cancelled event still shows on Team');
  const status = await page.evaluate(() => window.__calendarEvent('node:n1|cal/event/review').status);
  assert.deepEqual(status, { cancelled: { by: 'alice', reason: null } });
}

async function theHostCancelsABookingFromTheUi({ page, url, viewport }) {
  const width = await opened(page, url, viewport, 'Intro with ana');
  await page.getByRole('button', { name: 'Cancel booking' }).waitFor({ state: 'visible' });
  await fitsAndReads(page, width, "the booking's details");
  await page.getByLabel('Reason (optional)').fill('travelling');
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await page.getByText('The booking is cancelled.').waitFor({ state: 'visible', timeout: 5000 });
  const status = await page.evaluate(() => window.__calendarEvent('authored:n1:alice|cal/event/b1').status);
  assert.deepEqual(status, { cancelled: { by: 'alice', reason: 'travelling' } });
}

export const CALENDAR_CHANGE_CHECKS = { theEventControlsFit, cancellingAnEventTakesItOffThePagesBelow, theHostCancelsABookingFromTheUi };
