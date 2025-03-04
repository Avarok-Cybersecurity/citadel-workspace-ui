import React, { useState } from 'react';
import { 
  connect, 
  register, 
  listKnownServers, 
  workspaceConfigToConnectRequest, 
  workspaceConfigToRegistrationRequest 
} from '@/lib/tauri';
import { WorkspaceConfig } from '@/types/workspace';

const defaultWorkspaceConfig: WorkspaceConfig = {
  serverAddress: '127.0.0.1:12345',
  password: '',
  securityLevel: '2',
  securityMode: '1',
  encryptionAlgorithm: '0',
  kemAlgorithm: '0',
  signingAlgorithm: '0',
  headerObfuscatorMode: '0',
  fullName: 'Test User',
  username: 'testuser',
  profilePassword: 'password123'
};

export function TauriDemo() {
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceConfig>(defaultWorkspaceConfig);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setWorkspaceConfig(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleRegister = async () => {
    setIsLoading(true);
    setMessage('Registering...');
    
    try {
      const request = workspaceConfigToRegistrationRequest(workspaceConfig);
      const response = await register(request);
      
      if (response.success) {
        setMessage(`Registration successful: ${response.message}`);
      } else {
        setMessage(`Registration failed: ${response.message}`);
      }
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    setIsLoading(true);
    setMessage('Connecting...');
    
    try {
      const request = workspaceConfigToConnectRequest(workspaceConfig);
      const response = await connect(request);
      
      if (response.success && response.cid) {
        setConnectionId(response.cid);
        setMessage(`Connection successful! CID: ${response.cid}`);
      } else {
        setMessage(`Connection failed: ${response.message}`);
      }
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleListServers = async () => {
    setIsLoading(true);
    setMessage('Listing known servers...');
    
    try {
      const response = await listKnownServers({ cid: connectionId || '0' });
      
      if (response.servers.length > 0) {
        setMessage(`Found ${response.servers.length} server(s): ${response.servers.map(s => s.server_address).join(', ')}`);
      } else {
        setMessage('No known servers found');
      }
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4">Tauri API Demo</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Server Address</label>
          <input
            type="text"
            name="serverAddress"
            value={workspaceConfig.serverAddress}
            onChange={handleInputChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Username</label>
          <input
            type="text"
            name="username"
            value={workspaceConfig.username}
            onChange={handleInputChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Profile Password</label>
          <input
            type="password"
            name="profilePassword"
            value={workspaceConfig.profilePassword}
            onChange={handleInputChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
          />
        </div>
        
        <div className="flex space-x-4">
          <button
            onClick={handleRegister}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
          >
            Register
          </button>
          
          <button
            onClick={handleConnect}
            disabled={isLoading}
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
          >
            Connect
          </button>
          
          <button
            onClick={handleListServers}
            disabled={isLoading}
            className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50"
          >
            List Servers
          </button>
        </div>
        
        {message && (
          <div className="mt-4 p-3 bg-gray-100 rounded-md">
            <p>{message}</p>
          </div>
        )}
        
        {connectionId && (
          <div className="mt-4 p-3 bg-green-100 rounded-md">
            <p className="font-semibold">Connected with ID: {connectionId}</p>
          </div>
        )}
      </div>
    </div>
  );
}
