import { create } from 'zustand';
import { NotificationItem } from '../utils/types';

type NotifState = {
  items: NotificationItem[];
  add: (userId: string, message: string, type?: string, navigationData?: any) => void;
  markAllRead: (userId: string) => void;
  clear: (userId: string) => void;
};

function uid() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export const useNotifications = create<NotifState>((set, get) => ({
  items: [],
  add: (userId, message, type = 'general', navigationData = null) => set(s => ({ 
    items: [{ 
      id: uid(), 
      userId, 
      message, 
      createdAt: Date.now(), 
      read: false,
      type: type as 'cleaning_concern' | 'general',
      navigationData 
    }, ...s.items.filter(item => {
      // Remove notifications older than 48 hours
      const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000);
      return item.createdAt > fortyEightHoursAgo;
    })] 
  })),
  markAllRead: (userId) => set(s => ({ items: s.items.map(i => i.userId === userId ? { ...i, read: true } : i) })),
  clear: (userId) => set(s => ({ items: s.items.filter(i => i.userId !== userId) })),
}));
