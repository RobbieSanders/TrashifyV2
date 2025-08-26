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

// New interface for cleaning jobs
export interface CleaningJob {
  id: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  destination: Coordinates;
  status: 'open' | 'bidding' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'scheduled' | 'pending';
  createdAt: number;
  acceptedAt?: number;
  completedAt?: number;
  cancelledAt?: number;
  cancelledBy?: string;
  cancellationReason?: string;
  startedAt?: number;
  hostId?: string;
  hostFirstName?: string;
  hostLastName?: string;
  cleanerId?: string;
  cleanerFirstName?: string;
  cleanerLastName?: string;
  cleanerLocation?: Coordinates;
  notes?: string;
  
  // Cleaning specific fields
  cleaningType?: 'standard' | 'deep' | 'emergency' | 'checkout';
  estimatedDuration?: number; // in hours
  preferredDate?: number;
  preferredTime?: string;
  
  // Bidding fields
  bids?: CleaningBid[];
  acceptedBidId?: string;
  acceptedBidAmount?: number;
  isEmergency?: boolean;
  
  // Queue management for cleaners
  cleanerPriority?: number; // Priority in cleaner's queue
  estimatedStartTime?: number; // Estimated time when cleaner will start
  
  // iCal/Booking integration fields (from Airbnb iCal feed)
  guestName?: string;           // From SUMMARY field
  checkInDate?: string;          // From DTSTART
  checkOutDate?: string;         // From DTEND
  nightsStayed?: number;         // Calculated from DTEND - DTSTART
  reservationId?: string;        // From UID field
  bookingDescription?: string;   // From DESCRIPTION field
  reservationUrl?: string;       // Parsed from DESCRIPTION field (Airbnb reservation URL)
  phoneLastFour?: string;        // Parsed from DESCRIPTION field (last 4 digits of phone)
  icalEventId?: string;         // Legacy: same as reservationId
  property?: {
    id?: string;
    label?: string;
    address?: string;
    icalUrl?: string;
  };
  
  // Fields that cannot be extracted from iCal
  numberOfGuests?: number;       // Not in iCal, needs manual entry
  adults?: number;               // Not in iCal, needs manual entry
  children?: number;             // Not in iCal, needs manual entry
  infants?: number;              // Not in iCal, needs manual entry
  pets?: boolean;                // Not in iCal, needs manual entry
  
  // Legacy/compatibility fields
  bookingReference?: string;
  previousBookingId?: string;
  nextBookingId?: string;
  propertyId?: string;
  guestCheckin?: string;   // Legacy: same as checkInDate
  guestCheckout?: string;  // Legacy: same as checkOutDate
}

export interface CleaningBid {
  id: string;
  cleanerId: string;
  cleanerName: string;
  amount: number;
  estimatedTime: number; // in hours
  message?: string;
  createdAt: number;
  status?: 'pending' | 'accepted' | 'rejected';
  rating?: number;
  completedJobs?: number;
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
  role?: 'host' | 'worker' | 'cleaner' | 'admin' | 'customer_service' | 'manager_admin' | 'super_admin';
  firstName?: string;
  lastName?: string;
  phone?: string;
  deactivated?: boolean;
  stats?: UserStats;
  
  // Cleaner specific fields
  cleanerProfile?: CleanerProfile;
  
  // Host specific fields - team members
  myTeam?: TeamMember[];
}

export interface TeamMember {
  id: string;
  userId: string;
  name: string;
  role: 'primary_cleaner' | 'secondary_cleaner' | 'trash_service';
  rating?: number;
  completedJobs?: number;
  addedAt: number;
  phoneNumber?: string;
  email?: string;
  lastJobDate?: number;
  status: 'active' | 'inactive';
}

export interface CleanerProfile {
  hourlyRate?: number;
  specialties?: string[];
  servicesOffered?: string[];
  availability?: string[];
  rating?: number;
  totalCleanings?: number;
  bio?: string;
  certifications?: string[];
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
