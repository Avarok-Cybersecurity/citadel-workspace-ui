/**
 * Pre-defined MDX content templates for different office and room types
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

// Office Templates
const generalOfficeTemplate: MdxTemplate = {
  id: 'office-general',
  name: 'General Office',
  description: 'A standard office space for general team collaboration',
  category: TemplateCategory.OFFICE,
  type: OfficeType.GENERAL,
  content: `# Welcome to the ${OfficeType.GENERAL} Office

## About This Space

This is a collaborative workspace for our team. Here you'll find resources, announcements, and tools to help with your day-to-day activities.

## Quick Links

- [Company Wiki](#)
- [Team Calendar](#)
- [Resource Library](#)

## Recent Announcements

<Announcements count={3} />

## Team Members

<TeamMembers office="general" />

## Resources

<ResourceList tags={["general", "company"]} />
`
};

const engineeringOfficeTemplate: MdxTemplate = {
  id: 'office-engineering',
  name: 'Engineering Office',
  description: 'A workspace tailored for engineering teams with technical resources',
  category: TemplateCategory.OFFICE,
  type: OfficeType.ENGINEERING,
  content: `# Welcome to the Engineering Office

## Development Resources

<ResourceList tags={["engineering", "development"]} />

## Current Sprint

<SprintBoard />

## Technical Documentation

<DocumentationList category="technical" />

## Engineering Team

<TeamMembers office="engineering" />

## CI/CD Status

<CicdStatus />

## Code Quality Metrics

<CodeQualityDashboard />
`
};

const designOfficeTemplate: MdxTemplate = {
  id: 'office-design',
  name: 'Design Office',
  description: 'A creative space for design teams with visual resources',
  category: TemplateCategory.OFFICE,
  type: OfficeType.DESIGN,
  content: `# Welcome to the Design Studio

## Design Systems

<DesignSystemGallery />

## Recent Projects

<ProjectGallery category="design" />

## Brand Assets

<AssetLibrary category="brand" />

## Design Team

<TeamMembers office="design" />

## Inspiration Wall

<InspirationBoard />

## Tools & Resources

<ResourceList tags={["design", "creative"]} />
`
};

const securityOfficeTemplate: MdxTemplate = {
  id: 'office-security',
  name: 'Security Office',
  description: 'A workspace for cybersecurity professionals',
  category: TemplateCategory.OFFICE,
  type: OfficeType.SECURITY,
  content: `# Cybersecurity Command Center

## Security Dashboard

<SecurityDashboard />

## Threat Intelligence

<ThreatIntelFeed />

## Security Announcements

<Announcements category="security" />

## Incident Response

<IncidentResponseProcedures />

## Security Team

<TeamMembers office="security" />

## Vulnerabilities Tracker

<VulnerabilityTracker />

## Security Resources

<ResourceList tags={["security", "compliance"]} />
`
};

// Room Templates
const meetingRoomTemplate: MdxTemplate = {
  id: 'room-meeting',
  name: 'Meeting Room',
  description: 'A dedicated space for team meetings and discussions',
  category: TemplateCategory.ROOM,
  type: RoomType.MEETING,
  content: `# Team Meeting Room

## Upcoming Meetings

<MeetingSchedule />

## Meeting Notes

<NotesList category="meetings" />

## Action Items

<ActionItemTracker />

## Discussion Topics

<DiscussionBoard />

## Meeting Resources

<ResourceList tags={["meetings", "presentations"]} />

## Video Conferencing

<VideoConferenceSetup />
`
};

const projectsRoomTemplate: MdxTemplate = {
  id: 'room-projects',
  name: 'Projects Room',
  description: 'A room for tracking and collaborating on projects',
  category: TemplateCategory.ROOM,
  type: RoomType.PROJECTS,
  content: `# Projects Hub

## Active Projects

<ProjectBoard filter="active" />

## Project Timeline

<ProjectTimeline />

## Project Resources

<ResourceList tags={["projects", "management"]} />

## Team Assignments

<TeamAssignments />

## Project Documentation

<DocumentationList category="projects" />

## Status Reports

<StatusReportList />
`
};

const documentationRoomTemplate: MdxTemplate = {
  id: 'room-documentation',
  name: 'Documentation Room',
  description: 'A central repository for team and product documentation',
  category: TemplateCategory.ROOM,
  type: RoomType.DOCUMENTATION,
  content: `# Documentation Center

## Getting Started

Welcome to our documentation center. Here you'll find comprehensive guides and documentation to help you get up and running quickly.

## Product Documentation

<DocumentationList category="product" />

## API References

<ApiDocumentation />

## User Guides

<DocumentationList category="user-guides" />

## Internal Processes

<DocumentationList category="internal" />

## Contribute to Docs

<ContributionGuidelines />

## Recently Updated

<DocumentationList sort="recently-updated" limit={5} />
`
};

const trainingRoomTemplate: MdxTemplate = {
  id: 'room-training',
  name: 'Training Room',
  description: 'A space for learning and professional development',
  category: TemplateCategory.ROOM,
  type: RoomType.TRAINING,
  content: `# Training Center

## Learning Paths

<LearningPathList />

## Upcoming Training Sessions

<TrainingSchedule />

## Learning Resources

<ResourceList tags={["training", "learning"]} />

## Knowledge Base

<KnowledgeBase />

## Certifications

<CertificationTracker />

## Training Materials

<TrainingMaterialLibrary />

## Training Feedback

<FeedbackForm id="training-feedback" />
`
};

// Collection of all templates
export const templates: MdxTemplate[] = [
  generalOfficeTemplate,
  engineeringOfficeTemplate,
  designOfficeTemplate,
  securityOfficeTemplate,
  meetingRoomTemplate,
  projectsRoomTemplate,
  documentationRoomTemplate,
  trainingRoomTemplate
];

// Helper functions
export function getTemplatesByCategory(category: TemplateCategory): MdxTemplate[] {
  return templates.filter(template => template.category === category);
}

export function getTemplateById(id: string): MdxTemplate | undefined {
  return templates.find(template => template.id === id);
}

export function getTemplatesByType(category: TemplateCategory, type: OfficeType | RoomType): MdxTemplate | undefined {
  return templates.find(template => template.category === category && template.type === type);
}

export default {
  templates,
  getTemplatesByCategory,
  getTemplateById,
  getTemplatesByType
};
