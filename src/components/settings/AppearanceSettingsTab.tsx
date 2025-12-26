import { Palette } from 'lucide-react';

export function AppearanceSettingsTab() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Palette className="h-12 w-12 text-gray-500 mb-4" />
        <h3 className="text-lg font-medium text-gray-300 mb-2">Appearance Settings</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          Theme and display customization options will be available here in a future update.
        </p>
      </div>
    </div>
  );
}
