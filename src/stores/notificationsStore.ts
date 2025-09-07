import { create } from 'zustand';
import { NotificationItem } from '../utils/types';

type NotifState = {
  items: NotificationItem[];
  add: (userId: string, message: string, type?: string, navigationData?: any) => void;
  addWithFirebaseData: (userId: string, message: string, type: string, navigationData: any, createdAt: number, read: boolean, firebaseId: string) => void;
  markAllRead: (userId: string) => void;
  clear: (userId: string) => void;
};

function uid() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export const useNotifications = create<NotifState>((set, get) => ({
  items: [],
  add: (userId, message, type = 'general', navigationData = null) => set(s => {
    const newNotification = { 
      id: uid(), 
      userId, 
      message, 
      createdAt: Date.now(), 
      read: false,
      type: type as 'cleaning_concern' | 'general' | 'review_request',
      navigationData 
    };
    
    // Filter out old notifications and add new one at the beginning
    const filteredItems = s.items.filter(item => {
      // Remove notifications older than 48 hours
      const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000);
      return item.createdAt > fortyEightHoursAgo;
    });
    
    // Add new notification at the beginning and sort by createdAt descending
    const allItems = [newNotification, ...filteredItems];
    allItems.sort((a, b) => b.createdAt - a.createdAt);
    
    return { items: allItems };
  }),
  addWithFirebaseData: (userId, message, type, navigationData, createdAt, read, firebaseId) => set(s => {
    const newNotification = { 
      id: firebaseId, // Use Firebase document ID
      userId, 
      message, 
      createdAt, // Use Firebase timestamp
      read,
      type: type as 'cleaning_concern' | 'general' | 'review_request',
      navigationData 
    };
    
    // Add notification to the list (Firebase already handles filtering and sorting)
    const allItems = [...s.items, newNotification];
    allItems.sort((a, b) => b.createdAt - a.createdAt);
    
    return { items: allItems };
  }),
  markAllRead: (userId) => set(s => ({ items: s.items.map(i => i.userId === userId ? { ...i, read: true } : i) })),
  clear: (userId) => set(s => ({ items: s.items.filter(i => i.userId !== userId) })),
}));
