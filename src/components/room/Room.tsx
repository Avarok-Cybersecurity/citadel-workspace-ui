import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../../lib/workspace-context';
import { RoomSkeletonLoader } from '../ui/skeleton-room';
import { invoke } from '@tauri-apps/api/core';
import { User, UserRole } from '../../types/workspace-entities';
import { MDXProvider } from '@mdx-js/react';
import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { useToast } from '@/hooks/use-toast';
import { MDXEditor } from '@/components/mdx/MDXEditor';
import TemplateSelector from '@/components/mdx/TemplateSelector';
import { TemplateCategory, MdxTemplate } from '@/lib/mdx-templates';

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

  // Fetch room data if not available
  useEffect(() => {
    const fetchRoomData = async () => {
      if (!room && !isLoading) {
        try {
          // Call Tauri command to load room
          await invoke('get_room', { roomId });
        } catch (error) {
          console.error('Failed to load room:', error);
        }
      }
    };

    fetchRoomData();
  }, [roomId, room, isLoading]);

  // Update content when room data changes
  useEffect(() => {
    if (room?.mdx_content) {
      setContent(room.mdx_content);
      setIsNewContent(false);
    } else {
      setIsNewContent(true);
    }
  }, [room]);

  // Compile MDX content
  useEffect(() => {
    const compileContent = async () => {
      if (!content) return;

      try {
        console.info('Compiling Room MDX content...');
        const result = await evaluate(content, {
          ...runtime,
          useMDXComponents: () => components,
          baseUrl: window.location.origin
        });
        console.info('Room MDX compilation successful');
        setCompiledContent(result.default({ components }));
      } catch (error) {
        console.error('Error compiling Room MDX:', error);
      }
    };

    compileContent();
  }, [content]);

  // Check if user can edit the MDX content
  const canEditMdxContent = (): boolean => {
    // If no room data, we're in demo mode - allow editing
    if (!room) return true;

    // For now, just return true to allow editing
    // In a production version, you would:
    // 1. Get current user ID from auth context/state
    // 2. Check if user is owner or has admin role
    // 3. Check specific permission to edit MDX content
    return true;
  };

  // Handle saving MDX content
  const handleSave = async () => {
    try {
      // Call Tauri command to update the room with new mdx_content
      await invoke('update_room', {
        roomId,
        mdx_content: content
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

  const hasEditPermission = canEditMdxContent();

  return (
    <div className="p-4">
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
          {hasEditPermission && (
            isEditing ? (
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
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
              >
                Edit
              </button>
            )
          )}
          <button
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
          >
            Join Room
          </button>
        </div>
      </div>

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
          <MDXProvider components={components}>
            {compiledContent}
          </MDXProvider>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4">
        {/* Topics section */}
        <h3 className="text-lg font-semibold text-white mt-4 mb-2">Topics</h3>
        {[
          { title: 'General Discussion', description: 'General chat for all members' },
          { title: 'Announcements', description: 'Important updates and information' }
        ].map((topic, index) => (
          <div key={index} className="flex items-start space-x-3 p-4 border border-gray-800 rounded-lg bg-gray-800 bg-opacity-30">
            <div className="h-8 w-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold">
              {index + 1}
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-white">{topic.title}</h3>
              <p className="text-gray-400 mt-1">{topic.description}</p>
            </div>
          </div>
        ))}
      </div>

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
    </div>
  );
};
