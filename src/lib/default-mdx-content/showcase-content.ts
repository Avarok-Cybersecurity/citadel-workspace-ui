/**
 * MDX Showcase Content
 *
 * Default MDX content that demonstrates all editor features.
 */

export const getDefaultMDXShowcase = (): string => `# MDX Editor Showcase

Welcome to the MDX editor! This page demonstrates all the powerful features available for creating rich, interactive content.

## Text Formatting

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

## Lists

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

## Links & Images

### Links
- [External link](https://example.com)
- [Link with title](https://example.com "Hover for title")
- Direct URL: https://example.com

### Images
![Placeholder Image](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2U5ZWNlZiIvPgogIDx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM2Yzc1N2QiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiPk1EWCBFZGl0b3I8L3RleHQ+Cjwvc3ZnPg==)

## Code Blocks

### JavaScript
\`\`\`javascript
// JavaScript example
const greeting = (name) => {
  return \\\`Hello, \\\${name}! Welcome to MDX.\\\`;
};

console.log(greeting('Developer'));
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

## Tables

### Simple Table
| Feature | Support | Notes |
|---------|---------|-------|
| Markdown | Yes | Full support |
| MDX | Yes | React components |
| LaTeX | Partial | Math expressions |

### Aligned Table
| Left Aligned | Center Aligned | Right Aligned |
|:-------------|:--------------:|--------------:|
| Left | Center | Right |
| Text | Text | Text |
| More | More | More |

## Blockquotes

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

## Advanced Features

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

## MDX Components

MDX allows you to use React components directly in your markdown:

\`\`\`jsx
<CustomButton variant="primary">
  Click me!
</CustomButton>

<Alert type="info">
  This is an info alert component.
</Alert>
\`\`\`

## Pro Tips

1. **Live Preview**: Your changes are rendered in real-time
2. **Auto-Save**: Content is automatically saved as you type
3. **Keyboard Shortcuts**: Use standard shortcuts for formatting
4. **Templates**: Start with pre-built templates for common use cases
5. **Collaboration**: Changes sync across all team members

---

*Happy writing! Feel free to experiment with all these features.*`;
