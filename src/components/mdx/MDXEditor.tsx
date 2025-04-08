import React, { useState, useRef } from 'react';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link,
  Image,
  Heading1,
  Heading2,
  Heading3,
  Code,
  Quote,
  Undo,
  Redo
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MediaUploader } from './MediaUploader';

interface MDXEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  placeholder?: string;
}

export const MDXEditor: React.FC<MDXEditorProps> = ({
  value,
  onChange,
  height = '400px',
  placeholder = 'Write your content here...'
}) => {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [mediaUploaderOpen, setMediaUploaderOpen] = useState(false);

  // Track selection changes
  const handleSelectionChange = () => {
    if (textAreaRef.current) {
      setSelectionStart(textAreaRef.current.selectionStart);
      setSelectionEnd(textAreaRef.current.selectionEnd);
    }
  };

  // Format helpers
  const formatText = (
    prefix: string,
    suffix: string = prefix,
  ) => {
    if (!textAreaRef.current) return;

    const textarea = textAreaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    
    if (selectedText) {
      const newText = `${value.substring(0, start)}${prefix}${selectedText}${suffix}${value.substring(end)}`;
      onChange(newText);
      
      // Set the selection to after the inserted formatting
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + prefix.length, 
          end + prefix.length
        );
      }, 0);
    } else {
      // If no selection, insert the formatting and place cursor between them
      const newText = `${value.substring(0, start)}${prefix}${suffix}${value.substring(end)}`;
      onChange(newText);
      
      // Position cursor between the format markers
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + prefix.length,
          start + prefix.length
        );
      }, 0);
    }
  };

  // Format handlers
  const handleBold = () => formatText('**');
  const handleItalic = () => formatText('*');
  const handleUnderline = () => formatText('__');
  const handleCode = () => formatText('`');
  const handleCodeBlock = () => formatText('```\n', '\n```');
  const handleBlockquote = () => formatText('> ');
  
  const handleHeading = (level: number) => {
    const prefix = '#'.repeat(level) + ' ';
    if (!textAreaRef.current) return;
    
    const textarea = textAreaRef.current;
    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', start);
    const line = value.substring(lineStart, lineEnd === -1 ? value.length : lineEnd);
    
    // Check if the line already starts with a heading marker
    const existingHeadingMatch = line.match(/^(#{1,6})\s/);
    
    let newText;
    if (existingHeadingMatch) {
      // Replace existing heading
      const existingPrefix = existingHeadingMatch[0];
      newText = value.substring(0, lineStart) + prefix + line.substring(existingPrefix.length) + value.substring(lineEnd === -1 ? value.length : lineEnd);
    } else {
      // Add new heading
      newText = value.substring(0, lineStart) + prefix + line + value.substring(lineEnd === -1 ? value.length : lineEnd);
    }
    
    onChange(newText);
  };
  
  const handleLink = () => {
    const selectedText = value.substring(selectionStart, selectionEnd);
    
    if (selectedText) {
      formatText('[', '](url)');
    } else {
      formatText('[Link text](url)');
    }
  };
  
  const handleImage = () => {
    setMediaUploaderOpen(true);
  };
  
  const handleMediaInsert = (markdownText: string) => {
    if (!textAreaRef.current) return;
    
    const textarea = textAreaRef.current;
    const start = textarea.selectionStart;
    
    const newText = value.substring(0, start) + markdownText + value.substring(start);
    onChange(newText);
    
    // Set cursor position after the inserted image markdown
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + markdownText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };
  
  const handleList = (ordered: boolean = false) => {
    if (!textAreaRef.current) return;
    
    const textarea = textAreaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    if (start === end) {
      // No selection, insert a single list item
      const prefix = ordered ? '1. ' : '- ';
      formatText(prefix);
    } else {
      // Selection spans multiple lines, convert each line to a list item
      const selectedText = value.substring(start, end);
      const lines = selectedText.split('\n');
      
      const formattedLines = lines.map((line, index) => {
        if (line.trim() === '') return line;
        return ordered ? `${index + 1}. ${line}` : `- ${line}`;
      });
      
      const replacement = formattedLines.join('\n');
      const newText = value.substring(0, start) + replacement + value.substring(end);
      onChange(newText);
    }
  };

  return (
    <div className="flex flex-col w-full">
      <TooltipProvider>
        <div className="bg-[#343A5C] p-2 mb-2 rounded-t-md border-b border-gray-700 flex flex-wrap gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleBold}>
                <Bold className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bold</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleItalic}>
                <Italic className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Italic</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleUnderline}>
                <Underline className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Underline</TooltipContent>
          </Tooltip>
          
          <div className="w-px h-6 bg-gray-700 mx-1" />
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => handleHeading(1)}>
                <Heading1 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Heading 1</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => handleHeading(2)}>
                <Heading2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Heading 2</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => handleHeading(3)}>
                <Heading3 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Heading 3</TooltipContent>
          </Tooltip>
          
          <div className="w-px h-6 bg-gray-700 mx-1" />
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => handleList(false)}>
                <List className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bullet List</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => handleList(true)}>
                <ListOrdered className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Numbered List</TooltipContent>
          </Tooltip>
          
          <div className="w-px h-6 bg-gray-700 mx-1" />
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleBlockquote}>
                <Quote className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Blockquote</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleCode}>
                <Code className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Inline Code</TooltipContent>
          </Tooltip>
          
          <div className="w-px h-6 bg-gray-700 mx-1" />
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleLink}>
                <Link className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Link</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleImage}>
                <Image className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Image</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      
      <textarea
        ref={textAreaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full p-4 rounded-b-md border border-gray-800 bg-[#444A6C] text-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-500`}
        style={{ height }}
        placeholder={placeholder}
        onSelect={handleSelectionChange}
      />
      
      <MediaUploader 
        open={mediaUploaderOpen} 
        onClose={() => setMediaUploaderOpen(false)} 
        onMediaInsert={handleMediaInsert}
      />
    </div>
  );
};
