/**
 * Which tab a room was left on, remembered for as long as the app is open.
 *
 * `OfficeChatTabs` rendered `<Tabs defaultValue="content">` — uncontrolled, so
 * the selection lives in the component instance. `BaseOffice` is keyed on the
 * node id precisely so React remounts it when the node changes, and every one
 * of those remounts silently put the user back on Content. Someone reading a
 * conversation is returned to the document, mid-sentence, with no action of
 * their own and nothing on screen to explain it.
 *
 * The file's own docstring already noted that "inactive tab panels unmount",
 * which is why the call docks above them. The panels unmounting was known; the
 * SELECTION not surviving was not.
 *
 * Per channel, not global: two rooms are two conversations, and returning to a
 * room you were reading should not depend on which room you visited in between.
 *
 * In memory rather than storage: this is a convenience within a session, and a
 * remembered tab is not worth a persistence bug. It resets on reload, which is
 * a moment the user caused.
 */
export type OfficeTab = 'content' | 'chat';

const DEFAULT_TAB: OfficeTab = 'content';

const lastTab: Map<string, OfficeTab> = new Map<string, OfficeTab>();

export function rememberedTab(chatChannelId: string): OfficeTab {
  return lastTab.get(chatChannelId) ?? DEFAULT_TAB;
}

export function rememberTab(chatChannelId: string, tab: OfficeTab): void {
  lastTab.set(chatChannelId, tab);
}

/** Test seam: the map outlives a component, so it has to be clearable. */
export function forgetAllTabs(): void {
  lastTab.clear();
}
