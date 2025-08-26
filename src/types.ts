export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Job {
  id: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  destination: Coordinates;
  status: 'open' | 'pending_approval' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: number;
  acceptedAt?: number;
  approvedAt?: number;
  completedAt?: number;
  cancelledAt?: number;
  cancelledBy?: string;
  cancellationReason?: string;
  startLocation?: Coordinates;
  workerLocation?: Coordinates;
  progress?: number;
  hostId?: string;
  hostFirstName?: string;
  hostLastName?: string;
  workerId?: string;
  workerFirstName?: string;
  workerLastName?: string;
  notes?: string;
  needsApproval?: boolean;
  
  // Multi-job priority fields
  workerPriority?: number; // Priority in worker's queue (1 = first, 2 = second, etc.)
  estimatedStartTime?: number; // Estimated time when worker will start this job
  
  // Recurring pickup fields
  isRecurring?: boolean;
  recurringSchedule?: RecurringSchedule;
  parentJobId?: string; // For recurring jobs, reference to the parent
  nextScheduledDate?: number;
}

export interface RecurringSchedule {
  id: string;
  daysOfWeek: number[]; // 0 = Sunday, 1 = Monday, etc.
  startDate: number;
  endDate?: number; // Optional end date for recurring pickups
  active: boolean;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  skipDates?: number[]; // Dates to skip
}

export interface User {
  uid: string;
  email?: string;
  role?: 'host' | 'worker' | 'admin' | 'customer_service' | 'manager_admin' | 'super_admin';
  firstName?: string;
  lastName?: string;
  phone?: string;
  deactivated?: boolean;
  stats?: UserStats;
}

export interface UserStats {
  totalJobs?: number;
  completedJobs?: number;
  cancelledJobs?: number;
  acceptanceRate?: number;
  averageCompletionTime?: number;
  rating?: number;
  lastActiveDate?: number;
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  performedBy: string;
  performedByName?: string;
  timestamp: number;
  details?: string;
  changes?: Record<string, any>;
}
