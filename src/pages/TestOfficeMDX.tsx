import React from 'react';
import { WorkspaceProvider } from '@/lib/workspace-context';
import { BaseOffice } from '@/components/office/BaseOffice';
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
      mdx_content: `# Engineering Office

Welcome to the Engineering Office! This is the central hub for all engineering activities.

## Mission Statement

We build reliable, scalable, and innovative solutions that empower our users and drive business success.

## Teams

### Frontend Team
- React/TypeScript development
- UI/UX implementation
- Performance optimization

### Backend Team
- API development
- Database architecture
- Infrastructure management

### DevOps Team
- CI/CD pipelines
- Monitoring and alerting
- Cloud infrastructure

## Engineering Principles

1. **Code Quality** - Write clean, maintainable code
2. **Testing** - Comprehensive test coverage
3. **Documentation** - Clear and up-to-date docs
4. **Collaboration** - Work together effectively
5. **Innovation** - Continuously improve

## Resources

- [Engineering Wiki](https://wiki.example.com)
- [Code Standards](https://standards.example.com)
- [Architecture Docs](https://arch.example.com)`,
      members: {
        'user-1': {
          id: 'user-1',
          username: 'testuser',
          displayName: 'Test User',
          isOnline: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          role: UserRole.Admin
        }
      }
    }
  },
  rooms: {},
  members: {
    'user-1': {
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      isOnline: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      role: UserRole.Admin
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

export default function TestOfficeMDX() {
  return (
    <WorkspaceProvider state={mockWorkspaceState}>
      <div className="h-screen bg-gray-900 text-white">
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-4">Test Office MDX Editor</h1>
          <div className="bg-gray-800 rounded-lg">
            <BaseOffice 
              title="Engineering Office"
              getInitialContent={() => '# Office Content\n\nWelcome to the office!'}
              officeId="office-1"
            />
          </div>
        </div>
      </div>
    </WorkspaceProvider>
  );
}