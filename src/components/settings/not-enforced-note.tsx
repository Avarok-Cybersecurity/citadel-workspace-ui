/**
 * Shown beside a control this build cannot actually act on.
 *
 * Shared, because it was local to `PrivacySettingsTab` while `ChatSettingsPanel`
 * — a second panel of the same kind — carried three controls with no handler,
 * no store and no consumer, presented as ordinary working settings. One of them
 * was labelled "Encryption Level: Security level for this conversation".
 *
 * A control that does nothing is bad; a SECURITY control that does nothing,
 * and says so nowhere, is the version worth going out of the way to prevent.
 */
export function NotEnforcedNote(): JSX.Element {
  return (
    <p className="text-xs text-warning-emphasis mt-1">
      Not enforced yet — this needs server-side support, so leaving it on or off
      changes nothing today.
    </p>
  );
}
