/**
 * The apps requests bound to this tab's workspace session: the one I/O boundary the marketplace
 * and the zone placeholder take, so their tests substitute a contract fake of the kernel.
 */
import WorkspaceService from '@/lib/workspace-service';
import { protocolAppsTransport, type AppsTransport } from '@/lib/workspace-service/apps-operations';

export const sessionAppsTransport: AppsTransport = protocolAppsTransport(WorkspaceService);
