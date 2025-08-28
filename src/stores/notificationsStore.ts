import { create } from 'zustand';

export type NotificationItem = {
  id: string;
  userId: string; // recipient user id
  message: string;
  createdAt: number;
  read?: boolean;
};

type NotifState = {
  items: NotificationItem[];
  add: (userId: string, message: string) => void;
  markAllRead: (userId: string) => void;
  clear: (userId: string) => void;
};

function uid() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export const useNotifications = create<NotifState>((set, get) => ({
  items: [],
  add: (userId, message) => set(s => ({ items: [{ id: uid(), userId, message, createdAt: Date.now(), read: false }, ...s.items] })),
  markAllRead: (userId) => set(s => ({ items: s.items.map(i => i.userId === userId ? { ...i, read: true } : i) })),
  clear: (userId) => set(s => ({ items: s.items.filter(i => i.userId !== userId) })),
}));
