import type { Room } from '@/types/workspace-entities';

export interface BackendRoom {
  id: string;
  office_id?: string;
  parent_id?: string;
  owner_id?: string;
  name: string;
  description?: string;
  members?: Record<string, unknown>;
  mdx_content?: string;
  metadata?: number[];
  chat_enabled?: boolean;
  chat_channel_id?: string;
  isPrivate?: boolean;
  rules?: string;
}

export function convertRoomFromBackend(raw: BackendRoom): Room {
  return {
    id: raw.id,
    officeId: raw.office_id ?? raw.parent_id ?? '',
    ownerId: raw.owner_id ?? '',
    name: raw.name,
    description: raw.description,
    members: raw.members as Room['members'],
    mdx_content: raw.mdx_content,
    chat_enabled: raw.chat_enabled ?? false,
    chat_channel_id: raw.chat_channel_id,
    isPrivate: raw.isPrivate ?? false,
    rules: raw.rules,
    createdAt: 0,
    updatedAt: 0,
  };
}
