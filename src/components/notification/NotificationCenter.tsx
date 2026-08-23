import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import NotificationService, { 
  Notification, 
  NotificationType 
} from '@/lib/notification-service';
import NotificationItem from '@/components/notification/NotificationItem';

const NotificationCenter = () => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | NotificationType>('all');
  
  const notificationService = NotificationService.getInstance();
  
  // Get counts of different notification types
  const unreadCount = notifications.filter(n => !n.read).length;
  const messageCount = notifications.filter(n => n.type === NotificationType.MESSAGE && !n.read).length;
  const requestCount = notifications.filter(n => n.type === NotificationType.PEER_REGISTRATION && !n.read).length;
  const systemCount = notifications.filter(n => n.type === NotificationType.SYSTEM && !n.read).length;
  
  useEffect(() => {
    // Initial load of notifications
    const allNotifications = notificationService.getNotifications();
    setNotifications(allNotifications);
    
    // Register for notification updates
    const unregister = notificationService.registerNotificationHandler((notification) => {
      // Check if this is a removed notification
      if (notification.id.startsWith('removed:')) {
        const actualId = notification.id.replace('removed:', '');
        setNotifications(prev => prev.filter(n => n.id !== actualId));
        return;
      }
      
      setNotifications(prev => {
        // Check if we already have this notification
        const existingIndex = prev.findIndex(n => n.id === notification.id);
        if (existingIndex >= 0) {
          // Update existing notification
          const updated = [...prev];
          updated[existingIndex] = notification;
          return updated;
        } else {
          // Add new notification
          return [notification, ...prev];
        }
      });
    });
    
    // Delay marking as read so the user actually sees the notifications first
    let readTimeout: ReturnType<typeof setTimeout> | null = null;
    if (open) {
      readTimeout = setTimeout(() => {
        notificationService.markAllAsRead();
      }, 2000);
    }
    
    return () => {
      unregister();
      if (readTimeout) clearTimeout(readTimeout);
    };
  }, [open, notificationService]);
  
  // Filter notifications based on the active tab
  const filteredNotifications = activeTab === 'all' 
    ? notifications 
    : notifications.filter(n => n.type === activeTab);
  
  const handleClearAll = () => {
    const notificationIds = filteredNotifications.map(n => n.id);
    notificationIds.forEach(id => notificationService.removeNotification(id));
  };
  
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 px-1.5 min-w-5 h-5 flex items-center justify-center"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] bg-card text-foreground border-purple-800">
        <SheetHeader className="border-b border-gray-700 pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-foreground">Notifications</SheetTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-foreground/80"
              onClick={handleClearAll}
            >
              {activeTab === 'all' ? 'Clear All' : 'Clear Shown'}
            </Button>
          </div>
        </SheetHeader>
        
        <Tabs defaultValue="all" value={activeTab} onValueChange={(value) => setActiveTab(value as 'all' | NotificationType)}>
          <TabsList className="grid grid-cols-4 mt-4 mb-6 bg-card">
            <TabsTrigger value="all" className="data-[state=active]:bg-surface data-[state=active]:text-foreground">
              All {unreadCount > 0 && `(${unreadCount})`}
            </TabsTrigger>
            <TabsTrigger value={NotificationType.MESSAGE} className="data-[state=active]:bg-surface data-[state=active]:text-foreground">
              Messages {messageCount > 0 && `(${messageCount})`}
            </TabsTrigger>
            <TabsTrigger value={NotificationType.PEER_REGISTRATION} className="data-[state=active]:bg-surface data-[state=active]:text-foreground">
              Requests {requestCount > 0 && `(${requestCount})`}
            </TabsTrigger>
            <TabsTrigger value={NotificationType.SYSTEM} className="data-[state=active]:bg-surface data-[state=active]:text-foreground">
              System {systemCount > 0 && `(${systemCount})`}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value={activeTab} className="mt-0">
            <ScrollArea className="h-[calc(100vh-180px)]">
              {filteredNotifications.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No notifications to display
                </div>
              ) : (
                <div className="space-y-4 pr-4">
                  {filteredNotifications.map(notification => (
                    <NotificationItem 
                      key={notification.id} 
                      notification={notification} 
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};

export default NotificationCenter;
