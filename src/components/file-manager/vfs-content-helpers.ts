import {
  Monitor,
  Cloud,
  Upload,
  Download,
  FileText,
  FileImage,
  FileCode,
} from "lucide-react";
import { RevfsFileState } from "@/types/revfs-types";

export type SortField = 'name' | 'date' | 'size' | 'type';
export type SortDirection = 'asc' | 'desc';

// One implementation, beside its siblings in lib/revfs. There were three.
export { findNodeByPath } from '@/lib/revfs/tree-operations';

export function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'];
  const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'css', 'html', 'json', 'yaml', 'yml', 'toml'];
  if (imageExts.includes(ext)) return FileImage;
  if (codeExts.includes(ext)) return FileCode;
  return FileText;
}

export { formatBytes as formatSize } from '@/lib/format-bytes';

export const stateConfig: Record<RevfsFileState, { icon: typeof Monitor; color: string; title: string }> = {
  [RevfsFileState.Hosted]: { icon: Monitor, color: 'text-muted-foreground', title: 'Hosted (stored for peer)' },
  [RevfsFileState.Remote]: { icon: Cloud, color: 'text-primary-accent', title: 'Remote (downloadable)' },
  [RevfsFileState.Sent]: { icon: Upload, color: 'text-success', title: 'Sent' },
  [RevfsFileState.Received]: { icon: Download, color: 'text-primary-accent', title: 'Received' },
  [RevfsFileState.ServerStored]: { icon: Cloud, color: 'text-muted-foreground', title: 'Server stored (downloadable)' },
};
