import { lazy, Suspense, useState } from "react";

type SettingsModalComponent = typeof import("@/components/SettingsModal").SettingsModal;

// Loaded when Settings is first opened: every settings tab comes with it, and a
// landing visit that never opens it should not download them before rendering
// (scripts/check-bundle-budget.mjs).
const SettingsModal: React.LazyExoticComponent<SettingsModalComponent> = lazy(
  (): Promise<{ default: SettingsModalComponent }> =>
    import("@/components/SettingsModal").then((m: typeof import("@/components/SettingsModal")) => ({ default: m.SettingsModal })),
);

interface LazySettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** SettingsModal, fetched on the first open and kept mounted after it so closing keeps its exit animation. */
export function LazySettingsModal({ open, onOpenChange }: LazySettingsModalProps): JSX.Element | null {
  const [everOpened, setEverOpened] = useState<boolean>(open);
  if (open && !everOpened) setEverOpened(true);
  if (!everOpened) return null;
  return (
    <Suspense fallback={null}>
      <SettingsModal open={open} onOpenChange={onOpenChange} />
    </Suspense>
  );
}
