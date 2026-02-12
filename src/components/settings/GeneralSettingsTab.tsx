import { useState, useEffect, useCallback } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    loadUser().catch(console.error);
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
      console.error('Failed to update profile:', error);
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
        <h3 className="text-lg font-medium text-gray-200">Profile</h3>

        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <Label className="text-sm text-gray-400 mb-2 block">Avatar</Label>
            <AvatarUpload
              currentAvatar={avatarData || undefined}
              onAvatarChange={handleAvatarChange}
              disabled={isSaving}
            />
          </div>

          {/* Name Input */}
          <div className="flex-1 space-y-4 w-full">
            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-sm text-gray-400">
                Display Name
              </Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
                disabled={isSaving}
                className="bg-gray-800 border-gray-700 text-gray-100"
              />
              <p className="text-xs text-gray-500">
                This is how your name appears to other workspace members.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-700">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
