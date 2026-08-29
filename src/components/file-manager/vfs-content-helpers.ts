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

/**
 * The lucide icon component a file gets from its extension.
 *
 * Named because three files pass it around, and `typeof Monitor` -- naming one
 * arbitrary icon to mean "any of them" -- is what they were each spelling.
 */
export type FileIcon = typeof Monitor;

export function getFileIcon(fileName: string): FileIcon {
  const ext: string = fileName.split('.').pop()?.toLowerCase() ?? '';
  const imageExts: string[] = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'];
  const codeExts: string[] = ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'css', 'html', 'json', 'yaml', 'yml', 'toml'];
  if (imageExts.includes(ext)) return FileImage;
  if (codeExts.includes(ext)) return FileCode;
  return FileText;
}

export { formatBytes as formatSize } from '@/lib/format-bytes';

export interface FileStateStyle {
  icon: FileIcon;
  color: string;
  title: string;
}

export const stateConfig: Record<RevfsFileState, FileStateStyle> = {
  [RevfsFileState.Hosted]: { icon: Monitor, color: 'text-muted-foreground', title: 'Hosted (stored for peer)' },
  [RevfsFileState.Remote]: { icon: Cloud, color: 'text-primary-accent', title: 'Remote (downloadable)' },
  [RevfsFileState.Sent]: { icon: Upload, color: 'text-success-emphasis', title: 'Sent' },
  [RevfsFileState.Received]: { icon: Download, color: 'text-primary-accent', title: 'Received' },
  [RevfsFileState.ServerStored]: { icon: Cloud, color: 'text-muted-foreground', title: 'Server stored (downloadable)' },
};
