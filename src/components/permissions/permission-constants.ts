/** Permission definition for UI display. */
export interface PermissionDefinition {
  id: string;
  label: string;
  description: string;
}

/** Organized permission categories for the PermissionManager UI. */
export const PERMISSION_CATEGORIES: Record<string, PermissionDefinition[]> = {
  Content: [
    { id: 'ViewContent', label: 'View Content', description: 'Can view content in this domain' },
    { id: 'EditContent', label: 'Edit Content', description: 'Can modify content' },
    { id: 'EditMdx', label: 'Edit MDX', description: 'Can edit MDX documents' },
  ],
  Messaging: [
    { id: 'SendMessages', label: 'Send Messages', description: 'Can send messages' },
    { id: 'ReadMessages', label: 'Read Messages', description: 'Can read messages' },
  ],
  Files: [
    { id: 'UploadFiles', label: 'Upload Files', description: 'Can upload files' },
    { id: 'DownloadFiles', label: 'Download Files', description: 'Can download files' },
  ],
  Members: [
    { id: 'AddUsers', label: 'Add Users', description: 'Can add new members' },
    { id: 'RemoveUsers', label: 'Remove Users', description: 'Can remove members' },
    { id: 'BanUser', label: 'Ban Users', description: 'Can ban users from domain' },
  ],
  Management: [
    { id: 'CreateNode', label: 'Create Nodes', description: 'Can create new nodes' },
    { id: 'DeleteNode', label: 'Delete Nodes', description: 'Can delete nodes' },
    { id: 'UpdateNode', label: 'Update Nodes', description: 'Can update node settings' },
  ],
  System: [
    { id: 'ManageDomains', label: 'Manage Domains', description: 'Full domain management' },
    { id: 'ConfigureSystem', label: 'Configure System', description: 'System configuration' },
  ],
};

/** Visual role hierarchy for the role selector dropdown. */
export const ROLE_HIERARCHY = [
  { value: 'Admin', label: 'Administrator', color: 'bg-destructive' },
  { value: 'Owner', label: 'Owner', color: 'bg-warning' },
  { value: 'Member', label: 'Member', color: 'bg-primary-accent' },
  { value: 'Guest', label: 'Guest', color: 'bg-gray-500' },
];

/** Returns the default permission IDs granted to a given role. */
export function getRoleDefaultPermissions(role: string): string[] {
  switch (role) {
    case 'Admin':
      return Object.values(PERMISSION_CATEGORIES).flat().map(p => p.id);
    case 'Owner':
      return [
        'ViewContent', 'EditContent', 'EditMdx',
        'SendMessages', 'ReadMessages',
        'UploadFiles', 'DownloadFiles',
        'AddUsers', 'RemoveUsers',
        'CreateNode', 'DeleteNode', 'UpdateNode',
      ];
    case 'Member':
      return [
        'ViewContent', 'EditContent',
        'SendMessages', 'ReadMessages',
        'UploadFiles', 'DownloadFiles',
      ];
    case 'Guest':
      return ['ViewContent', 'ReadMessages'];
    default:
      return [];
  }
}
