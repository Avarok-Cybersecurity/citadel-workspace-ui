import React, { useEffect, useState } from 'react';
import { mockTauriEvent, simulateRustCall } from '@/lib/mock-server';
import { connect, register, listKnownServers } from '@/lib/tauri';
import { WorkspaceConfig } from '@/types/workspace';

// Component that listens for events from Rust and responds to them
export function RustToTSListener() {
  const [events, setEvents] = useState<Array<{type: string, payload: any, timestamp: Date}>>([]);
  const [responses, setResponses] = useState<Array<{type: string, payload: any, timestamp: Date}>>([]);
  
  // Create a sample workspace config for testing
  const createTestConfig = (serverAddress: string): WorkspaceConfig => ({
    serverAddress,
    password: 'test-password',
    securityLevel: '2',
    securityMode: '1',
    encryptionAlgorithm: '0',
    kemAlgorithm: '0',
    signingAlgorithm: '0',
    headerObfuscatorMode: '0',
    fullName: 'Test User',
    username: 'testuser',
    profilePassword: 'test-profile-password'
  });
  
  // Handle connection requests from Rust
  const handleConnectionRequest = async (data: { serverAddress: string }) => {
    // Log the event
    addEvent('connection-request', data);
    
    try {
      // Create a workspace config from the server address
      const config = createTestConfig(data.serverAddress);
      
      // Call the connect function
      const result = await connect(config);
      
      // Log the response
      addResponse('connection-response', result);
    } catch (error) {
      // Log any errors
      addResponse('connection-error', error);
    }
  };
  
  // Handle registration requests from Rust
  const handleRegistrationRequest = async (data: { serverAddress: string }) => {
    // Log the event
    addEvent('registration-request', data);
    
    try {
      // Create a workspace config from the server address
      const config = createTestConfig(data.serverAddress);
      
      // Call the register function
      const result = await register(config);
      
      // Log the response
      addResponse('registration-response', result);
    } catch (error) {
      // Log any errors
      addResponse('registration-error', error);
    }
  };
  
  // Handle notification events from Rust
  const handleNotification = (data: { title: string, body: string }) => {
    // Log the event
    addEvent('notification', data);
    
    // Display a notification (in a real app, this would show a toast or notification)
    console.log(`Notification: ${data.title} - ${data.body}`);
  };
  
  // Handle error events from Rust
  const handleError = (data: { errorCode: string, message: string }) => {
    // Log the event
    addEvent('error', data);
    
    // Display an error (in a real app, this would show an error message)
    console.error(`Error ${data.errorCode}: ${data.message}`);
  };
  
  // Handle server list updates from Rust
  const handleServerListUpdate = async (data: { servers: any[] }) => {
    // Log the event
    addEvent('server-list-update', data);
    
    try {
      // Call the listKnownServers function to verify it works
      const result = await listKnownServers();
      
      // Log the response
      addResponse('server-list-response', result);
    } catch (error) {
      // Log any errors
      addResponse('server-list-error', error);
    }
  };
  
  // Helper function to add an event to the events list
  const addEvent = (type: string, payload: any) => {
    setEvents(prev => [...prev, { type, payload, timestamp: new Date() }]);
  };
  
  // Helper function to add a response to the responses list
  const addResponse = (type: string, payload: any) => {
    setResponses(prev => [...prev, { type, payload, timestamp: new Date() }]);
  };
  
  // Set up event listeners when the component mounts
  useEffect(() => {
    // Set up listeners for events from Rust
    const unlistenConnection = mockTauriEvent.listen('connection-request', handleConnectionRequest);
    const unlistenRegistration = mockTauriEvent.listen('registration-request', handleRegistrationRequest);
    const unlistenNotification = mockTauriEvent.listen('notification', handleNotification);
    const unlistenError = mockTauriEvent.listen('error', handleError);
    const unlistenServerList = mockTauriEvent.listen('server-list-update', handleServerListUpdate);
    
    // Clean up listeners when the component unmounts
    return () => {
      unlistenConnection();
      unlistenRegistration();
      unlistenNotification();
      unlistenError();
      unlistenServerList();
    };
  }, []);
  
  // Function to simulate events from Rust for testing
  const simulateEvents = () => {
    // Simulate a connection request
    simulateRustCall.requestConnection('127.0.0.1:12345');
    
    // Simulate a registration request after a short delay
    setTimeout(() => {
      simulateRustCall.requestRegistration('127.0.0.1:12345');
    }, 500);
    
    // Simulate a notification after a delay
    setTimeout(() => {
      simulateRustCall.sendNotification('Test Notification', 'This is a test notification from Rust');
    }, 1000);
    
    // Simulate an error after a delay
    setTimeout(() => {
      simulateRustCall.sendError('TEST_ERROR', 'This is a test error from Rust');
    }, 1500);
    
    // Simulate a server list update after a delay
    setTimeout(() => {
      simulateRustCall.updateServerList([
        { server_address: '127.0.0.1:12345' },
        { server_address: '192.168.1.100:12345' }
      ]);
    }, 2000);
  };
  
  // Format a timestamp for display
  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };
  
  return (
    <div className="p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4">Rust-to-TypeScript Communication Tester</h2>
      
      <div className="mb-4">
        <button
          onClick={simulateEvents}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
        >
          Simulate Rust Events
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-semibold mb-2">Events from Rust</h3>
          <div className="bg-gray-100 p-3 rounded-md h-96 overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-gray-500">No events received yet. Click "Simulate Rust Events" to test.</p>
            ) : (
              events.map((event, index) => (
                <div key={index} className="mb-2 pb-2 border-b border-gray-200">
                  <div className="flex justify-between">
                    <span className="font-medium">{event.type}</span>
                    <span className="text-xs text-gray-500">{formatTimestamp(event.timestamp)}</span>
                  </div>
                  <pre className="text-xs mt-1 bg-gray-200 p-2 rounded overflow-x-auto">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div>
          <h3 className="font-semibold mb-2">Responses to Rust</h3>
          <div className="bg-gray-100 p-3 rounded-md h-96 overflow-y-auto">
            {responses.length === 0 ? (
              <p className="text-gray-500">No responses sent yet. Events from Rust will trigger responses.</p>
            ) : (
              responses.map((response, index) => (
                <div key={index} className="mb-2 pb-2 border-b border-gray-200">
                  <div className="flex justify-between">
                    <span className="font-medium">{response.type}</span>
                    <span className="text-xs text-gray-500">{formatTimestamp(response.timestamp)}</span>
                  </div>
                  <pre className="text-xs mt-1 bg-gray-200 p-2 rounded overflow-x-auto">
                    {JSON.stringify(response.payload, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      <div className="mt-6">
        <h3 className="font-semibold mb-2">Test Information</h3>
        <p className="text-sm">
          This component tests the communication from Rust to TypeScript by:
        </p>
        <ul className="list-disc pl-5 mt-2 text-sm">
          <li>Setting up event listeners for events from Rust</li>
          <li>Responding to those events by calling TypeScript functions</li>
          <li>Simulating events that would normally come from Rust</li>
          <li>Displaying the events received and responses sent</li>
        </ul>
      </div>
    </div>
  );
}
