export interface Coordinates {
  latitude: number;
  longitude: number;
}

// Regular trash pickup jobs for workers
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

// Cleaning jobs - actual cleaning work to be done (no bidding on these)
export interface CleaningJob {
  id: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  destination: Coordinates;
  status: 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'scheduled' | 'pending';
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
  
  // Assigned cleaner (from host's team)
  cleanerId?: string;
  cleanerFirstName?: string;
  cleanerLastName?: string;
  cleanerLocation?: Coordinates;
  
  // Support for multiple assignment options
  assignedCleanerId?: string; // Primary assigned cleaner ID
  assignedCleanerName?: string; // Primary assigned cleaner name
  teamCleaners?: string[]; // Array of team cleaner IDs who can handle this job
  assignedAt?: string; // ISO string of when job was assigned
  
  notes?: string;
  
  // Cleaning specific fields
  cleaningType?: 'standard' | 'deep' | 'emergency' | 'checkout';
  estimatedDuration?: number; // in hours
  preferredDate?: number;
  preferredTime?: string;
  
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

// New: Cleaner recruitment posts - for finding cleaners to join the team
export interface CleanerRecruitment {
  id: string;
  hostId: string;
  hostName: string;
  hostEmail?: string;
  
  // Property information - showing what properties the cleaner will be cleaning
  properties: Array<{
    id?: string; // If using existing property
    address: string;
    city?: string;
    state?: string;
    zipCode?: string;
    bedrooms?: number;
    beds?: number;
    bathrooms?: number;
    unitSize?: number; // square feet
    unitSizeUnknown?: boolean; // If they don't know the size
    label?: string; // Property name/label
  }>;
  
  // Team recruitment details
  servicesNeeded?: string[]; // Types of cleaning services needed
  notes?: string; // Additional notes about what the host is looking for
  title?: string; // Optional title for the recruitment post
  
  status: 'open' | 'closed' | 'filled';
  createdAt: number;
  expiresAt?: number;
  
  // Bids from cleaners wanting to join the team
  bids?: CleanerBid[];
  acceptedBids?: string[]; // IDs of accepted bids
}

// Bid from a cleaner to join a host's team
export interface CleanerBid {
  id: string;
  recruitmentId: string; // ID of the CleanerRecruitment post
  cleanerId: string;
  cleanerName: string;
  cleanerEmail?: string;
  cleanerPhone?: string;
  
  // Cleaner's actual profile information (fetched separately)
  cleanerFirstName?: string;
  cleanerLastName?: string;
  
  // Cleaner's proposal
  flatFee?: number; // Flat fee per cleaning job
  availability?: string[]; // Days/times available
  experience?: string;
  specialties?: string[];
  message?: string; // Cover letter / introduction
  
  // Cleaner's credentials
  rating?: number;
  completedJobs?: number;
  certifications?: string[];
  references?: string[];
  
  bidDate: number;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  
  // If accepted, when they joined the team
  acceptedDate?: number;
  teamRole?: 'primary_cleaner' | 'secondary_cleaner';
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
  
  // Property assignments for cleaners
  assignedProperties?: string[]; // Array of property IDs assigned to this team member
  
  // How they joined the team
  recruitmentId?: string; // If joined through recruitment post
  bidId?: string; // If joined through bidding
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
  yearsExperience?: number;
  insuranceVerified?: boolean;
  backgroundCheckDate?: number;
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
