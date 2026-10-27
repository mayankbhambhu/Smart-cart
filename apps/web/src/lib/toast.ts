import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts.slice(-3), { ...toast, id }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), toast.tone === 'error' ? 6000 : 4000);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (title: string, body?: string) => useToasts.getState().push({ tone: 'success', title, body }),
  error: (title: string, body?: string) => useToasts.getState().push({ tone: 'error', title, body }),
  info: (title: string, body?: string) => useToasts.getState().push({ tone: 'info', title, body }),
};
