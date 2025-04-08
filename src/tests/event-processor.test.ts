/**
 * Tests for the EventProcessor class
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventProcessor, eventProcessor, useAppStore } from '../lib/event-processor';

// Mock the Tauri event listen function
vi.mock('@tauri-apps/api/event', () => {
  // Store event handlers for testing
  const eventHandlers: Record<string, ((event: any) => void)[]> = {};
  
  return {
    listen: vi.fn().mockImplementation((eventName, callback) => {
      // Initialize the array if it doesn't exist
      if (!eventHandlers[eventName]) {
        eventHandlers[eventName] = [];
      }
      
      // Add the callback to the list
      eventHandlers[eventName].push(callback);
      
      // Return function to access handlers for testing
      (global as any).getEventHandlers = () => eventHandlers;
      
      // Return mock unlistenFn
      return Promise.resolve({
        unlistenFn: vi.fn()
      });
    })
  };
});

// Helper to trigger mock events
function emitMockEvent(eventName: string, payload: any) {
  const handlers = (global as any).getEventHandlers()[eventName];
  
  if (!handlers || handlers.length === 0) {
    throw new Error(`No listener registered for event: ${eventName}`);
  }
  
  // Call all handlers for this event
  handlers.forEach(handler => handler({ payload }));
}

describe('EventProcessor', () => {
  beforeEach(async () => {
    // Reset the store
    useAppStore.setState({
      connection: {
        connected: false,
        cid: null,
        error: null,
      },
      peers: {
        peers: {},
        activePeer: null,
      },
      messages: {
        messages: {},
      },
      workspace: {
        offices: [],
        rooms: {},
        members: {},
        currentOffice: null,
        currentRoom: null,
      },
      // Make sure methods are retained
      setConnected: useAppStore.getState().setConnected,
      setConnectionError: useAppStore.getState().setConnectionError,
      updatePeers: useAppStore.getState().updatePeers,
      setActivePeer: useAppStore.getState().setActivePeer,
      addMessage: useAppStore.getState().addMessage,
      updateOffices: useAppStore.getState().updateOffices,
      updateRooms: useAppStore.getState().updateRooms,
      updateMembers: useAppStore.getState().updateMembers,
      setCurrentOffice: useAppStore.getState().setCurrentOffice,
      setCurrentRoom: useAppStore.getState().setCurrentRoom
    });
    
    // Clear previous handlers
    (global as any).getEventHandlers = () => ({});
    
    // Initialize the processor to register event listeners
    // Wait for it to complete
    await eventProcessor.initialize();
  });
  
  afterEach(() => {
    // Reset mocks
    vi.clearAllMocks();
  });

  // Test setup handler - validate our test harness
  it('should register event listeners during initialization', () => {
    const handlers = (global as any).getEventHandlers();
    
    // Check that expected listeners are registered
    expect(handlers).toBeDefined();
    expect(handlers['offices:loaded']).toBeDefined();
    expect(handlers['office:loaded']).toBeDefined();
    expect(handlers['rooms:loaded']).toBeDefined();
    expect(handlers['operation:error']).toBeDefined();
  });
  
  it('should update offices when offices:loaded event is received', () => {
    // Mock office data
    const mockOffices = [
      { id: '1', name: 'Office 1', description: 'Description 1' },
      { id: '2', name: 'Office 2', description: 'Description 2' }
    ];
    
    // Emit the offices:loaded event
    emitMockEvent('offices:loaded', {
      offices: mockOffices,
      connection: { cid: '123', peer_cid: '456' }
    });
    
    // Verify the store was updated
    const state = useAppStore.getState();
    expect(state.workspace.offices).toEqual(mockOffices);
  });
  
  it('should handle room:loaded events', () => {
    // Mock a single room
    const mockRoom = { id: '1', office_id: '1', name: 'Room 1' };
    
    // Emit the event
    emitMockEvent('room:loaded', {
      room: mockRoom,
      connection: { cid: '123' }
    });
    
    // Verify the store was updated correctly
    const state = useAppStore.getState();
    expect(state.workspace.rooms['1']).toBeDefined();
    expect(state.workspace.rooms['1'].length).toBe(1);
    expect(state.workspace.rooms['1'][0]).toEqual(mockRoom);
  });
  
  it('should set error state when operation:error is received', () => {
    // Mock error message
    const errorMessage = 'Connection timeout';
    
    // Emit error event
    emitMockEvent('operation:error', {
      message: errorMessage,
      connection: { cid: '123' }
    });
    
    // Verify store was updated
    const state = useAppStore.getState();
    expect(state.connection.error).toBe(errorMessage);
  });
});
