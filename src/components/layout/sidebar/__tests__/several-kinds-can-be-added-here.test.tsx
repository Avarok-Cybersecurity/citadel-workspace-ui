/**
 * Where more than one level may go, the sidebar asks which to add.
 *
 * It took the first allowed level without asking, so in a hierarchy where an Office holds Rooms
 * and Desks, no Desk could ever be created from the sidebar.
 *
 * No mocks: the picker renders its levels by their schema labels.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { setTreeSchema } from '@/lib/entity-type-registry';
import type { TreeSchema } from '@/components/layout/sidebar/tree-node-types';
import { CreateChildTypePicker } from '../CreateChildTypePicker';

const cfg = (type_name: string, label: string): TreeSchema['entity_type_configs'][number] => ({
  type_name, icon: 'folder', label, plural_label: `${label}s`, name_placeholder: '', description_placeholder: '', chat_default: true,
});

describe('the what-to-add picker', () => {
  it('offers each allowed level by its label and adds the one chosen', () => {
    setTreeSchema({ id: 's', name: 's', max_depth: 2, rules: [], entity_type_configs: [cfg('Workspace', 'Workspace'), cfg('Room', 'Room'), cfg('Desk', 'Hot desk')] });
    const onPick: ReturnType<typeof vi.fn> = vi.fn();
    render(<CreateChildTypePicker choice={{ parentId: 'o1', levels: ['Room', 'Desk'] }} onPick={onPick} onClose={vi.fn()} />);
    expect(screen.getByTestId('create-type-Desk').textContent).toContain('Hot desk');
    fireEvent.click(screen.getByTestId('create-type-Desk'));
    expect(onPick).toHaveBeenCalledWith('o1', 'Desk');
  });
});
