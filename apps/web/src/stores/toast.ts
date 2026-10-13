import { create } from 'zustand';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
  tone?: 'default' | 'danger';
  /** ms before it disappears on its own (5 s; 8 s when it offers an action such as Undo). */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;
const MAX_TOASTS = 3;

/** Transient confirmations ("Link copied", "APP-142 deleted · Undo"); UI state only. */
export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  show: (toast) => {
    const id = nextId++;
    set((s) => ({
      toasts: [...s.toasts, { duration: toast.action ? 8000 : 5000, ...toast, id }].slice(
        -MAX_TOASTS,
      ),
    }));
    return id;
  },
  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Shows a toast from anywhere (event handlers, mutation callbacks). */
export const toast = (t: Parameters<ToastState['show']>[0]) => useToastStore.getState().show(t);
