import React from 'react';
import { WorkspaceProvider } from '@/lib/workspace-context';
import { Room } from '@/components/room/Room';
import { UserRole } from '@/types/workspace-entities';

// Mock workspace state for testing
const mockWorkspaceState = {
  workspace: {
    id: 'test-workspace-1',
    name: 'Test Workspace',
    metadata: {}
  },
  currentUser: {
    id: 'user-1',
    username: 'testuser',
    name: 'Test User'
  },
  offices: {
    'office-1': {
      id: 'office-1',
      name: 'Engineering Office',
      description: 'Main engineering office',
      ownerId: 'user-1',
      chat_enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mdx_content: '',
      members: {}
    }
  },
  rooms: {
    'room-1': {
      id: 'room-1',
      name: 'Frontend Development',
      description: 'Room for frontend development discussions',
      officeId: 'office-1',
      ownerId: 'user-1',
      isPrivate: false,
      chat_enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mdx_content: `# Frontend Development Room

Welcome to the frontend development room! This is where we discuss all things frontend.

## Current Topics

- React best practices
- State management patterns
- Performance optimization
- Testing strategies

## Resources

### Documentation
- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Code Examples
\`\`\`typescript
// Example React component
export const ExampleComponent = () => {
  const [count, setCount] = useState(0);

  return (
    <div>
      <h1>Count: {count}</h1>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
};
\`\`\`

## Team Guidelines

1. Always use TypeScript
2. Write tests for new features
3. Follow the established code style
4. Document complex logic`,
      members: {
        'user-1': {
          id: 'user-1',
          username: 'testuser',
          displayName: 'Test User',
          isOnline: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          role: UserRole.Admin
        },
        'user-2': {
          id: 'user-2',
          username: 'janedoe',
          displayName: 'Jane Doe',
          isOnline: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          role: UserRole.Member
        }
      }
    },
    'room-2': {
      id: 'room-2',
      name: 'Backend Development',
      description: 'Room for backend development discussions',
      officeId: 'office-1',
      ownerId: 'user-1',
      isPrivate: false,
      chat_enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mdx_content: '',
      members: {}
    }
  },
  members: {
    'user-1': {
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      isOnline: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      role: UserRole.Admin
    },
    'user-2': {
      id: 'user-2',
      username: 'janedoe',
      displayName: 'Jane Doe',
      isOnline: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      role: UserRole.Member
    }
  },
  loading: {
    workspace: false,
    offices: false,
    rooms: false,
    members: false
  },
  messages: {
    byPeer: {}
  },
  typing: {
    peerIds: [],
    lastUpdated: 0
  }
};

export default function TestRoomMDX() {
  return (
    <WorkspaceProvider state={mockWorkspaceState}>
      <div className="h-screen bg-gray-900 text-white">
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-4">Test Room MDX Editor</h1>
          <div className="bg-gray-800 rounded-lg p-4">
            <Room roomId="room-1" officeId="office-1" />
          </div>
        </div>
      </div>
    </WorkspaceProvider>
  );
}