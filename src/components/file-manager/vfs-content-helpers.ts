import {
  Monitor,
  Cloud,
  Upload,
  Download,
  FileText,
  FileImage,
  FileCode,
} from "lucide-react";
import type { RevfsNode } from "@/types/revfs-types";
import { RevfsFileState } from "@/types/revfs-types";

export type SortField = 'name' | 'date' | 'size' | 'type';
export type SortDirection = 'asc' | 'desc';

export function findNodeByPath(tree: RevfsNode, path: string): RevfsNode | null {
  if (tree.path === path) return tree;
  for (const child of tree.children ?? []) {
    const found = findNodeByPath(child, path);
    if (found) return found;
  }
  return null;
}

export function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'];
  const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'css', 'html', 'json', 'yaml', 'yml', 'toml'];
  if (imageExts.includes(ext)) return FileImage;
  if (codeExts.includes(ext)) return FileCode;
  return FileText;
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export const stateConfig: Record<RevfsFileState, { icon: typeof Monitor; color: string; title: string }> = {
  [RevfsFileState.Hosted]: { icon: Monitor, color: 'text-gray-400', title: 'Hosted (stored for peer)' },
  [RevfsFileState.Remote]: { icon: Cloud, color: 'text-primary-accent', title: 'Remote (downloadable)' },
  [RevfsFileState.Sent]: { icon: Upload, color: 'text-success', title: 'Sent' },
  [RevfsFileState.Received]: { icon: Download, color: 'text-primary-accent', title: 'Received' },
  [RevfsFileState.ServerStored]: { icon: Cloud, color: 'text-muted-foreground', title: 'Server stored (downloadable)' },
};
