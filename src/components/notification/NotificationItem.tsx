import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { MessageSquare, Users, Bell } from 'lucide-react';
import { 
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import NotificationService, { 
  Notification, 
  NotificationType 
} from '@/lib/notification-service';

interface NotificationItemProps {
  notification: Notification;
}

const NotificationItem = ({ notification }: NotificationItemProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();
  const notificationService = NotificationService.getInstance();
  
  // Mark as read when rendered
  if (!notification.read) {
    notificationService.markAsRead(notification.id);
  }
  
  const handleDismiss = () => {
    notificationService.removeNotification(notification.id);
  };
  
  // Format the timestamp
  const formattedTime = formatDistanceToNow(notification.timestamp, { addSuffix: true });
  const exactTime = format(notification.timestamp, 'PPpp');
  
  // Get the appropriate icon based on notification type
  const getNotificationIcon = () => {
    switch (notification.type) {
      case NotificationType.MESSAGE:
        return <MessageSquare className="h-4 w-4" />;
      case NotificationType.PEER_REGISTRATION:
        return <Users className="h-4 w-4" />;
      case NotificationType.SYSTEM:
        return <Bell className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };
  
  // Get border color based on priority
  const getBorderColor = () => {
    switch (notification.priority) {
      case 'high':
        return 'border-red-500';
      case 'normal':
        return 'border-blue-500';
      case 'low':
        return 'border-gray-500';
      default:
        return 'border-gray-500';
    }
  };
  
  // Handle card click (for PEER_REGISTRATION cards, opens the modal)
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking buttons or the dismiss X
    if ((e.target as HTMLElement).closest('button')) return;

    // Call onCardClick if provided in data
    if (notification.data?.onCardClick) {
      notification.data.onCardClick();
    }
  };

  const isClickable = notification.type === NotificationType.PEER_REGISTRATION && notification.data?.onCardClick;

  return (
    <Card
      onClick={handleCardClick}
      className={`bg-[#262C4A] border-l-4 ${getBorderColor()}
        hover:bg-[#2E355A] transition-colors duration-200
        ${notification.read ? 'opacity-80' : 'opacity-100'}
        ${isClickable ? 'cursor-pointer' : ''}`}
    >
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-[#232536] p-1 rounded-full">
              {getNotificationIcon()}
            </div>
            <CardTitle className="text-sm font-medium text-white">
              {notification.title}
            </CardTitle>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            className="h-6 w-6 text-gray-400 hover:text-white"
            onClick={handleDismiss}
          >
            <span className="sr-only">Dismiss</span>
            <span aria-hidden="true">&times;</span>
          </Button>
        </div>
        <CardDescription 
          className="text-xs text-gray-400"
          title={exactTime}
        >
          {formattedTime}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="px-4 py-2">
        <div className="flex items-start space-x-3">
          {notification.senderId && (
            <Avatar className="h-8 w-8">
              <AvatarImage src="" />
              <AvatarFallback className="bg-[#444A6C] text-white text-xs">
                {String(notification.senderId).substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          
          <div className="flex-1">
            <p className={`text-sm ${isExpanded ? '' : 'line-clamp-2'}`}>
              {notification.content}
            </p>
            
            {notification.content.length > 100 && (
              <Button 
                variant="link" 
                size="sm"
                className="p-0 h-auto text-xs mt-1 text-purple-300"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
      
      {notification.actionButtons && notification.actionButtons.length > 0 && (
        <CardFooter className="px-4 py-2 flex justify-end space-x-2">
          {notification.actionButtons.map(action => (
            <Button
              key={action.id}
              variant={action.variant || 'default'}
              size="sm"
              onClick={() => {
                action.onClick();
                handleDismiss();
              }}
            >
              {action.label}
            </Button>
          ))}
        </CardFooter>
      )}
    </Card>
  );
};

export default NotificationItem;
