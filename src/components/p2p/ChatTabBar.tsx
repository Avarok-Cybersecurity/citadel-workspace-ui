import { MessageSquare, FileText, X } from 'lucide-react';

export interface ChatTab {
  id: string;
  type: 'messages' | 'live_document';
  title: string;
  documentId?: string;
  hasUnread?: boolean;  // Notification indicator for unread activity
}

interface ChatTabBarProps {
  tabs: ChatTab[];
  activeTabId: string;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
}

interface TabProps {
  tab: ChatTab;
  active: boolean;
  onSelect: () => void;
  onClose?: () => void;
}

function Tab({ tab, active, onSelect, onClose }: TabProps) {
  const Icon = tab.type === 'messages' ? MessageSquare : FileText;
  const showNotificationDot = tab.hasUnread && !active;

  return (
    <div
      className={`
        group flex items-center gap-1.5 px-3 py-2 cursor-pointer
        border-b-2 transition-all duration-150
        ${active
          ? 'border-[#6E59A5] text-white bg-[#1C1D28]'
          : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
        }
      `}
      onClick={onSelect}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="text-sm font-medium truncate max-w-[120px]">{tab.title}</span>
      {/* Notification dot for unread activity */}
      {showNotificationDot && (
        <span className="notification-dot animate-pulse-green" />
      )}
      {/* Close button for live document tabs */}
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={`
            ml-1 p-0.5 rounded-full opacity-0 group-hover:opacity-100
            hover:bg-white/10 transition-opacity
            ${active ? 'opacity-100' : ''}
          `}
          title="Close tab"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function ChatTabBar({ tabs, activeTabId, onTabSelect, onTabClose }: ChatTabBarProps) {
  return (
    <div className="flex items-center border-b border-[#262C4A]/50 bg-[#1a1b26] overflow-x-auto">
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          onSelect={() => onTabSelect(tab.id)}
          onClose={tab.type === 'live_document' ? () => onTabClose(tab.id) : undefined}
        />
      ))}
    </div>
  );
}

// Default messages tab that should always be present
export const MESSAGES_TAB: ChatTab = {
  id: 'messages',
  type: 'messages',
  title: 'Messages'
};

// Helper to create a live document tab
export function createLiveDocumentTab(documentId: string, title: string): ChatTab {
  return {
    id: `doc-${documentId}`,
    type: 'live_document',
    title,
    documentId
  };
}
