import { Download } from 'lucide-react';
import { usePwaInstall } from './usePwaInstall';
import { useToast } from '@/hooks/use-toast';

/**
 * In-app install affordance.
 *
 * Chrome puts an install icon in the omnibox once the app qualifies, but that is
 * easy to miss and not present on every platform, so the app offers it too.
 * Renders nothing at all when installing is impossible or pointless — the
 * browser has not offered a prompt, or we are already running installed — rather
 * than showing a button that does nothing.
 */
export function InstallAppButton({ className }: { className?: string }) {
  const { canInstall, install } = usePwaInstall();
  const { toast } = useToast();

  if (!canInstall) return null;

  const handleInstall = () => {
    void (async () => {
      const accepted = await install();
      if (accepted) {
        toast({
          title: 'Citadel installed',
          description: 'You can now launch it like any other app.',
          variant: 'success',
        });
      }
    })();
  };

  return (
    <button
      type="button"
      onClick={handleInstall}
      title="Install Citadel as an app"
      className={
        className ??
        'inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
      }
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      Install app
    </button>
  );
}
