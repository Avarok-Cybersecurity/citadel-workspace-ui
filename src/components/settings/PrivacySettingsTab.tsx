import { Shield } from 'lucide-react';

export function PrivacySettingsTab() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Shield className="h-12 w-12 text-gray-500 mb-4" />
        <h3 className="text-lg font-medium text-gray-300 mb-2">Privacy Settings</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          Security and privacy options will be available here in a future update.
        </p>
      </div>
    </div>
  );
}
