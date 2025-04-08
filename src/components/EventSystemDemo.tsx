/**
 * EventSystemDemo.tsx
 * 
 * A simple component to demonstrate the event system in action.
 * Shows how to initialize the event processor and handle events.
 */

import React, { useState } from 'react';
import { useEventProcessor, useConnection, usePeers, useMessages } from '../lib/event-hooks';
import { sendMessage } from '../lib/workspace-protocol';
import { useAppStore, Message } from '../lib/event-processor';
import { UserRoleTS } from '../types/workspace-types';

const EventSystemDemo: React.FC = () => {
  // Initialize the event processor
  useEventProcessor();

  // Get state from hooks
  const connection = useConnection();
  const { peers, activePeer, setActivePeer } = usePeers();
  const { messages } = useMessages(activePeer || undefined);

  // Local state
  const [messageInput, setMessageInput] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [peerConnectionId, setPeerConnectionId] = useState('');
  const [connectStatus, setConnectStatus] = useState('');

  // Handle connecting
  const handleConnect = () => {
    if (!connectionId.trim()) {
      setConnectStatus('Please enter a connection ID');
      return;
    }

    // This would normally use the actual connection API
    // For demo, we'll just update the state directly
    useAppStore.getState().setConnected(true, connectionId);
    setConnectStatus(`Connected with ID: ${connectionId}`);
  };

  // Handle sending a message
  const handleSendMessage = async () => {
    if (!connection.connected || !connection.cid || !activePeer || !messageInput.trim()) {
      setConnectStatus('Cannot send message: not connected or no active peer');
      return;
    }

    try {
      // Send message through the protocol
      await sendMessage(connection.cid, activePeer, messageInput);
      
      // Add the message to our local state (normally this happens through an event)
      const message: Message = {
        id: crypto.randomUUID(),
        peerCid: activePeer,
        content: new TextEncoder().encode(messageInput),
        timestamp: Date.now(),
        fromSelf: true
      };
      
      useAppStore.getState().addMessage(message);
      
      // Clear input
      setMessageInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
      setConnectStatus(`Error sending message: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Select a peer as active
  const handleSelectPeer = (peerId: string) => {
    setActivePeer(peerId);
  };

  // Add a mock peer for testing
  const handleAddMockPeer = () => {
    if (!peerConnectionId.trim()) {
      setConnectStatus('Please enter a peer connection ID');
      return;
    }

    // Add a mock peer to the state
    useAppStore.getState().updatePeers([{
      id: peerConnectionId,
      username: `user_${peerConnectionId.substring(0, 4)}`,
      email: `user_${peerConnectionId.substring(0, 4)}@example.com`,
      display_name: `User ${peerConnectionId.substring(0, 4)}`,
      role: UserRoleTS.Member,
      permissions: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_active: new Date().toISOString(),
      online: true
    }]);

    setConnectStatus(`Added peer with ID: ${peerConnectionId}`);
    setPeerConnectionId('');
  };

  return (
    <div className="event-system-demo">
      <h1>Event System Demo</h1>
      
      <div className="connection-panel">
        <h2>Connection</h2>
        <div className="status">
          Status: {connection.connected ? 'Connected' : 'Disconnected'}
          {connection.connected && connection.cid && ` (ID: ${connection.cid})`}
        </div>
        
        {!connection.connected ? (
          <div className="connect-form">
            <input
              type="text"
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              placeholder="Enter connection ID"
            />
            <button onClick={handleConnect}>Connect</button>
          </div>
        ) : (
          <button 
            onClick={() => useAppStore.getState().setConnected(false)}
          >
            Disconnect
          </button>
        )}
        
        {connectStatus && <div className="status-message">{connectStatus}</div>}
      </div>
      
      <div className="peers-panel">
        <h2>Peers</h2>
        <div className="add-peer-form">
          <input
            type="text"
            value={peerConnectionId}
            onChange={(e) => setPeerConnectionId(e.target.value)}
            placeholder="Enter peer ID"
          />
          <button onClick={handleAddMockPeer}>Add Mock Peer</button>
        </div>
        
        <div className="peer-list">
          {Object.keys(peers.peers).length === 0 ? (
            <div className="no-peers">No peers available</div>
          ) : (
            <ul>
              {Object.entries(peers.peers).map(([peerId, peer]) => (
                <li 
                  key={peerId}
                  className={peerId === activePeer ? 'active' : ''}
                  onClick={() => handleSelectPeer(peerId)}
                >
                  <span className={`status-indicator ${peer.online ? 'online' : 'offline'}`} />
                  <span className="name">{peer.display_name}</span>
                  <span className="id">({peerId.substring(0, 8)}...)</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      
      {activePeer && (
        <div className="chat-panel">
          <h2>Chat with {peers.peers[activePeer]?.display_name || activePeer}</h2>
          
          <div className="messages">
            {!Array.isArray(messages) || messages.length === 0 ? (
              <div className="no-messages">No messages yet</div>
            ) : (
              <div className="message-list">
                {messages.map((message) => (
                  <div 
                    key={message.id} 
                    className={`message ${message.fromSelf ? 'sent' : 'received'}`}
                  >
                    <div className="content">
                      {new TextDecoder().decode(message.content)}
                    </div>
                    <div className="timestamp">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="message-input">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Type a message..."
              disabled={!connection.connected || !activePeer}
            />
            <button 
              onClick={handleSendMessage}
              disabled={!connection.connected || !activePeer || !messageInput.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
      
      {connection.error && (
        <div className="error-panel">
          <h2>Error</h2>
          <div className="error-message">{connection.error}</div>
        </div>
      )}
    </div>
  );
};

export default EventSystemDemo;
