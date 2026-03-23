import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { MDXProvider } from '@mdx-js/react';
import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { components } from "./mdxComponents";
import { OfficeLayout } from "./OfficeLayout";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { OfficeSkeletonLoader } from "../ui/skeleton-office";
import { MDXEditor } from "@/components/mdx/MDXEditor";
import TemplateSelector from "@/components/mdx/TemplateSelector";
import { TemplateCategory, MdxTemplate } from "@/lib/mdx-templates";
import { FileText, MessageSquare } from "lucide-react";
import WorkspaceService from "@/lib/workspace-service";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GroupChatView from "@/components/chat/GroupChatView";
import { usePermission } from '@/hooks/use-permission';
import { Permission } from "@/contexts/PermissionsContext";
import { connectionManager } from "@/lib/connection";
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';

interface BaseOfficeProps {
  title: string;
  getInitialContent: () => string;
  nodeId?: string;
}

export const BaseOffice = ({ title, getInitialContent, nodeId }: BaseOfficeProps) => {
  const { state } = useWorkspace();

  // Get the entity data from workspace state (unified node hierarchy)
  const entityData = nodeId ? state.nodes[nodeId] : null;

  // Initialize content from mdx_content if available, otherwise use getInitialContent
  const [content, setContent] = useState<string>(
    entityData?.mdx_content || getInitialContent()
  );
  const [compiledContent, setCompiledContent] = useState<React.ReactNode | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isNewContent, setIsNewContent] = useState(!entityData?.mdx_content);
  const [tabSession, setTabSession] = useState<{ username?: string; fullName?: string } | null>(null);
  const { toast } = useToast();

  // Load tab session asynchronously
  useEffect(() => {
    runAsyncSetup(async () => {
      const session = await connectionManager.getTabSelectedSession();
      setTabSession(session);
    });
  }, []);

  // Determine if we're in a loading state
  const isLoading = state.loading.nodes && !entityData;

  // Determine the domain ID for permission checks
  const domainId = nodeId;

  // Check if user can edit the MDX content using the permissions system
  const { allowed: canEditMdx, reason: editDeniedReason, loading: permissionLoading } = usePermission(
    domainId,
    Permission.EditMdx
  );

  const handleSave = async () => {
    try {
      if (nodeId) {
        await WorkspaceService.updateNode(nodeId, { mdxContent: content });
      }

      toast({
        title: "Changes saved",
        description: `The ${entityData?.name || title} page has been updated`,
        className: "bg-[#343A5C] border-purple-800 text-purple-200",
      });
    } catch (error) {
      debugLog('BaseOffice', 'Failed to save MDX content:', error);
      toast({
        title: "Error saving changes",
        description: "There was a problem saving your changes. Please try again.",
        variant: "destructive",
      });
    }

    setIsEditing(false);
  };

  // Update content when entity data changes
  useEffect(() => {
    if (entityData?.mdx_content) {
      setContent(entityData.mdx_content);
      setIsNewContent(false);
    } else {
      setContent(getInitialContent());
      setIsNewContent(true);
    }
  }, [entityData, getInitialContent]);

  useEffect(() => {
    const compileContent = async () => {
      try {
        debugLog('BaseOffice', 'Compiling MDX content...');
        // Pre-process GFM strikethrough (~~text~~) since remark-gfm is not available
        const processedContent = content.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
        const result = await evaluate(processedContent, {
          ...runtime,
          useMDXComponents: () => components,
          baseUrl: window.location.origin
        });
        debugLog('BaseOffice', 'MDX compilation successful');
        setCompiledContent(result.default({ components: components }));
      } catch (error) {
        debugLog('BaseOffice', 'Error compiling MDX:', error);
      }
    };

    runAsyncSetup(compileContent);
  }, [content]);

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

  // Show skeleton loader during loading state
  if (isLoading) {
    return <OfficeSkeletonLoader />;
  }

  // Use permission check result, defaulting to true if no domain ID (demo mode)
  const hasEditPermission = !domainId || canEditMdx;

  // Check if chat is enabled for this office/room
  const chatEnabled = entityData?.chat_enabled ?? false;
  const chatChannelId = entityData?.chat_channel_id;

  // Get current user info from workspace state OR connection manager
  // The workspace state currentUser may not be populated yet during initial render
  // tabSession is loaded asynchronously via useEffect
  const currentUserId = state.currentUser?.id || state.currentUser?.username || tabSession?.username || 'unknown';
  const currentUserName = state.currentUser?.displayName || state.currentUser?.username || tabSession?.fullName || tabSession?.username || 'Unknown User';

  // Content view (MDX editor or rendered content)
  const contentView = isEditing ? (
    <div className="px-4 pt-6 pb-2">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-white">Edit Content</h2>
        <div className="flex gap-2">
          {(isNewContent || content.trim() === '') && (
            <TemplateSelector
              category={TemplateCategory.OFFICE}
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
        height="400px"
        placeholder="Write your office content here using Markdown or MDX..."
      />
    </div>
  ) : (
    <div className="px-4 pt-6 pb-2 prose prose-invert prose-sm md:prose-base lg:prose-lg max-w-none">
      <MDXProvider components={components}>
        {compiledContent}
      </MDXProvider>
    </div>
  );

  // If chat is not enabled, just show the content
  if (!chatEnabled || !chatChannelId) {
    return (
      <OfficeLayout
        title={entityData?.name || title}
        isEditing={isEditing}
        onEditToggle={() => setIsEditing(!isEditing)}
        onSave={handleSave}
        canEdit={hasEditPermission}
        editDeniedReason={editDeniedReason || undefined}
      >
        {contentView}
      </OfficeLayout>
    );
  }

  // If chat is enabled, show tabs
  return (
    <OfficeLayout
      title={entityData?.name || title}
      isEditing={isEditing}
      onEditToggle={() => setIsEditing(!isEditing)}
      onSave={handleSave}
      canEdit={hasEditPermission}
      editDeniedReason={editDeniedReason || undefined}
    >
      <Tabs defaultValue="content" className="w-full h-full flex flex-col">
        <div className="px-4 pt-4 border-b border-gray-700 flex-shrink-0">
          <TabsList className="bg-gray-800">
            <TabsTrigger value="content" className="data-[state=active]:bg-purple-600">
              <FileText className="h-4 w-4 mr-2" />
              Content
            </TabsTrigger>
            <TabsTrigger value="chat" className="data-[state=active]:bg-purple-600">
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="content" className="mt-0 flex-1 overflow-auto">
          {contentView}
        </TabsContent>

        <TabsContent value="chat" className="mt-0 flex-1 overflow-hidden">
          <GroupChatView
            groupId={chatChannelId}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            rules={entityData?.rules ?? undefined}
          />
        </TabsContent>
      </Tabs>
    </OfficeLayout>
  );
};
