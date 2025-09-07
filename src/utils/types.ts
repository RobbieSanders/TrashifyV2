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
  status: 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'scheduled' | 'pending' | 'bidding';
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
  
  // Property details (for emergency cleanings and regular cleanings)
  bedrooms?: number;
  beds?: number;
  bathrooms?: number;
  unitSize?: number; // square feet
  unitSizeUnknown?: boolean;
  
  // Cleaning specific fields
  cleaningType?: 'standard' | 'deep' | 'emergency' | 'checkout';
  estimatedDuration?: number; // in hours
  preferredDate?: number;
  preferredTime?: string;
  
  // Emergency cleaning specific fields
  isEmergency?: boolean;
  emergencyFee?: number; // Higher rate for emergency cleanings
  urgencyLevel?: 'immediate' | 'same-day' | 'next-day';
  emergencyNotes?: string; // Special instructions for emergency
  emergencyReason?: string; // Why this is an emergency
  minimumNoticeHours?: number; // Minimum notice required (default 3)
  isOneTimeJob?: boolean; // True for emergency cleanings (no team joining)
  
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
  
  // Post-completion photos and report
  cleaningPhotos?: CleaningPhoto[];
  cleaningConcerns?: string; // Optional concerns noted by cleaner
}

// Post-completion cleaning photos
export interface CleaningPhoto {
  id: string;
  jobId: string;
  cleanerId: string;
  roomType: 'bedroom' | 'bathroom' | 'kitchen' | 'living_room' | 'dining_room' | 'other';
  roomNumber?: number; // For multiple rooms of same type (bedroom 1, bedroom 2, etc.)
  photoUrl: string;
  uploadedAt: number;
  description?: string;
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
    coordinates?: Coordinates; // Pre-geocoded coordinates to avoid re-geocoding
  }>;
  
  // Team recruitment details
  servicesNeeded?: string[]; // Types of cleaning services needed
  notes?: string; // Additional notes about what the host is looking for
  title?: string; // Optional title for the recruitment post
  
  // New fields for cleaner information
  estimatedTurnoversPerMonth?: number; // 1-10 or 11+ (represented as 11)
  estimatedCleaningTimeHours?: number; // 1-10 or 11+ (represented as 11)
  cleanerWillProvideSupplies?: boolean; // Checkbox: provide cleaning supplies
  cleanerWillWashLinens?: boolean; // Checkbox: wash and dry linens + towels
  
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
  
  // Service address and radius for bid filtering
  serviceAddress?: string;
  serviceCoordinates?: Coordinates;
  serviceRadiusMiles?: number;
  serviceRadiusKm?: number;
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

// Chat system types
export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole?: 'host' | 'cleaner' | 'worker' | 'admin';
  senderProfilePicture?: string; // Profile picture URL
  message: string;
  timestamp: number;
  readBy?: string[]; // Array of user IDs who have read this message
  messageType?: 'text' | 'system' | 'image';
  imageUrl?: string; // For image messages
  attachments?: string[]; // For future file attachments
}

export interface Chat {
  id: string;
  type: 'team' | 'bidding' | 'direct'; // team = team chat, bidding = during bidding process, direct = 1-on-1
  participants: string[]; // Array of user IDs
  participantNames: string[]; // Array of user names for display
  participantRoles?: string[]; // Array of user roles
  participantProfilePictures?: { [userId: string]: string }; // Object mapping userId to profile picture URL
  title?: string; // Custom chat title
  lastMessage?: string;
  lastMessageTime?: number;
  lastMessageSender?: string;
  unreadCount?: { [userId: string]: number }; // Unread count per user
  createdAt: number;
  updatedAt: number;
  
  // Context-specific fields
  teamId?: string; // For team chats
  recruitmentId?: string; // For bidding chats
  cleaningJobId?: string; // For job-specific chats
  bidId?: string; // For specific bid discussions
  
  // Chat settings
  isActive: boolean;
  isArchived?: boolean;
  mutedBy?: string[]; // Users who have muted this chat
}

export interface ChatParticipant {
  userId: string;
  name: string;
  role?: string;
  joinedAt: number;
  lastSeen?: number;
  isOnline?: boolean;
}

// Enhanced notification type for navigation
export interface NotificationItem {
  id: string;
  userId: string; // recipient user id
  message: string;
  createdAt: number;
  read?: boolean;
  type?: 'cleaning_concern' | 'general' | 'review_request';
  navigationData?: {
    screen?: string;
    params?: any;
  };
}

// Review system types
export interface CleanerReview {
  id: string;
  cleanerId: string;
  cleanerName: string;
  hostId: string;
  hostName: string;
  cleaningJobId?: string; // Made optional - not always available when reviewing from profile
  propertyAddress?: string;
  
  // Review content
  rating: number; // 1-5 stars
  comment?: string;
  
  // Review metadata
  createdAt: number;
  updatedAt?: number;
  editCount: number; // Track how many times this review has been edited
  canEdit: boolean; // False after 10 total reviews for this cleaner
  
  // Review categories (optional detailed ratings)
  qualityRating?: number; // 1-5
  punctualityRating?: number; // 1-5
  communicationRating?: number; // 1-5
  professionalismRating?: number; // 1-5
}

export interface CleanerReviewStats {
  cleanerId: string;
  totalReviews: number;
  averageRating: number;
  
  // Breakdown by rating
  fiveStarCount: number;
  fourStarCount: number;
  threeStarCount: number;
  twoStarCount: number;
  oneStarCount: number;
  
  // Category averages (if using detailed ratings)
  averageQualityRating?: number;
  averagePunctualityRating?: number;
  averageCommunicationRating?: number;
  averageProfessionalismRating?: number;
  
  // Recent trend
  lastMonthAverage?: number;
  trend?: 'improving' | 'declining' | 'stable';
}
