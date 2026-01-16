/**
 * event-hooks.ts
 * 
 * React hooks for accessing the event system and application state.
 */

import { useEffect } from 'react';
import { eventProcessor, useAppStore, Message } from './event-processor';

/**
 * Hook to initialize the event processor when a component mounts
 * 
 * Should be used in a top-level component like App.tsx
 */
export function useEventProcessor(): void {
  useEffect(() => {
    // Initialize event processor on component mount
    const initialize = async () => {
      try {
        await eventProcessor.initialize();
      } catch (error) {
        console.error('Failed to initialize event processor:', error);
      }
    };

    void initialize();

    // Clean up on component unmount
    return () => {
      eventProcessor.cleanup().catch(error => {
        console.error('Failed to clean up event processor:', error);
      });
    };
  }, []);
}

/**
 * Hook to access connection state
 * 
 * @returns Connection state including connected status, cid, and error
 */
export function useConnection() {
  return useAppStore(state => state.connection);
}

/**
 * Hook to access peer state and actions
 * 
 * @returns Peer state and actions
 */
export function usePeers() {
  const peers = useAppStore(state => state.peers);
  const updatePeers = useAppStore(state => state.updatePeers);
  const setActivePeer = useAppStore(state => state.setActivePeer);
  
  return {
    ...peers,
    updatePeers,
    setActivePeer,
  };
}

/**
 * Hook to access messages for a specific peer or all messages
 * 
 * @param peerCid Optional peer CID to filter messages
 * @returns Messages and message actions
 */
export function useMessages(peerCid?: string) {
  const messages = useAppStore(state => {
    const allMessages = state.messages.messages;
    
    if (peerCid) {
      return allMessages[peerCid] || [];
    }
    
    return allMessages;
  });
  
  const addMessage = useAppStore(state => state.addMessage);
  
  // Helper to add a new outgoing message
  const sendMessage = (peerCid: string, content: Uint8Array): Message => {
    const message: Message = {
      id: crypto.randomUUID(),
      peerCid,
      content,
      timestamp: Date.now(),
      fromSelf: true
    };
    
    addMessage(message);
    return message;
  };
  
  return {
    messages,
    addMessage,
    sendMessage
  };
}

/**
 * Hook to access workspace state and actions
 * 
 * @returns Workspace state and actions
 */
export function useWorkspace() {
  const workspace = useAppStore(state => state.workspace);
  const updateOffices = useAppStore(state => state.updateOffices);
  const updateRooms = useAppStore(state => state.updateRooms);
  const updateMembers = useAppStore(state => state.updateMembers);
  const setCurrentOffice = useAppStore(state => state.setCurrentOffice);
  const setCurrentRoom = useAppStore(state => state.setCurrentRoom);
  
  return {
    ...workspace,
    updateOffices,
    updateRooms,
    updateMembers,
    setCurrentOffice,
    setCurrentRoom
  };
}
