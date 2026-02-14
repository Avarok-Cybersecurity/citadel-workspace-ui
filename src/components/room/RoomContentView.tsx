import React from 'react';
import { MDXProvider } from '@mdx-js/react';
import { MDXEditor } from '@/components/mdx/MDXEditor';
import TemplateSelector from '@/components/mdx/TemplateSelector';
import { TemplateCategory, MdxTemplate } from '@/lib/mdx-templates';
import { components } from '../office/mdxComponents';
import type { WorkspaceState } from '@/contexts/WorkspaceContext';

interface RoomContentViewProps {
  nodeId: string;
  room: WorkspaceState['nodes'][string];
  state: WorkspaceState;
  isEditing: boolean;
  content: string;
  compiledContent: React.ReactNode | null;
  isNewContent: boolean;
  onContentChange: (value: string) => void;
  onTemplateSelect: (template: MdxTemplate) => void;
}

/**
 * Renders the MDX content editing/viewing area and the member list for a room.
 */
export const RoomContentView: React.FC<RoomContentViewProps> = ({
  room,
  state,
  isEditing,
  content,
  compiledContent,
  isNewContent,
  onContentChange,
  onTemplateSelect,
}) => {
  return (
    <>
      {isEditing ? (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-white">Edit Room Content</h2>
            <div className="flex gap-2">
              {(isNewContent || content.trim() === '') && (
                <TemplateSelector
                  category={TemplateCategory.ROOM}
                  onSelectTemplate={onTemplateSelect}
                  buttonVariant="outline"
                  buttonSize="sm"
                  buttonText="Use Template"
                />
              )}
            </div>
          </div>
          <MDXEditor
            value={content}
            onChange={(value) => onContentChange(value)}
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

      {room.members && room.members.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center space-x-2 mb-4">
            <h3 className="text-lg font-semibold text-white">Members</h3>
            <span className="bg-gray-700 text-gray-300 px-2 py-0.5 text-xs rounded-full">
              {room.members.length}
            </span>
          </div>

          <div className="space-y-3">
            {room.members.map((memberId) => {
              const member = state.members[memberId];
              const displayName = member?.displayName || memberId;
              return (
                <div key={memberId} className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-white">{displayName}</p>
                    <p className="text-gray-400 text-sm">{member?.role || 'Member'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};
