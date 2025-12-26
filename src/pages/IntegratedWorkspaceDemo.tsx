import React, { useEffect } from 'react';
import { WorkspaceView } from '@/components/workspace/WorkspaceView';
import { WorkspaceContext } from '@/lib/workspace-context';
import { P2PRegistrationService } from '@/lib/p2p-registration-service';

// Mock workspace data for demonstration
const mockWorkspaceState = {
  user: {
    cid: '12345',
    username: 'demo_user',
    fullName: 'Demo User'
  },
  workspaceId: 'demo-workspace',
  isAuthenticated: true,
  isConnected: true,
  offices: {
    'office1': {
      id: 'office1',
      name: 'Engineering Office',
      description: 'Main engineering workspace',
      createdAt: new Date().toISOString(),
      permissions: [],
      mdx_content: '# Engineering Office\n\nWelcome to the engineering workspace!'
    }
  },
  rooms: {
    'room1': {
      id: 'room1',
      name: 'General Discussion',
      description: 'General team discussions and updates',
      officeId: 'office1',
      createdAt: new Date().toISOString(),
      permissions: [],
      mdx_content: '# General Discussion\n\nDiscuss team updates and general topics here.'
    }
  },
  members: {},
  permissions: {
    canCreateOffice: true,
    canCreateRoom: true,
    canInviteMembers: true
  },
  loading: {
    offices: false,
    rooms: false,
    members: false
  }
};

export const IntegratedWorkspaceDemo = () => {
  console.log('IntegratedWorkspaceDemo: Rendering demo workspace');
  console.log('Mock workspace state:', mockWorkspaceState);
  
  // Start P2P registration service for demo
  useEffect(() => {
    console.log('Starting P2P registration service for demo...');
    const service = P2PRegistrationService.getInstance();
    service.start({ pollingInterval: 5000, maxRetries: 3 }).catch(console.error);
    
    return () => {
      service.stop();
    };
  }, []);

  return (
    <WorkspaceContext.Provider 
      value={{
        state: mockWorkspaceState,
        // Add mock dispatch functions
        dispatch: () => {},
        updateOffice: () => {},
        updateRoom: () => {},
        updateMember: () => {},
        removeMember: () => {},
        updatePermissions: () => {},
        reset: () => {},
        updateWorkspaceId: () => {},
        setAuthenticated: () => {},
        setConnectionStatus: () => {}
      }}
    >
      <div className="h-screen w-screen bg-[#1C1D28]">
        <div className="p-4 bg-[#262C4A] text-white">
          <h1 className="text-xl font-bold">Integrated Workspace Demo</h1>
          <p className="text-sm text-gray-400">
            This demonstrates the integrated MDX editor and P2P messaging in a Slack-like interface
          </p>
        </div>
        <div className="h-[calc(100vh-5rem)]">
          <WorkspaceView officeId="office1" roomId="room1" />
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
};