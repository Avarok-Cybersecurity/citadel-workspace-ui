/**
 * Toasts.
 *
 * The app previously mounted TWO toast systems at once — shadcn's `<Toaster />`
 * (backed by a hand-rolled reducer in this file) and `<Sonner />` — so which
 * visual style a notification got depended on which feature raised it: 33 files
 * used `useToast()`, while the file manager imported `toast` from `sonner`
 * directly. Same product, two different-looking notifications.
 *
 * This module now keeps the `useToast()` / `toast({ title, description })` call
 * shape those 33 files already use, but renders through Sonner. One system, no
 * call-site churn, and the shadcn toast/toaster components are gone.
 */

import type React from 'react';
import { toast as sonnerToast } from 'sonner';

/**
 * `destructive` is the shadcn name the existing call sites pass; it is kept so
 * they need no edit. `outline` was used once and has no error semantics, so it
 * renders neutral.
 */
export type ToastVariant = 'default' | 'success' | 'destructive' | 'outline';

export interface ToastOptions {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Omit for Sonner's default. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

export interface ToastHandle {
  id: string | number;
  dismiss: () => void;
}

/**
 * Sonner's first argument is the headline. Call sites overwhelmingly pass
 * `title` + `description`, but a few pass only one of them — falling back keeps
 * a toast with just a description from rendering as an empty bubble.
 */
function headline(options: ToastOptions): React.ReactNode {
  return options.title ?? options.description ?? '';
}

function body(options: ToastOptions): React.ReactNode | undefined {
  return options.title ? options.description : undefined;
}

export function toast(options: ToastOptions): ToastHandle {
  const payload = {
    description: body(options),
    duration: options.duration,
    action: options.action,
  };

  const message = headline(options);

  const id =
    options.variant === 'destructive'
      ? sonnerToast.error(message, payload)
      : options.variant === 'success'
        ? sonnerToast.success(message, payload)
        : sonnerToast(message, payload);

  return { id, dismiss: () => sonnerToast.dismiss(id) };
}

/**
 * Kept as a hook so the 33 existing `const { toast } = useToast()` call sites are
 * unchanged. There is no per-component state any more — `toast` is a stable
 * module-level function — so this deliberately returns the same object shape
 * rather than something memoised per render.
 */
export function useToast(): {
  toast: typeof toast;
  dismiss: (id?: string | number) => void;
} {
  return { toast, dismiss: sonnerToast.dismiss };
}
