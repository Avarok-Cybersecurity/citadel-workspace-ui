/**
 * Default Node Content Templates
 *
 * Default MDX content for office and room nodes.
 */

export const getDefaultNodeContent = (nodeName: string) => `# Welcome to ${nodeName}

Welcome to your new office workspace! This is a **powerful MDX editor** that supports rich content formatting, interactive components, and collaborative editing.

## What You Can Do Here

### Rich Text Formatting
- **Bold text** for emphasis
- *Italic text* for style
- ~~Strikethrough~~ for corrections
- \`inline code\` for technical terms
- [Links to resources](https://example.com)

### Lists & Organization
1. Numbered lists for sequential items
2. Perfect for step-by-step guides
3. Or prioritized tasks

- Bullet points for general items
- Great for feature lists
- Easy to scan and read

### Code Blocks with Syntax Highlighting
\`\`\`typescript
// Example TypeScript code
interface TeamMember {
  name: string;
  role: string;
  skills: string[];
}

const welcomeNewMember = (member: TeamMember) => {
  debugLog('DefaultMdxContent', \`Welcome \${member.name} to the team!\`);
};
\`\`\`

### Tables for Data
| Feature | Status | Priority |
|---------|--------|----------|
| MDX Editor | Complete | High |
| Real-time Sync | In Progress | Medium |
| File Uploads | Planned | High |

### Blockquotes for Important Notes
> **Pro Tip**: Click the "Edit" button in the top right to start customizing this content. All changes are automatically saved and synced across your team!

### Task Lists
- [x] Set up office workspace
- [x] Explore MDX editor features
- [ ] Customize this page for your team
- [ ] Invite team members
- [ ] Start collaborating!

## Getting Started

1. **Edit This Page**: Click the "Edit" button to modify this content
2. **Use Templates**: Choose from pre-built templates when creating new content
3. **Collaborate**: All changes are synced in real-time with your team
4. **Organize**: Create rooms within this office for different projects or teams

## Resources

### Markdown Guide
Learn more about [Markdown syntax](https://www.markdownguide.org/) to make the most of this editor.

### Keyboard Shortcuts
- **Bold**: Cmd/Ctrl + B
- **Italic**: Cmd/Ctrl + I
- **Link**: Cmd/Ctrl + K
- **Code**: Cmd/Ctrl + \`

---

*Ready to make this space your own? Click "Edit" to get started!*`;

export const getDefaultChildNodeContent = (nodeName: string, nodeDescription?: string) => `# ${nodeName}

${nodeDescription || 'Welcome to your team room! This is your dedicated space for collaboration and communication.'}

## Room Purpose

This room is designed for focused collaboration. Use this space to:
- Discuss project updates and ideas
- Share documentation and resources
- Track goals and milestones
- Coordinate team activities

## Quick Status

### Current Sprint
\`\`\`markdown
Sprint 2.3 - Feature Development
Start Date: Monday, Jan 15
End Date: Friday, Jan 26
Progress: ========.. 80%
\`\`\`

### Team Updates
> **Latest Update**: Team standup notes and action items go here.

### Active Discussions
1. **Architecture Review** - Discussing new microservices approach
2. **UI/UX Improvements** - Gathering feedback on latest designs
3. **Performance Optimization** - Tracking metrics and improvements

## Tools & Resources

### Quick Links
- [Project Board](https://example.com/board)
- [Documentation](https://example.com/docs)
- [Design System](https://example.com/design)

### Code Snippets
Save frequently used code snippets here for easy reference:

\`\`\`bash
# Deploy to staging
npm run build
npm run deploy:staging
\`\`\`

## Meeting Notes

### Weekly Sync - [Date]
- **Attendees**: Team members
- **Topics**: Discussion points
- **Action Items**:
  - [ ] Action item 1
  - [ ] Action item 2

## Room Customization Tips

1. **Personalize**: Update this content to match your team's workflow
2. **Organize**: Use headers and sections to structure information
3. **Visualize**: Add tables, lists, and code blocks for clarity
4. **Collaborate**: Everyone can contribute and edit

---

*Start editing to make this room uniquely yours!*`;
