import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Users, MessageSquare, Building2, Hash } from 'lucide-react';
import { GeneralTab } from './tabs/GeneralTab';
import { MembersTab } from './tabs/MembersTab';
import { ChatSettingsTab } from './tabs/ChatSettingsTab';
import { AdminModalProps, AdminEntityType, EntityData } from './types';
import { useWorkspace } from '@/lib/workspace-context';
import WorkspaceService from '@/lib/workspace-service';

function getEntityIcon(entityType: AdminEntityType) {
  switch (entityType) {
    case 'workspace':
      return <Building2 className="h-5 w-5 mr-2" />;
    case 'office':
      return <Building2 className="h-5 w-5 mr-2" />;
    case 'room':
      return <Hash className="h-5 w-5 mr-2" />;
  }
}

function getEntityLabel(entityType: AdminEntityType): string {
  switch (entityType) {
    case 'workspace':
      return 'Workspace';
    case 'office':
      return 'Office';
    case 'room':
      return 'Room';
  }
}

export function AdminModal({
  isOpen,
  onClose,
  entityType,
  entityId,
  defaultTab = 'general',
}: AdminModalProps) {
  const { state } = useWorkspace();
  const [entity, setEntity] = useState<EntityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !entityId) {
      setEntity(null);
      setLoading(false);
      return;
    }

    const loadEntity = async () => {
      setLoading(true);
      try {
        if (entityType === 'workspace') {
          if (state.workspace) {
            setEntity({
              id: state.workspace.id,
              name: state.workspace.name,
              description: state.workspace.description || '',
            });
          }
        } else if (entityType === 'office') {
          const office = state.offices[entityId];
          if (office) {
            setEntity({
              id: office.id,
              name: office.name,
              description: office.description || '',
            });
          } else {
            const response = await WorkspaceService.getOffice(entityId);
            if (response?.GetOffice?.office) {
              const officeData = response.GetOffice.office;
              setEntity({
                id: officeData.id,
                name: officeData.name,
                description: officeData.description || '',
              });
            }
          }
        } else if (entityType === 'room') {
          // state.rooms is Record<string, Room> (roomId -> Room)
          const room = state.rooms[entityId];
          if (room) {
            setEntity({
              id: room.id,
              name: room.name,
              description: room.description || '',
            });
          } else {
            const response = await WorkspaceService.getRoom(entityId);
            if (response?.GetRoom?.room) {
              const roomData = response.GetRoom.room;
              setEntity({
                id: roomData.id,
                name: roomData.name,
                description: roomData.description || '',
              });
            }
          }
        }
      } catch (error) {
        console.error('Failed to load entity:', error);
      } finally {
        setLoading(false);
      }
    };

    void loadEntity();
  }, [isOpen, entityType, entityId, state.workspace, state.offices, state.rooms]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const entityLabel = getEntityLabel(entityType);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[700px] bg-[#282A42] border-[#3D3F5A]"
        data-testid="admin-modal"
      >
        <DialogHeader>
          <DialogTitle className="text-white text-xl flex items-center">
            {getEntityIcon(entityType)}
            {loading ? `Loading ${entityLabel}...` : `${entity?.name || entityLabel} Settings`}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Manage {entityLabel.toLowerCase()} settings, members, and chat configuration
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={defaultTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-3 bg-[#1a1b26] h-12">
            <TabsTrigger
              value="general"
              className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-gray-400 gap-1.5"
              data-testid="admin-tab-general"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger
              value="members"
              className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-gray-400 gap-1.5"
              data-testid="admin-tab-members"
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Members</span>
            </TabsTrigger>
            <TabsTrigger
              value="chat"
              className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-gray-400 gap-1.5"
              data-testid="admin-tab-chat"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Chat</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-6" data-testid="admin-content-general">
            <GeneralTab
              entityType={entityType}
              entityId={entityId}
              onClose={onClose}
            />
          </TabsContent>

          <TabsContent value="members" className="mt-6" data-testid="admin-content-members">
            <MembersTab
              entityType={entityType}
              entityId={entityId}
              onClose={onClose}
            />
          </TabsContent>

          <TabsContent value="chat" className="mt-6" data-testid="admin-content-chat">
            <ChatSettingsTab
              entityType={entityType}
              entityId={entityId}
              onClose={onClose}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
