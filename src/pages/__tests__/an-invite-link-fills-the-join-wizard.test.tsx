/**
 * An invite link (`/?join=1&server=<host>`) opens the join wizard with the
 * server filled in, and leaves no parameters behind to replay on reload.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useJoinLink } from '../use-join-link';

function at(url: string): (p: { children: ReactNode }) => JSX.Element {
  return ({ children }: { children: ReactNode }): JSX.Element => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
}

function run(url: string): { open: ReturnType<typeof vi.fn>; fill: ReturnType<typeof vi.fn>; search: string } {
  const open: ReturnType<typeof vi.fn> = vi.fn();
  const fill: ReturnType<typeof vi.fn> = vi.fn();
  const { result } = renderHook(() => { useJoinLink(open, fill); return useLocation().search; }, { wrapper: at(url) });
  return { open, fill, search: result.current };
}

describe('a join link', () => {
  it('opens the wizard with the named server filled in', () => {
    const { open, fill, search } = run('/?join=1&server=work.example.net%3A12349');
    expect(open).toHaveBeenCalledTimes(1);
    expect(fill).toHaveBeenCalledWith('work.example.net:12349');
    expect(search).toBe('');
  });

  it('opens the wizard empty when it names no server', () => {
    const { open, fill } = run('/?join=1');
    expect(open).toHaveBeenCalledTimes(1);
    expect(fill).not.toHaveBeenCalled();
  });

  it('does nothing without join=1', () => {
    const { open, fill, search } = run('/?server=work.example.net');
    expect(open).not.toHaveBeenCalled();
    expect(fill).not.toHaveBeenCalled();
    expect(search).toBe('?server=work.example.net');
  });
});
