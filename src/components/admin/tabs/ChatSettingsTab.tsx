import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { AdminTabProps } from '../types';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Loader2, MessageSquare, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { debugLog } from '@/lib/debug-config';

export function ChatSettingsTab({ entityType, entityId, onClose }: AdminTabProps) {
  const { state } = useWorkspace();
  const { toast } = useToast();
  const [chatEnabled, setChatEnabled] = useState(true);
  const [chatRules, setChatRules] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalEnabled, setOriginalEnabled] = useState(true);
  const [originalRules, setOriginalRules] = useState('');

  useEffect(() => {
    const loadData = () => {
      setLoading(true);
      try {
        // For now, use default values as chat settings aren't stored yet
        // In the future, these would be loaded from the entity's settings
        const enabled = true;
        const rules = '';

        setChatEnabled(enabled);
        setChatRules(rules);
        setOriginalEnabled(enabled);
        setOriginalRules(rules);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [entityType, entityId]);

  useEffect(() => {
    setHasChanges(
      chatEnabled !== originalEnabled || chatRules !== originalRules
    );
  }, [chatEnabled, chatRules, originalEnabled, originalRules]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // @human-review Chat settings backend API not yet available
      // For now, just show success and update local state
      toast({
        title: 'Chat Settings Updated',
        description: `Chat ${chatEnabled ? 'enabled' : 'disabled'} for this ${entityType}`,
        className: 'bg-[#343A5C] border-purple-800 text-purple-200',
      });

      setOriginalEnabled(chatEnabled);
      setOriginalRules(chatRules);
      setHasChanges(false);
    } catch (error) {
      debugLog('ChatSettingsTab', 'Failed to update chat settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to update chat settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setChatEnabled(originalEnabled);
    setChatRules(originalRules);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="chat-tab-loading">
        <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
      </div>
    );
  }

  // Show message for workspace level - chat is per office/room
  if (entityType === 'workspace') {
    return (
      <div className="space-y-4" data-testid="chat-tab-workspace-message">
        <Alert className="bg-[#1a1b26] border-purple-600">
          <Info className="h-4 w-4 text-purple-400" />
          <AlertDescription className="text-gray-300">
            Chat settings are configured individually for each office and room.
            Select an office or room from the sidebar to configure its chat settings.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="chat-tab-content">
      {/* Chat Enable Toggle */}
      <div className="flex items-center justify-between p-4 bg-[#1a1b26] rounded-lg">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-purple-400" />
          <div>
            <Label htmlFor="chat-enabled" className="text-white font-medium cursor-pointer">
              Enable Chat
            </Label>
            <p className="text-sm text-gray-400">
              Allow members to send messages in this {entityType}
            </p>
          </div>
        </div>
        <Switch
          id="chat-enabled"
          checked={chatEnabled}
          onCheckedChange={setChatEnabled}
          data-testid="chat-enabled-toggle"
        />
      </div>

      {/* Chat Rules */}
      <div className="space-y-2">
        <Label htmlFor="chat-rules" className="text-white">
          Chat Rules & Guidelines
        </Label>
        <Textarea
          id="chat-rules"
          value={chatRules}
          onChange={(e) => setChatRules(e.target.value)}
          placeholder="Enter chat rules and guidelines for members (optional)&#10;&#10;Example:&#10;- Be respectful to all members&#10;- No spam or self-promotion&#10;- Stay on topic"
          className="bg-[#444A6C] border-[#3D3F5A] text-white placeholder:text-gray-500 min-h-[150px]"
          disabled={!chatEnabled}
          data-testid="chat-rules-textarea"
        />
        <p className="text-xs text-gray-400">
          These rules will be shown to members before they can send messages
        </p>
      </div>

      {/* Additional Settings Preview */}
      {chatEnabled && (
        <div className="p-4 bg-[#1a1b26] rounded-lg space-y-3">
          <h4 className="text-white font-medium text-sm">Chat Features</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Text messages
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              File sharing
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Message reactions
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              Threads (planned)
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-4">
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={!hasChanges || saving}
          className="border-gray-600 text-white hover:bg-[#444A6C]"
          data-testid="chat-reset-button"
        >
          Reset
        </Button>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="bg-purple-600 hover:bg-purple-700 text-white"
          data-testid="chat-save-button"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>
    </div>
  );
}
