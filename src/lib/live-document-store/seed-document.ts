import * as Y from 'yjs';

/**
 * Build the Y.Doc a new live document should START from, given the text the
 * user had already typed.
 *
 * The "turn this message into a document" flow passed that text all the way to
 * the last function and dropped it there — the parameter was underscore-ignored
 * and `createDocument` was called with no initial doc — while the compose box
 * was cleared regardless. The document opened empty and the typed work was gone,
 * on every use, whether or not anything failed.
 *
 * The shape is not arbitrary. TipTap's Collaboration extension binds to
 * `getXmlFragment('default')` and expects ProseMirror's document model, so a
 * plain `Y.Text` insert would round-trip through persistence and still render
 * as an empty page — the same silent loss with more steps. Paragraphs are
 * therefore built as `XmlElement('paragraph')` nodes, which is how
 * y-prosemirror represents them.
 */
export function seedDocument(initialContent: string): Y.Doc {
  const doc: Y.Doc = new Y.Doc();
  const fragment: ReturnType<typeof doc.getXmlFragment> = doc.getXmlFragment('default');

  // Blank lines are preserved as empty paragraphs; a document that silently
  // reflows the user's text is a smaller version of the same complaint.
  const paragraphs: Y.XmlElement[] = initialContent.split('\n').map((line: string) => {
    const element: Y.XmlElement = new Y.XmlElement('paragraph');
    if (line.length > 0) element.insert(0, [new Y.XmlText(line)]);
    return element;
  });

  fragment.insert(0, paragraphs);
  return doc;
}

/** The text a seeded document holds, used to verify a seed round-trips. */
export function readSeededText(doc: Y.Doc): string {
  return doc
    .getXmlFragment('default')
    .toArray()
    .map((node) => (node instanceof Y.XmlElement ? node.toString() : String(node)))
    .join('\n');
}
