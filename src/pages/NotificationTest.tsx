import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/layout/AppLayout';
import { MessagingService } from '@/lib/messaging-service';
import { ConnectionService } from '@/lib/connection-service';
import NotificationService, { NotificationType, NotificationPriority } from '@/lib/notification-service';

const NotificationTest = () => {
  const [title, setTitle] = useState('Test Notification');
  const [content, setContent] = useState('This is a test notification message');
  const [type, setType] = useState<NotificationType>(NotificationType.SYSTEM);
  const [priority, setPriority] = useState<NotificationPriority>(NotificationPriority.NORMAL);
  const [userId, setUserId] = useState('test-user-123');
  
  // Get service instances
  const notificationService = NotificationService.getInstance();
  const messagingService = MessagingService.getInstance();
  const connectionService = ConnectionService.getInstance();
  
  const handleCreateNotification = () => {
    switch (type) {
      case NotificationType.MESSAGE:
        notificationService.addMessageNotification(
          title,
          content,
          userId,
          `msg-${Date.now()}`,
          { timestamp: Date.now() }
        );
        break;
      
      case NotificationType.CONNECTION_REQUEST:
        notificationService.addConnectionRequestNotification(
          title,
          content,
          userId,
          `req-${Date.now()}`,
          [
            {
              id: 'accept',
              label: 'Accept',
              variant: 'default',
              onClick: () => alert('Connection request accepted!')
            },
            {
              id: 'reject',
              label: 'Reject',
              variant: 'destructive',
              onClick: () => alert('Connection request rejected!')
            }
          ]
        );
        break;
      
      case NotificationType.SYSTEM:
      default:
        notificationService.addSystemNotification(
          title,
          content,
          priority
        );
        break;
    }
  };
  
  const handleSimulateMessage = () => {
    messagingService.simulateMessageReceived(userId, content);
  };
  
  const handleSimulateConnectionRequest = () => {
    const request = {
      id: `req-${Date.now()}`,
      requesterId: userId,
      recipientId: 'current-user',
      type: 'p2p_registration',
      status: 'pending',
      message: content,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    connectionService.simulateRequestReceived(request as any);
  };
  
  return (
    <AppLayout>
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6 text-white">Notification System Test</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-[#343A5C] text-white border-purple-800">
            <CardHeader>
              <CardTitle>Create Custom Notification</CardTitle>
              <CardDescription className="text-gray-300">
                Test the notification system with custom parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Notification Title</Label>
                <Input 
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-[#444A6C] border-gray-700 text-white"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="content">Notification Content</Label>
                <Textarea 
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="bg-[#444A6C] border-gray-700 text-white min-h-[100px]"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="type">Notification Type</Label>
                <Select value={type} onValueChange={(value: any) => setType(value)}>
                  <SelectTrigger className="bg-[#444A6C] border-gray-700 text-white">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#343A5C] text-white border-purple-800">
                    <SelectItem value={NotificationType.SYSTEM}>System</SelectItem>
                    <SelectItem value={NotificationType.MESSAGE}>Message</SelectItem>
                    <SelectItem value={NotificationType.CONNECTION_REQUEST}>Connection Request</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {type === NotificationType.SYSTEM && (
                <div className="space-y-2">
                  <Label htmlFor="priority">Notification Priority</Label>
                  <Select value={priority} onValueChange={(value: any) => setPriority(value)}>
                    <SelectTrigger className="bg-[#444A6C] border-gray-700 text-white">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#343A5C] text-white border-purple-800">
                      <SelectItem value={NotificationPriority.LOW}>Low</SelectItem>
                      <SelectItem value={NotificationPriority.NORMAL}>Normal</SelectItem>
                      <SelectItem value={NotificationPriority.HIGH}>High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {(type === NotificationType.MESSAGE || type === NotificationType.CONNECTION_REQUEST) && (
                <div className="space-y-2">
                  <Label htmlFor="userId">User ID</Label>
                  <Input 
                    id="userId"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="bg-[#444A6C] border-gray-700 text-white"
                  />
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handleCreateNotification}
                className="bg-purple-600 hover:bg-purple-700"
              >
                Create Notification
              </Button>
            </CardFooter>
          </Card>
          
          <Card className="bg-[#343A5C] text-white border-purple-800">
            <CardHeader>
              <CardTitle>Simulate Service Events</CardTitle>
              <CardDescription className="text-gray-300">
                Test notifications triggered by system events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Messaging Service</h3>
                <p className="text-gray-300 mb-4">
                  Simulate receiving a new message from another user
                </p>
                <Button 
                  onClick={handleSimulateMessage}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Simulate New Message
                </Button>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-2">Connection Service</h3>
                <p className="text-gray-300 mb-4">
                  Simulate receiving a new connection request
                </p>
                <Button 
                  onClick={handleSimulateConnectionRequest}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Simulate Connection Request
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default NotificationTest;
