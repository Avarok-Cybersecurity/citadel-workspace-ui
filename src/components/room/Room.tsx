import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { RoomSkeletonLoader } from '../ui/skeleton-room';
import { User } from '../../types/workspace-entities';
import { MDXProvider } from '@mdx-js/react';
import type { MDXComponents } from 'mdx/types';
import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { useToast } from '@/hooks/use-toast';
import { MDXEditor } from '@/components/mdx/MDXEditor';
import TemplateSelector from '@/components/mdx/TemplateSelector';
import { TemplateCategory, MdxTemplate } from '@/lib/mdx-templates';
import WorkspaceService from '@/lib/workspace-service';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GroupChatView from '@/components/chat/GroupChatView';
import { FileText, MessageSquare } from 'lucide-react';
import { usePermission } from '@/hooks/use-permission';
import { Permission } from '@/contexts/PermissionsContext';
import { DisabledWithTooltip } from '@/components/ui/DisabledWithTooltip';
import { connectionManager } from '@/lib/connection';
import { runAsyncSetup } from '@/lib/utils/async-utils';

// Import MDX components - you may need to create these if they don't exist
import { components } from '../office/mdxComponents';

interface RoomProps {
  roomId: string;
  officeId?: string;
}

interface Topic {
  title: string;
  description: string;
}

/**
 * Room component that displays room data and integrates with workspace state
 */
