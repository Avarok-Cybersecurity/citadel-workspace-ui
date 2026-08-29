/**
 * Room MDX Templates
 *
 * Pre-defined MDX content templates for room types.
 */

import { TemplateCategory, RoomType , type MdxTemplate } from './types';

export const meetingRoomTemplate: MdxTemplate = {
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

export const projectsRoomTemplate: MdxTemplate = {
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

export const documentationRoomTemplate: MdxTemplate = {
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

export const trainingRoomTemplate: MdxTemplate = {
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

export const roomTemplates: MdxTemplate[] = [
  meetingRoomTemplate,
  projectsRoomTemplate,
  documentationRoomTemplate,
  trainingRoomTemplate,
];
