import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { AdminTabProps } from '../types';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import WorkspaceService from '@/lib/workspace-service';
import { Loader2 } from 'lucide-react';

export function GeneralTab({ entityType, entityId, onClose }: AdminTabProps) {
  const { state } = useWorkspace();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalName, setOriginalName] = useState('');
  const [originalDescription, setOriginalDescription] = useState('');

  useEffect(() => {
    const loadData = () => {
      setLoading(true);
      try {
        if (entityType === 'workspace' && state.workspace) {
          setName(state.workspace.name);
          setDescription(state.workspace.description || '');
          setOriginalName(state.workspace.name);
          setOriginalDescription(state.workspace.description || '');
        } else {
          const node = state.nodes[entityId];
          if (node) {
            setName(node.name);
            setDescription(node.description || '');
            setOriginalName(node.name);
            setOriginalDescription(node.description || '');
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [entityType, entityId, state.workspace, state.nodes]);

  useEffect(() => {
    setHasChanges(name !== originalName || description !== originalDescription);
  }, [name, description, originalName, originalDescription]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: 'Error',
        description: 'Name is required',
        variant: 'destructive',
      });
      return;
    }

    if (name.length < 3 || name.length > 100) {
      toast({
        title: 'Error',
        description: 'Name must be between 3 and 100 characters',
        variant: 'destructive',
      });
      return;
    }

    if (description.length > 500) {
      toast({
        title: 'Error',
        description: 'Description must be 500 characters or less',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      if (entityType === 'workspace') {
        await WorkspaceService.updateWorkspace(name, description);
      } else {
        await WorkspaceService.updateNode(entityId, { name, description });
      }

      toast({
        title: 'Success',
        description: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} updated successfully`,
        className: 'bg-[#343A5C] border-purple-800 text-purple-200',
      });

      setOriginalName(name);
      setOriginalDescription(description);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to update entity:', error);
      toast({
        title: 'Error',
        description: `Failed to update ${entityType}. Please try again.`,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setName(originalName);
    setDescription(originalDescription);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="general-tab-loading">
        <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="general-tab-content">
      <div className="space-y-2">
        <Label htmlFor="entity-name" className="text-white">
          Name <span className="text-red-400">*</span>
        </Label>
        <Input
          id="entity-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Enter ${entityType} name`}
          className="bg-[#444A6C] border-[#3D3F5A] text-white placeholder:text-gray-500"
          maxLength={100}
          data-testid="general-name-input"
        />
        <p className="text-xs text-gray-400">{name.length}/100 characters</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="entity-description" className="text-white">
          Description
        </Label>
        <Textarea
          id="entity-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={`Enter ${entityType} description (optional)`}
          className="bg-[#444A6C] border-[#3D3F5A] text-white placeholder:text-gray-500 min-h-[100px]"
          maxLength={500}
          data-testid="general-description-input"
        />
        <p className="text-xs text-gray-400">{description.length}/500 characters</p>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={!hasChanges || saving}
          className="border-gray-600 text-white hover:bg-[#444A6C]"
          data-testid="general-cancel-button"
        >
          Reset
        </Button>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="bg-purple-600 hover:bg-purple-700 text-white"
          data-testid="general-save-button"
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
