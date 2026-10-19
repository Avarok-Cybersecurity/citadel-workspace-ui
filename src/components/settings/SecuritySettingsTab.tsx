import { SignInKeysSection } from '@/components/passkey/SignInKeysSection';
import { SecureLinksSection } from '@/components/share/SecureLinksSection';

/** Settings -> Security: how you sign in, and the secure links you have handed out. */
export function SecuritySettingsTab(): JSX.Element {
  return (
    <div className="space-y-6">
      <SignInKeysSection />
      <SecureLinksSection />
    </div>
  );
}
