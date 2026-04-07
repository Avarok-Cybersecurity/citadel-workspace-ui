import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { RoomSkeletonLoader } from '../ui/skeleton-room';
import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { useToast } from '@/hooks/use-toast';
import { MdxTemplate } from '@/lib/mdx-templates';
import WorkspaceService from '@/lib/workspace-service';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GroupChatView from '@/components/chat/GroupChatView';
import { FileText, MessageSquare } from 'lucide-react';
import { usePermission } from '@/hooks/use-permission';
import { Permission } from '@/contexts/PermissionsContext';
import { DisabledWithTooltip } from '@/components/ui/DisabledWithTooltip';
import { connectionManager } from '@/lib/connection';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { components } from '../office/mdxComponents';
import { debugLog } from '@/lib/debug-config';
import { RoomContentView } from './RoomContentView';

interface RoomProps {
  nodeId: string;
}

/**
 * Room component that displays room data and integrates with workspace state
 */
export const Room: React.FC<RoomProps> = ({ nodeId }) => {
  const { state } = useWorkspace();
  const { toast } = useToast();

  // Get room data from workspace state (unified node hierarchy)
  const room = state.nodes[nodeId];
  const isLoading = state.loading.nodes;

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
    nodeId,
    Permission.EditMdx
  );

  // Compile MDX content
  useEffect(() => {
    const compileContent = async () => {
      if (!content) return;

      try {
        debugLog('Room', 'Compiling Room MDX content...');
        // Pre-process GFM strikethrough (~~text~~) since remark-gfm is not available
        const processedContent = content.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
        const result = await evaluate(processedContent, {
          ...runtime,
          useMDXComponents: () => components,
          baseUrl: window.location.origin
        });
        debugLog('Room', 'Room MDX compilation successful');
        setCompiledContent(result.default({ components: components }));
      } catch (error) {
        debugLog('Room', 'Error compiling Room MDX:', error);
      }
    };

    runAsyncSetup(compileContent);
  }, [content]);

  // Handle saving MDX content
  const handleSave = async () => {
    try {
      await WorkspaceService.updateNode(nodeId, {
        mdxContent: content
      });

      toast({
        title: "Changes saved",
        description: `The ${room?.name || 'room'} content has been updated`,
        className: "bg-[#232536] border-purple-800 text-purple-200",
      });

      setIsEditing(false);
    } catch (error) {
      debugLog('Room', 'Failed to save Room MDX content:', error);
      toast({
        title: "Error saving changes",
        description: "There was a problem saving your changes. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle template selection
  const handleTemplateSelect = (template: MdxTemplate) => {
    setContent(template.content);

    toast({
      title: "Template applied",
      description: `Applied "${template.name}" template. You can now customize it.`,
      className: "bg-[#232536] border-purple-800 text-purple-200",
    });

    setIsNewContent(false);
  };

  // Show skeleton loader while loading
  if (isLoading || !room) {
    return <RoomSkeletonLoader />;
  }

  const hasEditPermission = canEditMdx;
  const chatEnabled = room.chat_enabled ?? false;
  const chatChannelId = room.chat_channel_id;

  const currentUserId = state.currentUser?.id || state.currentUser?.username || tabSession?.username || 'unknown';
  const currentUserName = state.currentUser?.displayName || state.currentUser?.username || tabSession?.fullName || tabSession?.username || 'Unknown User';

  // Room header
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

  // Content view (MDX content and members) - extracted to RoomContentView
  const contentView = (
    <RoomContentView
      nodeId={nodeId}
      room={room}
      state={state}
      isEditing={isEditing}
      content={content}
      compiledContent={compiledContent}
      isNewContent={isNewContent}
      onContentChange={setContent}
      onTemplateSelect={handleTemplateSelect}
    />
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
            rules={room.rules ?? undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
