/**
 * MDX Template Types
 *
 * Type definitions and enums for MDX content templates.
 */

export enum TemplateCategory {
  OFFICE = 'office',
  ROOM = 'room'
}

export enum OfficeType {
  GENERAL = 'general',
  ENGINEERING = 'engineering',
  DESIGN = 'design',
  MARKETING = 'marketing',
  SALES = 'sales',
  HR = 'human_resources',
  FINANCE = 'finance',
  LEGAL = 'legal',
  PRODUCT = 'product',
  SECURITY = 'security'
}

export enum RoomType {
  MEETING = 'meeting',
  PROJECTS = 'projects',
  RESOURCES = 'resources',
  ANNOUNCEMENTS = 'announcements',
  DISCUSSIONS = 'discussions',
  CHAT = 'chat',
  DOCUMENTATION = 'documentation',
  TRAINING = 'training'
}

export interface MdxTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  type: OfficeType | RoomType;
  thumbnail?: string;
  content: string;
}
