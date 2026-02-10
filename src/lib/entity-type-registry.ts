/**
 * Entity Type Registry — SSOT for hierarchy node display metadata.
 *
 * Consolidates icon, label, and placeholder mappings that were previously
 * scattered across TreeNodesSection, tree-graph-types, AdminModal, and
 * PermissionManager into a single authoritative source.
 */

import type { ComponentType } from 'react';
import {
  Building2,
  Briefcase,
  MessageSquare,
  Folder,
  Users,
  FolderKanban,
  Layers,
} from 'lucide-react';

// Re-export the canonical NodeEntityType from TreeNodesSection
// (mirrors citadel-workspace-types/src/lib.rs)
export type NodeEntityType = "Workspace" | { Child: string };

export interface EntityTypeMetadata {
  icon: ComponentType<{ className?: string }>;
  label: string;
  pluralLabel: string;
  namePlaceholder: string;
  descriptionPlaceholder: string;
}

const REGISTRY: Record<string, EntityTypeMetadata> = {
  Workspace: {
    icon: Building2,
    label: 'Workspace',
    pluralLabel: 'Workspaces',
    namePlaceholder: 'e.g., Avarok Cybersecurity',
    descriptionPlaceholder: 'Describe the purpose of this workspace...',
  },
  Office: {
    icon: Briefcase,
    label: 'Office',
    pluralLabel: 'Offices',
    namePlaceholder: 'e.g., Engineering, Marketing, HR',
    descriptionPlaceholder: 'Describe the purpose of this office...',
  },
  Room: {
    icon: MessageSquare,
    label: 'Room',
    pluralLabel: 'Rooms',
    namePlaceholder: 'e.g., General, Design Reviews, Standups',
    descriptionPlaceholder: 'Describe the purpose of this room...',
  },
  Department: {
    icon: Users,
    label: 'Department',
    pluralLabel: 'Departments',
    namePlaceholder: 'e.g., R&D, Sales, Operations',
    descriptionPlaceholder: 'Describe this department...',
  },
  Team: {
    icon: Users,
    label: 'Team',
    pluralLabel: 'Teams',
    namePlaceholder: 'e.g., Frontend, Backend, DevOps',
    descriptionPlaceholder: 'Describe this team...',
  },
  Project: {
    icon: FolderKanban,
    label: 'Project',
    pluralLabel: 'Projects',
    namePlaceholder: 'e.g., Q1 Release, Migration',
    descriptionPlaceholder: 'Describe this project...',
  },
  Channel: {
    icon: Layers,
    label: 'Channel',
    pluralLabel: 'Channels',
    namePlaceholder: 'e.g., announcements, random',
    descriptionPlaceholder: 'Describe this channel...',
  },
};

/** Extract the string name from a NodeEntityType. */
export function getEntityTypeString(entityType: NodeEntityType): string {
  if (entityType === 'Workspace') return 'Workspace';
  if (typeof entityType === 'object' && 'Child' in entityType) {
    return entityType.Child;
  }
  return 'Node';
}

/** Get display metadata for an entity type. Unknown types receive sensible defaults. */
export function getEntityMetadata(entityType: NodeEntityType | string): EntityTypeMetadata {
  const key = typeof entityType === 'string'
    ? entityType
    : getEntityTypeString(entityType);

  if (key in REGISTRY) {
    return REGISTRY[key];
  }

  // Fallback for unknown entity types — derive from the type name
  return {
    icon: Folder,
    label: key,
    pluralLabel: `${key}s`,
    namePlaceholder: `Enter ${key.toLowerCase()} name...`,
    descriptionPlaceholder: `Describe this ${key.toLowerCase()}...`,
  };
}

/** Get just the icon component for an entity type. */
export function getEntityIcon(entityType: NodeEntityType | string): ComponentType<{ className?: string }> {
  return getEntityMetadata(entityType).icon;
}
