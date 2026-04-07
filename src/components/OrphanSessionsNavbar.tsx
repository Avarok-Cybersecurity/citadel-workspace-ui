import { useEffect } from "react";
import { OrphanSessionIcon } from "./OrphanSessionIcon";
import { DisconnectConfirmModal } from "./DisconnectConfirmModal";
import { DisconnectLoadingModal } from "./LoadingModal";
import { notificationService } from "@/lib/notification-service";
import { useOrphanSessions } from "./useOrphanSessions";

export const OrphanSessionsNavbar = () => {
  const {
    sessions,
    disconnectTarget,
    setDisconnectTarget,
    glowingSessionCid,
    notificationCounts,
    loadingModal,
    loadActiveSessions,
    handleNavigate,
    handleDisconnect,
    handleConfirmDisconnect,
    handleLoadingComplete,
  } = useOrphanSessions();

  // Initial load of sessions and notification counts
  useEffect(() => {
    loadActiveSessions().catch(() => {});
  }, [loadActiveSessions]);

  if (sessions.length === 0) {
    return null;
  }

  return (
    <>
      <div
        className="fixed top-0 left-0 right-0 z-50 bg-[#1C1D28]/95 backdrop-blur-sm border-b border-[#2D3548]"
        data-testid="previous-sessions-navbar"
      >
        <div className="container mx-auto px-6 py-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[10px] font-semibold tracking-wider uppercase text-gray-500 flex-shrink-0">
              Active Sessions
            </span>
            <div className="w-px h-4 bg-[#2D3548] flex-shrink-0" />
            <div
              className="flex items-center gap-2 overflow-x-auto scrollbar-none"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              data-testid="sessions-scroll-container"
            >
              {sessions.map((session) => (
                <OrphanSessionIcon
                  key={session.cid?.toString()}
                  session={session}
                  workspaceName={session.workspaceName}
                  onNavigate={() => handleNavigate(session)}
                  onDisconnect={() => handleDisconnect(session)}
                  shouldGlow={glowingSessionCid === session.cid}
                  unreadCount={notificationCounts.get(session.cid?.toString() ?? '') || 0}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <DisconnectConfirmModal
        open={disconnectTarget !== null}
        onOpenChange={(open) => !open && setDisconnectTarget(null)}
        session={disconnectTarget?.session || null}
        workspaceName={disconnectTarget?.workspaceName || null}
        onConfirm={handleConfirmDisconnect}
      />

      <DisconnectLoadingModal
        open={loadingModal.open}
        status={loadingModal.status}
        workspaceName={loadingModal.workspaceName}
        errorMessage={loadingModal.errorMessage}
        onComplete={handleLoadingComplete}
      />
    </>
  );
};
