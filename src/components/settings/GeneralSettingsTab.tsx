import { useState, useEffect, useCallback } from 'react';
import { debugLog } from '@/lib/debug-config';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast, useEventListener } from '@/hooks';
import { AvatarUpload } from './AvatarUpload';
import WorkspaceService from '@/lib/workspace-service';
import userService from '@/lib/user-service';
import type { User } from 'citadel-workspace-client-ts';

export function GeneralSettingsTab() {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState('');
  const [avatarData, setAvatarData] = useState<string | null>(null);
  const [originalDisplayName, setOriginalDisplayName] = useState('');
  const [originalAvatarData, setOriginalAvatarData] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load current user data on mount
  useEffect(() => {
    const loadUser = async () => {
      const currentUser = await userService.getCurrentUser();
      if (currentUser) {
        setDisplayName(currentUser.fullName || currentUser.username);
        setOriginalDisplayName(currentUser.fullName || currentUser.username);
      }
      setIsLoading(false);
    };
    loadUser().catch((err: unknown) => debugLog('GeneralSettingsTab', 'Failed to load user:', err));
  }, []);

  // Handle profile updates
  // MetadataValue is a tagged enum: { type: "String", content: "..." }
  const handleProfileUpdate = useCallback((data: { user: User }) => {
    const avatarMeta = data.user.metadata?.avatar;
    const avatar = (avatarMeta && 'content' in avatarMeta && typeof avatarMeta.content === 'string') ? avatarMeta.content : undefined;
    if (avatar) {
      setAvatarData(avatar);
      setOriginalAvatarData(avatar);
    }
    if (data.user.name) {
      setDisplayName(data.user.name);
      setOriginalDisplayName(data.user.name);
    }
    toast({
      title: 'Profile Updated',
      description: 'Your profile has been saved successfully.',
    });
    setIsSaving(false);
  }, [toast]);

  // Listen for profile updates
  useEventListener<{ user: User }>('user:profile-updated', handleProfileUpdate);

  const hasChanges = displayName !== originalDisplayName || avatarData !== originalAvatarData;

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    try {
      await WorkspaceService.updateUserProfile(
        displayName !== originalDisplayName ? displayName : undefined,
        avatarData !== originalAvatarData ? avatarData || undefined : undefined
      );
      // The response handler will emit 'user:profile-updated' which updates state
    } catch (error) {
      debugLog('GeneralSettingsTab', 'Failed to update profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to save profile. Please try again.',
        variant: 'destructive',
      });
      setIsSaving(false);
    }
  };

  const handleAvatarChange = (base64Data: string | null) => {
    setAvatarData(base64Data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white">User Profile</h3>
          <p className="text-xs text-gray-500 mt-0.5">Update your photo and personal details</p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <AvatarUpload
              currentAvatar={avatarData || undefined}
              onAvatarChange={handleAvatarChange}
              disabled={isSaving}
            />
          </div>

          {/* Name Input */}
          <div className="flex-1 space-y-4 w-full">
            <div className="space-y-1.5">
              <label htmlFor="displayName" className="text-[11px] font-semibold tracking-wider uppercase text-gray-400">
                Display Name
              </label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
                disabled={isSaving}
                className="bg-[#131420] border-[#2D3548] text-white h-11 rounded-lg placeholder:text-gray-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all"
              />
              <p className="text-[11px] text-gray-500">
                This is how your name appears to other workspace members.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-[#2D3548]">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg shadow-lg shadow-purple-500/20 gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
