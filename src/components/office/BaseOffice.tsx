import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { MDXProvider } from '@mdx-js/react';
import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { components } from "./mdxComponents";
import { OfficeLayout } from "./OfficeLayout";
import { useLocation } from "react-router-dom";
import { useWorkspace } from "../../lib/workspace-context";
import { OfficeSkeletonLoader } from "../ui/skeleton-office";
import { UserRole } from "@/types/workspace-entities";
import { MDXEditor } from "@/components/mdx/MDXEditor";
import TemplateSelector from "@/components/mdx/TemplateSelector";
import { TemplateCategory, MdxTemplate } from "@/lib/mdx-templates";
import { FileText } from "lucide-react";
import WorkspaceService from "@/lib/workspace-service";

interface BaseOfficeProps {
  title: string;
  getInitialContent: (currentRoom: string | null) => string;
  officeId?: string;
  roomId?: string;
}

export const BaseOffice = ({ title, getInitialContent, officeId, roomId }: BaseOfficeProps) => {
  const location = useLocation();
  const currentRoom = new URLSearchParams(location.search).get("room");
  const { state } = useWorkspace();

  // Get the office or room data from workspace state
  const officeData = officeId ? state.offices[officeId] : null;
  const roomData = roomId ? state.rooms[roomId] : null;
  const entityData = roomData || officeData;

  // Initialize content from mdx_content if available, otherwise use getInitialContent
  const [content, setContent] = useState<string>(
    entityData?.mdx_content || getInitialContent(currentRoom)
  );
  const [compiledContent, setCompiledContent] = useState<React.ReactNode | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isNewContent, setIsNewContent] = useState(!entityData?.mdx_content);
  const { toast } = useToast();

  // Determine if we're in a loading state
  const isLoading = roomId 
    ? state.loading.rooms && !roomData 
    : officeId 
    ? state.loading.offices && !officeData 
    : false;

  // Check if user can edit the MDX content
  // For demo/showcase purposes, allow editing by default unless in a production environment
  // In a real implementation, this would check currentUser against permissions
  const canEditMdxContent = (): boolean => {
    // If no officeId or officeData, we're in demo mode - allow editing
    if (!officeId || !officeData) return true;

    // For now, just return true to allow editing
    // In a production version, you would:
    // 1. Get current user ID from auth context/state
    // 2. Check if user is owner or has admin role
    // 3. Check specific permission to edit MDX content
    return true;
  };

  const handleSave = async () => {
    try {
      if (roomId) {
        // Update the room with new mdx_content via workspace protocol
        await WorkspaceService.updateRoom(roomId, {
          mdxContent: content
        });

        toast({
          title: "Changes saved",
          description: `The ${roomData?.name || title} room page has been updated`,
          className: "bg-[#343A5C] border-purple-800 text-purple-200",
        });
      } else if (officeId) {
        // Update the office with new mdx_content via workspace protocol
        await WorkspaceService.updateOffice(officeId, {
          mdxContent: content
        });

        toast({
          title: "Changes saved",
          description: `The ${officeData?.name || title} office page has been updated`,
          className: "bg-[#343A5C] border-purple-800 text-purple-200",
        });
      } else {
        toast({
          title: "Changes saved",
          description: `The ${title.toLowerCase()} page has been updated`,
          className: "bg-[#343A5C] border-purple-800 text-purple-200",
        });
      }
    } catch (error) {
      console.error('Failed to save MDX content:', error);
      toast({
        title: "Error saving changes",
        description: "There was a problem saving your changes. Please try again.",
        variant: "destructive",
      });
    }

    setIsEditing(false);
  };

  // Update content when entity data changes or when room changes
  useEffect(() => {
    if (entityData?.mdx_content) {
      setContent(entityData.mdx_content);
      setIsNewContent(false);
    } else {
      setContent(getInitialContent(currentRoom));
      setIsNewContent(true);
    }
  }, [entityData, currentRoom, getInitialContent]);

  useEffect(() => {
    const compileContent = async () => {
      try {
        console.info('Compiling MDX content...');
        const result = await evaluate(content, {
          ...runtime,
          useMDXComponents: () => components,
          baseUrl: window.location.origin
        });
        console.info('MDX compilation successful');
        setCompiledContent(result.default({ components }));
      } catch (error) {
        console.error('Error compiling MDX:', error);
      }
    };

    compileContent();
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

  const hasEditPermission = canEditMdxContent();

  return (
    <OfficeLayout
      title={entityData?.name || title}
      isEditing={isEditing}
      onEditToggle={() => setIsEditing(!isEditing)}
      onSave={handleSave}
      canEdit={hasEditPermission}
    >
      {isEditing ? (
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
      )}
    </OfficeLayout>
  );
};
