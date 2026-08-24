import { createContext, useContext } from 'react';
import type { WorkspaceTheme } from './theme-types';
import { defaultTheme } from './presets';

export interface WorkspaceThemeContextValue {
  /** The theme currently applied to the document. Never null — falls back to the default. */
  theme: WorkspaceTheme;
  /**
   * True while the workspace has said nothing about its theme, so the default is
   * standing in. Lets the editor show "not yet set" rather than implying the
   * workspace chose Avarok Purple.
   */
  isDefault: boolean;
  /**
   * Preview a theme without persisting it, so the editor can update the whole
   * app live as a colour is dragged. Passing null returns to the saved theme.
   */
  previewTheme: (theme: WorkspaceTheme | null) => void;
}

export const WorkspaceThemeContext = createContext<WorkspaceThemeContextValue>({
  theme: defaultTheme(),
  isDefault: true,
  previewTheme: () => {
    // A no-op default rather than a throw: components that read the theme are
    // rendered in tests and stories without the provider, and refusing to render
    // there would be worse than simply not previewing.
  },
});

export function useWorkspaceTheme(): WorkspaceThemeContextValue {
  return useContext(WorkspaceThemeContext);
}