export const Room: React.FC<RoomProps> = ({ roomId, officeId }) => {
  const { state } = useWorkspace();
  const { toast } = useToast();

  // Get room data from workspace state
  const room = state.rooms[roomId];
  const isLoading = state.loading.rooms;

  // State for MDX content
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState<string>(room?.mdx_content || '');
  const [compiledContent, setCompiledContent] = useState<React.ReactNode | null>(null);
  const [isNewContent, setIsNewContent] = useState(!room?.mdx_content);
  const [tabSession, setTabSession] = useState<{ username?: string; fullName?: string } | null>(null);

  // Load tab session asynchronously
  useEffect(() => {
    runAsyncSetup(async () => {
      const session = await connectionManager.getTabSelectedSession();
      setTabSession(session);
    });
  }, []);

  // Fetch room data if not available
  useEffect(() => {
    const fetchRoomData = async () => {
      if (!room && !isLoading && officeId) {
        try {
          // Load rooms for the office - this will populate the room in state
          await WorkspaceService.listRooms(officeId);
        } catch (error) {
          console.error('Failed to load room:', error);
        }
      }
    };

    runAsyncSetup(fetchRoomData);
  }, [roomId, room, isLoading, officeId]);

  // Update content when room data changes
  useEffect(() => {
    if (room?.mdx_content) {
      setContent(room.mdx_content);
      setIsNewContent(false);
    } else {
      setIsNewContent(true);
    }
  }, [room]);

  // Check if user can edit the MDX content using the permissions system
  const { allowed: canEditMdx, reason: editDeniedReason, loading: permissionLoading } = usePermission(
    roomId,
    Permission.EditMdx
  );

  // Compile MDX content
  useEffect(() => {
    const compileContent = async () => {
      if (!content) return;

      try {
        console.info('Compiling Room MDX content...');
        const result = await evaluate(content, {
          ...runtime,
          useMDXComponents: () => components as unknown as MDXComponents,
          baseUrl: window.location.origin
        });
        console.info('Room MDX compilation successful');
        setCompiledContent(result.default({ components: components as unknown as MDXComponents }));
      } catch (error) {
        console.error('Error compiling Room MDX:', error);
      }
    };

    runAsyncSetup(compileContent);
  }, [content]);

  // Handle saving MDX content
  const handleSave = async () => {
    try {
      await WorkspaceService.updateRoom(roomId, {
        mdxContent: content
      });

      toast({
        title: "Changes saved",
        description: `The ${room?.name || 'room'} content has been updated`,
        className: "bg-[#343A5C] border-purple-800 text-purple-200",
      });

      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save Room MDX content:', error);
      toast({
        title: "Error saving changes",
        description: "There was a problem saving your changes. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle template selection
  const handleTemplateSelect = (template: MdxTemplate) => {
    // Replace content with template content
    setContent(template.content);

    // Show success toast
    toast({
      title: "Template applied",
      description: `Applied "${template.name}" template. You can now customize it.`,
      className: "bg-[#343A5C] border-purple-800 text-purple-200",
    });

    // Content is no longer new once a template is applied
    setIsNewContent(false);
  };

  // Show skeleton loader while loading
  if (isLoading || !room) {
    return <RoomSkeletonLoader />;
  }

  // Use permission check result
  const hasEditPermission = canEditMdx;

  // Check if chat is enabled for this room
  const chatEnabled = room.chat_enabled ?? false;
  const chatChannelId = room.chat_channel_id;

  // Get current user info from workspace state OR connection manager
  // The workspace state currentUser may not be populated yet during initial render
  // tabSession is loaded asynchronously via useEffect
  const currentUserId = state.currentUser?.id || state.currentUser?.username || tabSession?.username || 'unknown';
  const currentUserName = state.currentUser?.displayName || state.currentUser?.username || tabSession?.fullName || tabSession?.username || 'Unknown User';

  // Room header component
  const roomHeader = (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center space-x-4">
        <div className="h-10 w-10 rounded-lg bg-purple-600 flex items-center justify-center text-white font-semibold">
          {room.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">{room.name}</h2>
          <p className="text-gray-400 text-sm">{room.description || 'No description'}</p>
        </div>
      </div>
      <div className="flex space-x-2">
        {isEditing ? (
          <>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <DisabledWithTooltip
            disabled={!hasEditPermission}
            tooltip={editDeniedReason || "You don't have permission to edit this content"}
          >
            <button
              onClick={() => hasEditPermission && setIsEditing(true)}
              className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
            >
              Edit
            </button>
          </DisabledWithTooltip>
        )}
      </div>
    </div>
  );

  // Content view (MDX content and topics)
  const contentView = (
    <>
      {isEditing ? (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-white">Edit Room Content</h2>
            <div className="flex gap-2">
              {(isNewContent || content.trim() === '') && (
                <TemplateSelector
                  category={TemplateCategory.ROOM}
                  onSelectTemplate={handleTemplateSelect}
                  buttonVariant="outline"
                  buttonSize="sm"
                  buttonText="Use Template"
                />
              )}
            </div>
          </div>
          <MDXEditor
            value={content}
            onChange={(value) => setContent(value)}
            height="300px"
            placeholder="Enter MDX content for this room..."
          />
        </div>
      ) : content ? (
        <div className="mb-6 prose prose-invert prose-sm md:prose-base max-w-none">
          <MDXProvider components={components as unknown as MDXComponents}>
            {compiledContent}
          </MDXProvider>
        </div>
      ) : null}

      {room.members && Object.keys(room.members).length > 0 && (
        <div className="mt-8">
          <div className="flex items-center space-x-2 mb-4">
            <h3 className="text-lg font-semibold text-white">Members</h3>
            <span className="bg-gray-700 text-gray-300 px-2 py-0.5 text-xs rounded-full">
              {Object.keys(room.members).length}
            </span>
          </div>

          <div className="space-y-3">
            {Object.values(room.members).map((member: User, index) => (
              <div key={member.id || index} className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold">
                  {member.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-white">{member.displayName}</p>
                  <p className="text-gray-400 text-sm">{member.role || 'Member'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  // If chat is not enabled, just show the content
  if (!chatEnabled || !chatChannelId) {
    return (
      <div className="p-4">
        {roomHeader}
        {contentView}
      </div>
    );
  }

  // If chat is enabled, show tabs
  return (
    <div className="h-full flex flex-col p-4">
      {roomHeader}

      <Tabs defaultValue="content" className="w-full flex-1 flex flex-col">
        <TabsList className="bg-gray-800 mb-4 flex-shrink-0">
          <TabsTrigger value="content" className="data-[state=active]:bg-purple-600">
            <FileText className="h-4 w-4 mr-2" />
            Content
          </TabsTrigger>
          <TabsTrigger value="chat" className="data-[state=active]:bg-purple-600">
            <MessageSquare className="h-4 w-4 mr-2" />
            Chat
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="mt-0 flex-1 overflow-auto">
          {contentView}
        </TabsContent>

        <TabsContent value="chat" className="mt-0 flex-1 overflow-hidden">
          <GroupChatView
            groupId={chatChannelId}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            rules={room.rules}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
