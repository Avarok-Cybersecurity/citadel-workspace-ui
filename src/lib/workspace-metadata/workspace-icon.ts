/**
 * An uploaded workspace icon, readied for the server: as a data URL, and within its size limit.
 *
 * One rule for both places an icon is chosen (Workspace settings, and /create), matching what the
 * kernel (`workspace_logo.rs`) and the control plane (`control/logo.mjs`) accept, so an icon that
 * would be refused is explained before it is sent.
 */
import { avatarToDataUrl } from '@/lib/image-processor';

/** Decoded size the server accepts. */
export const MAX_ICON_BYTES: number = 32 * 1024;

export type IconResult = { ok: true; dataUrl: string } | { ok: false; reason: string };

const decodedBytes = (base64: string): number => Math.floor((base64.replace(/=+$/, '').length * 3) / 4);

/** `icon` (a data URL, or the bare base64 the uploader emits) as the server will take it. */
export function readyIcon(icon: string): IconResult {
  const dataUrl: string = avatarToDataUrl(icon);
  return decodedBytes(dataUrl.slice(dataUrl.indexOf(',') + 1)) > MAX_ICON_BYTES
    ? { ok: false, reason: `That icon is larger than ${MAX_ICON_BYTES / 1024} KB after resizing. Try a simpler image.` }
    : { ok: true, dataUrl };
}
