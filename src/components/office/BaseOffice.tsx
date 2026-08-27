import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { MDXProvider } from '@mdx-js/react';
import { components } from "./mdxComponents";
import { OfficeLayout } from "./OfficeLayout";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { OfficeSkeletonLoader } from "../ui/skeleton-office";
import { MDXEditor } from "@/components/mdx/MDXEditor";
import TemplateSelector from "@/components/mdx/TemplateSelector";
import { TemplateCategory, MdxTemplate } from "@/lib/mdx-templates";
import { saveOfficeContent } from "./save-office-content";
import { useCompiledMdx } from "./use-compiled-mdx";
import { useUnsavedMdxGuard, DISCARD_EDIT_PROMPT } from "./use-unsaved-mdx-guard";
import { useConfirm } from "@/components/shared/confirm-dialog";
import WorkspaceService from "@/lib/workspace-service";
import { OfficeChatTabs } from "./OfficeChatTabs";
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
  const [isEditing, setIsEditing] = useState(false);
  const compiledContent = useCompiledMdx(content, components);
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
  const { allowed: canEditMdx, reason: editDeniedReason } = usePermission(
    domainId,
    Permission.EditMdx
  );

  const { isDirty } = useUnsavedMdxGuard({ isEditing, content, ownerId: nodeId ?? 'workspace-root' });
  const confirm = useConfirm();

  // Cancel used to be a bare toggle. The load effect below then restored the
  // stored document over the buffer, so the edits were gone with no prompt.
  const handleEditToggle = async () => {
    if (isEditing && isDirty && !(await confirm(DISCARD_EDIT_PROMPT))) return;
    setIsEditing(!isEditing);
  };

  const handleSave = async () => {
    // The decision lives in saveOfficeContent so it can be tested without
    // rendering the MDX pipeline; this supplies the I/O and reacts to the answer.
    const saved = await saveOfficeContent({
      nodeId,
      content,
      displayName: entityData?.name || title,
      write: (id, mdxContent) => WorkspaceService.updateNode(id, { mdxContent }),
      notify: ({ kind, title: noticeTitle, description }) =>
        toast({
          title: noticeTitle,
          description,
          variant: kind === 'success' ? 'success' : 'destructive',
        }),
      log: (message, error) => debugLog('BaseOffice', message, error),
    });

    // Only on a confirmed write: anything else and the user's text exists
    // nowhere but this editor.
    if (saved) setIsEditing(false);
  };

  // Load the document into the buffer — but NEVER while the user is editing it.
  //
  // `content` is the controlled value of the textarea, so every run of this
  // effect replaced whatever was being typed and destroyed the native undo
  // stack with it. It fired far more often than "when entity data changes":
  // `getInitialContent` was a new function identity on every render of
  // WorkspaceView, which subscribes to the whole workspace store — so a
  // colleague's typing indicator or an incoming message elsewhere in the app
  // wiped the open editor. On a brand-new node the else branch ran and replaced
  // the user's work with the default template.
  //
  // A remote save is the deterministic case: it mints a new node object, and
  // the author's paragraph became the other person's. Not overwriting is the
  // safe half of that; telling the user their view is now stale is recorded in
  // docs/ROBUSTNESS.md as the other half.
  useEffect(() => {
    if (isEditing) return;
    if (entityData?.mdx_content) {
      setContent(entityData.mdx_content);
      setIsNewContent(false);
    } else {
      setContent(getInitialContent());
      setIsNewContent(true);
    }
  }, [entityData, getInitialContent, isEditing]);


  // Handle template selection
  const handleTemplateSelect = (template: MdxTemplate) => {
    // Replace content with template content
    setContent(template.content);

    // Show success toast
    toast({
      title: "Template applied",
      description: `Applied "${template.name}" template. You can now customize it.`,
      variant: 'success',
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
    <div className="px-6 lg:px-10 pt-8 pb-4 max-w-4xl">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-foreground">Edit Content</h2>
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
    // dark:prose-invert, not prose-invert. The modifier inverts Typography's
    // colours FOR a dark background, so applying it unconditionally made every
    // heading and every bold run light-on-light in light mode: a workspace
    // document showed its body copy and its emoji, and nothing else.
    <div className="px-6 lg:px-10 pt-8 pb-4 prose dark:prose-invert prose-sm md:prose-base lg:prose-lg max-w-4xl">
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
        onEditToggle={() => { void handleEditToggle(); }}
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
      onEditToggle={() => { void handleEditToggle(); }}
      onSave={handleSave}
      canEdit={hasEditPermission}
      editDeniedReason={editDeniedReason || undefined}
    >
      <OfficeChatTabs
        contentView={contentView}
        chatChannelId={chatChannelId}
        nodeId={nodeId}
        roomName={entityData?.name || title}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        rules={entityData?.rules ?? undefined}
      />
    </OfficeLayout>
  );
};
