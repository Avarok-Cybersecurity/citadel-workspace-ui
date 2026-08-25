import React, { useState, useRef } from 'react';
import { MediaUploader } from './MediaUploader';
import { MDXToolbar } from './MDXToolbar';

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

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + prefix.length,
          end + prefix.length
        );
      }, 0);
    } else {
      const newText = `${value.substring(0, start)}${prefix}${suffix}${value.substring(end)}`;
      onChange(newText);

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
  const handleBlockquote = () => formatText('> ');

  const handleHeading = (level: number) => {
    const prefix = '#'.repeat(level) + ' ';
    if (!textAreaRef.current) return;

    const textarea = textAreaRef.current;
    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', start);
    const line = value.substring(lineStart, lineEnd === -1 ? value.length : lineEnd);

    const existingHeadingMatch = line.match(/^(#{1,6})\s/);

    let newText;
    if (existingHeadingMatch) {
      const existingPrefix = existingHeadingMatch[0];
      newText = value.substring(0, lineStart) + prefix + line.substring(existingPrefix.length) + value.substring(lineEnd === -1 ? value.length : lineEnd);
    } else {
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
      const prefix = ordered ? '1. ' : '- ';
      formatText(prefix);
    } else {
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
      <MDXToolbar
        onBold={handleBold}
        onItalic={handleItalic}
        onUnderline={handleUnderline}
        onHeading={handleHeading}
        onList={handleList}
        onBlockquote={handleBlockquote}
        onCode={handleCode}
        onLink={handleLink}
        onImage={handleImage}
      />

      <textarea
        ref={textAreaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full p-4 rounded-b-md border border-gray-800 bg-card text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring`}
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
