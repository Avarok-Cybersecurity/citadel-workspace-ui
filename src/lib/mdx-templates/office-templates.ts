/**
 * Office MDX Templates
 *
 * Pre-defined MDX content templates for office types.
 */

import type { MdxTemplate } from './types';
import { TemplateCategory, OfficeType } from './types';

export const generalOfficeTemplate: MdxTemplate = {
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

export const engineeringOfficeTemplate: MdxTemplate = {
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

export const designOfficeTemplate: MdxTemplate = {
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

export const securityOfficeTemplate: MdxTemplate = {
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

export const officeTemplates: MdxTemplate[] = [
  generalOfficeTemplate,
  engineeringOfficeTemplate,
  designOfficeTemplate,
  securityOfficeTemplate,
];
