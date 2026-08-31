import { create } from 'zustand';

/**
 * Toasts carry the undo affordance required by F-04 ("auto-move to Completed
 * with an undo toast"). Copy rule from §10: a button that says Save produces a
 * toast that says Saved. No filler.
 */

export type ToastTone = 'neutral' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  /** Label plus handler renders an inline action, usually Undo. */
  action?: { label: string; onPress: () => void };
  durationMs: number;
}

interface ToastState {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

/** Undo needs longer than a plain acknowledgement to stay reachable. */
const ACTION_DURATION_MS = 6000;
const DEFAULT_DURATION_MS = 2600;

let counter = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: ({ message, tone = 'neutral', action, durationMs }) => {
    counter += 1;
    const id = `toast-${counter}`;
    const duration = durationMs ?? (action ? ACTION_DURATION_MS : DEFAULT_DURATION_MS);

    set({
      toasts: [
        ...get().toasts.filter((toast) => toast.message !== message),
        { id, message, tone, action, durationMs: duration },
      ],
    });

    setTimeout(() => get().dismiss(id), duration);
    return id;
  },

  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),

  clear: () => set({ toasts: [] }),
}));

export const toast = {
  show: (message: string, tone: ToastTone = 'neutral') =>
    useToastStore.getState().show({ message, tone }),
  success: (message: string) => useToastStore.getState().show({ message, tone: 'success' }),
  error: (message: string) => useToastStore.getState().show({ message, tone: 'error' }),
  undo: (message: string, onUndo: () => void, tone: ToastTone = 'success') =>
    useToastStore.getState().show({ message, tone, action: { label: 'Undo', onPress: onUndo } }),
};
