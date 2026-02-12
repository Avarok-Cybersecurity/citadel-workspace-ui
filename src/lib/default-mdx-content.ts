import { debugLog } from '@/lib/debug-config';
export const getDefaultNodeContent = (nodeName: string) => `# Welcome to ${nodeName} 🏢

Welcome to your new office workspace! This is a **powerful MDX editor** that supports rich content formatting, interactive components, and collaborative editing.

## 🎨 What You Can Do Here

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
| MDX Editor | ✅ Complete | High |
| Real-time Sync | 🚧 In Progress | Medium |
| File Uploads | 📋 Planned | High |

### Blockquotes for Important Notes
> 💡 **Pro Tip**: Click the "Edit" button in the top right to start customizing this content. All changes are automatically saved and synced across your team!

### Task Lists
- [x] Set up office workspace
- [x] Explore MDX editor features
- [ ] Customize this page for your team
- [ ] Invite team members
- [ ] Start collaborating!

## 🚀 Getting Started

1. **Edit This Page**: Click the "Edit" button to modify this content
2. **Use Templates**: Choose from pre-built templates when creating new content
3. **Collaborate**: All changes are synced in real-time with your team
4. **Organize**: Create rooms within this office for different projects or teams

## 📚 Resources

### Markdown Guide
Learn more about [Markdown syntax](https://www.markdownguide.org/) to make the most of this editor.

### Keyboard Shortcuts
- **Bold**: Cmd/Ctrl + B
- **Italic**: Cmd/Ctrl + I
- **Link**: Cmd/Ctrl + K
- **Code**: Cmd/Ctrl + \`

---

*Ready to make this space your own? Click "Edit" to get started!* ✨`;

export const getDefaultChildNodeContent = (nodeName: string, nodeDescription?: string) => `# ${nodeName} 📍

${nodeDescription || 'Welcome to your team room! This is your dedicated space for collaboration and communication.'}

## 🎯 Room Purpose

This room is designed for focused collaboration. Use this space to:
- 💬 Discuss project updates and ideas
- 📋 Share documentation and resources
- 🎯 Track goals and milestones
- 🤝 Coordinate team activities

## 📊 Quick Status

### Current Sprint
\`\`\`markdown
Sprint 2.3 - Feature Development
Start Date: Monday, Jan 15
End Date: Friday, Jan 26
Progress: ████████░░ 80%
\`\`\`

### Team Updates
> **Latest Update**: Team standup notes and action items go here.

### Active Discussions
1. **Architecture Review** - Discussing new microservices approach
2. **UI/UX Improvements** - Gathering feedback on latest designs
3. **Performance Optimization** - Tracking metrics and improvements

## 🛠️ Tools & Resources

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

## 📝 Meeting Notes

### Weekly Sync - [Date]
- **Attendees**: Team members
- **Topics**: Discussion points
- **Action Items**: 
  - [ ] Action item 1
  - [ ] Action item 2

## 🎨 Room Customization Tips

1. **Personalize**: Update this content to match your team's workflow
2. **Organize**: Use headers and sections to structure information
3. **Visualize**: Add tables, lists, and code blocks for clarity
4. **Collaborate**: Everyone can contribute and edit

---

*Start editing to make this room uniquely yours!* 🚀`;

export const getDefaultMDXShowcase = () => `# 🎨 MDX Editor Showcase

Welcome to the MDX editor! This page demonstrates all the powerful features available for creating rich, interactive content.

## 📝 Text Formatting

### Basic Formatting
- **Bold text** using \`**text**\` or \`__text__\`
- *Italic text* using \`*text*\` or \`_text_\`
- ***Bold and italic*** using \`***text***\`
- ~~Strikethrough~~ using \`~~text~~\`
- \`Inline code\` using backticks

### Headings
# H1 - Main Title
## H2 - Section Header
### H3 - Subsection
#### H4 - Sub-subsection

## 📋 Lists

### Ordered Lists
1. First item
2. Second item
   1. Nested item
   2. Another nested item
3. Third item

### Unordered Lists
- Bullet point
- Another point
  - Nested bullet
  - Another nested bullet
- Final point

### Task Lists
- [x] Completed task
- [x] Another completed task
- [ ] Pending task
- [ ] Future task

## 🔗 Links & Images

### Links
- [External link](https://example.com)
- [Link with title](https://example.com "Hover for title")
- Direct URL: https://example.com

### Images
![Placeholder Image](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2U5ZWNlZiIvPgogIDx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM2Yzc1N2QiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiPk1EWCBFZGl0b3I8L3RleHQ+Cjwvc3ZnPg==)

## 💻 Code Blocks

### JavaScript
\`\`\`javascript
// JavaScript example
const greeting = (name) => {
  return \`Hello, \${name}! Welcome to MDX.\`;
};

debugLog('DefaultMdxContent', greeting('Developer'));
\`\`\`

### Python
\`\`\`python
# Python example
def calculate_fibonacci(n):
    if n <= 1:
        return n
    return calculate_fibonacci(n-1) + calculate_fibonacci(n-2)

print(f"Fibonacci of 10: {calculate_fibonacci(10)}")
\`\`\`

### JSON
\`\`\`json
{
  "name": "MDX Editor",
  "version": "1.0.0",
  "features": [
    "Syntax highlighting",
    "Live preview",
    "Auto-save"
  ]
}
\`\`\`

## 📊 Tables

### Simple Table
| Feature | Support | Notes |
|---------|---------|-------|
| Markdown | ✅ Yes | Full support |
| MDX | ✅ Yes | React components |
| LaTeX | 🚧 Partial | Math expressions |

### Aligned Table
| Left Aligned | Center Aligned | Right Aligned |
|:-------------|:--------------:|--------------:|
| Left | Center | Right |
| Text | Text | Text |
| More | More | More |

## 💭 Blockquotes

> This is a simple blockquote.

> **Note**: Blockquotes can contain **formatted text** and even:
> - Lists
> - Multiple paragraphs
> 
> Just keep the > symbol at the start of each line.

### Nested Blockquotes
> Level 1 quote
>> Level 2 nested quote
>>> Level 3 deeply nested quote

## 🎯 Advanced Features

### Horizontal Rules
Three or more hyphens create a horizontal rule:

---

### Definition Lists
Term 1
: Definition for term 1

Term 2
: Definition for term 2
: Can have multiple definitions

### Footnotes
Here's a sentence with a footnote[^1].

[^1]: This is the footnote content.

### Abbreviations
The HTML specification is maintained by the W3C.

*[HTML]: HyperText Markup Language
*[W3C]: World Wide Web Consortium

## 🎨 MDX Components

MDX allows you to use React components directly in your markdown:

\`\`\`jsx
<CustomButton variant="primary">
  Click me!
</CustomButton>

<Alert type="info">
  This is an info alert component.
</Alert>
\`\`\`

## 🚀 Pro Tips

1. **Live Preview**: Your changes are rendered in real-time
2. **Auto-Save**: Content is automatically saved as you type
3. **Keyboard Shortcuts**: Use standard shortcuts for formatting
4. **Templates**: Start with pre-built templates for common use cases
5. **Collaboration**: Changes sync across all team members

---

*Happy writing! Feel free to experiment with all these features.* ✨`;