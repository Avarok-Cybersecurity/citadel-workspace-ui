/**
 * DocumentHost's contract: the node and app it was given, the title, the region an editor
 * mounts in, and a read-only notice when editing is not permitted. No mocks: props in, DOM out.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentHost, UnreadableDocument, type DocumentHostProps } from '../DocumentHost';

const EDITABLE: DocumentHostProps = { nodeId: 'plan-1', appId: 'docs', title: 'Quarterly plan', permissions: { edit: { enabled: true, reason: null } } };

describe('DocumentHost', () => {
  it('shows the document title and its app, and marks the editor region', () => {
    render(<DocumentHost {...EDITABLE} />);
    const host: HTMLElement = screen.getByTestId('document-host');
    expect(host).toHaveAttribute('data-node-id', 'plan-1');
    expect(host).toHaveAttribute('data-app', 'docs');
    expect(screen.getByRole('heading', { name: 'Quarterly plan' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Citadel Docs editor' })).toHaveTextContent('Citadel Docs editor loads here');
    expect(screen.queryByTestId('document-read-only')).toBeNull();
  });

  it('says it is read only, and why, when editing is not permitted', () => {
    render(<DocumentHost {...EDITABLE} permissions={{ edit: { enabled: false, reason: "You don't have permission to edit this content" } }} />);
    expect(screen.getByTestId('document-read-only')).toHaveTextContent("Read only. You don't have permission to edit this content");
  });

  it('names an app it cannot read without opening anything', () => {
    render(<UnreadableDocument title="From the future" reason="The document's app record is version 2." />);
    expect(screen.getByRole('alert')).toHaveTextContent('version 2');
    expect(screen.queryByTestId('document-editor-region')).toBeNull();
  });
});
