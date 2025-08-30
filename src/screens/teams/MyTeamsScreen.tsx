import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Modal,
  Alert,
  TextInput,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { TeamMember, CleaningJob } from '../../utils/types';
import { 
  doc, 
  updateDoc, 
  onSnapshot, 
  collection, 
  deleteDoc,
  addDoc,
  query,
  where,
  getDocs,
  getDoc,
  orderBy
} from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { useAccountsStore } from '../../stores/accountsStore';

interface CalendarDay {
  date: Date;
  day: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  cleanings: CleaningJob[];
}

export function MyTeamsScreen({ navigation }: any) {
  const user = useAuthStore(s => s.user);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showAssignPropertiesModal, setShowAssignPropertiesModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Form fields for adding team member
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberRole, setMemberRole] = useState<'primary_cleaner' | 'secondary_cleaner' | 'trash_service'>('primary_cleaner');
  
  // Property assignment state
  const { properties, loadProperties } = useAccountsStore();
  const [memberProperties, setMemberProperties] = useState<{ [propertyId: string]: boolean }>({});

  // Calendar view state
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [cleaningJobs, setCleaningJobs] = useState<CleaningJob[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [showDayModal, setShowDayModal] = useState(false);
  const [showJobSelectionModal, setShowJobSelectionModal] = useState(false);
  const [selectedDayJobs, setSelectedDayJobs] = useState<CleaningJob[]>([]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Load properties on mount
  useEffect(() => {
    if (user?.uid) {
      loadProperties(user.uid);
    }
  }, [user?.uid]);

  // Generate calendar days for the current month
  const generateCalendarDays = (date: Date, jobs: CleaningJob[]) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 42; i++) {
      const dayDate = new Date(startDate);
      dayDate.setDate(startDate.getDate() + i);
      dayDate.setHours(0, 0, 0, 0);

      // Find cleanings for this day
      const dayCleanings = jobs.filter(job => {
        if (!job.preferredDate) return false;
        const jobDate = new Date(job.preferredDate);
        jobDate.setHours(0, 0, 0, 0);
        return jobDate.getTime() === dayDate.getTime();
      });

      days.push({
        date: dayDate,
        day: dayDate.getDate(),
        month: dayDate.getMonth(),
        year: dayDate.getFullYear(),
        isCurrentMonth: dayDate.getMonth() === month,
        isToday: dayDate.getTime() === today.getTime(),
        cleanings: dayCleanings
      });
    }

    return days;
  };

  // Load cleaning jobs for calendar view
  useEffect(() => {
    if (!showCalendarView || !user?.uid) return;

    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

    const q = query(
      collection(db, 'cleaningJobs'),
      where('userId', '==', user.uid),
      where('preferredDate', '>=', startOfMonth.getTime()),
      where('preferredDate', '<=', endOfMonth.getTime()),
      orderBy('preferredDate', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const jobs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as CleaningJob[];

        setCleaningJobs(jobs);
        setCalendarDays(generateCalendarDays(currentDate, jobs));
        setRefreshing(false);
      },
      (error) => {
        console.error('Error loading cleaning jobs:', error);
        setRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, [currentDate, showCalendarView, user?.uid]);

  // Subscribe to team members from subcollection
  useEffect(() => {
    if (!db || !user?.uid) return;

    const teamCollectionRef = collection(db, 'users', user.uid, 'teamMembers');
    const unsubscribe = onSnapshot(teamCollectionRef, (snapshot) => {
      const members: TeamMember[] = [];
      snapshot.forEach((doc) => {
        members.push({ ...doc.data(), id: doc.id } as TeamMember);
      });
      setTeamMembers(members);
    }, (error) => {
      console.error('[MyTeamsScreen] Error loading team:', error);
      setTeamMembers([]);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const getRoleIcon = (role: string) => {
    switch(role) {
      case 'primary_cleaner': return 'star';
      case 'secondary_cleaner': return 'person';
      case 'trash_service': return 'trash';
      default: return 'person';
    }
  };

  const getRoleColor = (role: string) => {
    switch(role) {
      case 'primary_cleaner': return '#10B981';
      case 'secondary_cleaner': return '#3B82F6';
      case 'trash_service': return '#8B5CF6';
      default: return '#64748B';
    }
  };

  const getRoleLabel = (role: string) => {
    switch(role) {
      case 'primary_cleaner': return 'Primary Cleaner';
      case 'secondary_cleaner': return 'Secondary Cleaner';
      case 'trash_service': return 'Trash Service';
      default: return role;
    }
  };

  // Open property assignment modal
  const handleMemberClick = (member: TeamMember) => {
    if (member.role === 'trash_service') {
      // Don't allow property assignment for trash service
      Alert.alert('Info', 'Trash service members don\'t need property assignments');
      return;
    }
    
    setSelectedMember(member);
    
    // Initialize the checkbox states based on member's current properties
    const initialProperties: { [propertyId: string]: boolean } = {};
    if (member.assignedProperties) {
      member.assignedProperties.forEach(propId => {
        initialProperties[propId] = true;
      });
    }
    setMemberProperties(initialProperties);
    setShowAssignPropertiesModal(true);
  };

  // Save property assignments
  const handleSavePropertyAssignments = async () => {
    if (!user?.uid || !selectedMember) return;
    
    setLoading(true);
    try {
      const newAssignedProperties = Object.keys(memberProperties).filter(propId => memberProperties[propId]);
      
      // Get the previously assigned properties
      const previousAssignedProperties = selectedMember.assignedProperties || [];
      
      // Find removed properties (were assigned before but not anymore)
      const removedProperties = previousAssignedProperties.filter(propId => 
        !newAssignedProperties.includes(propId)
      );
      
      // Update team member's assigned properties
      const memberDocRef = doc(db, 'users', user.uid, 'teamMembers', selectedMember.id);
      await updateDoc(memberDocRef, {
        assignedProperties: newAssignedProperties
      });
      
      // If properties were removed, remove cleaner from those jobs
      if (selectedMember.role === 'primary_cleaner' && removedProperties.length > 0) {
        // Get addresses of removed properties
        const removedPropertyAddresses = properties
          .filter(p => removedProperties.includes(p.id))
          .map(p => p.address);
        
        console.log('[MyTeamsScreen] Removing cleaner from properties:', removedPropertyAddresses);
        console.log('[MyTeamsScreen] Selected member:', selectedMember);
        
        // Get the actual user ID if this member has one
        let actualUserId = selectedMember.userId;
        
        // If member has email but no userId, try to find their user account
        if (!actualUserId && selectedMember.email) {
          try {
            const userQuery = await getDocs(query(
              collection(db, 'users'),
              where('email', '==', selectedMember.email)
            ));
            
            if (!userQuery.empty) {
              actualUserId = userQuery.docs[0].id;
              console.log(`[MyTeamsScreen] Found user ID by email: ${actualUserId}`);
            }
          } catch (error) {
            console.log('[MyTeamsScreen] Could not find user account by email');
          }
        }
        
        // Query all cleaning jobs
        const cleaningJobsQuery = query(collection(db, 'cleaningJobs'));
        const snapshot = await getDocs(cleaningJobsQuery);
        const removalUpdates: Promise<void>[] = [];
        
        snapshot.forEach((docSnapshot) => {
          const jobData = docSnapshot.data();
          
          // Check if this job belongs to user
          const belongsToUser = jobData.userId === user.uid || jobData.hostId === user.uid;
          
          // Check multiple conditions for assignment
          const isAssignedToThisCleaner = 
            jobData.assignedTeamMemberId === selectedMember.id ||
            (actualUserId && jobData.assignedCleanerId === actualUserId) ||
            jobData.assignedCleanerName === selectedMember.name ||
            (actualUserId && jobData.cleanerId === actualUserId) || // Check cleanerId field too
            jobData.cleanerName === selectedMember.name; // Check cleanerName field too
          
          if (belongsToUser && isAssignedToThisCleaner) {
            // Normalize addresses for comparison
            const normalizeAddress = (addr: string) => addr ? addr.toLowerCase().replace(/\s+/g, ' ').trim() : '';
            const jobAddress = normalizeAddress(jobData.address || '');
            
            // Check if this job's address is in the removed properties list
            const shouldRemove = removedPropertyAddresses.some(propAddr => 
              normalizeAddress(propAddr) === jobAddress
            );
            
            if (shouldRemove && jobData.status !== 'completed' && jobData.status !== 'cancelled') {
              console.log(`[MyTeamsScreen] Removing cleaner from job at ${jobData.address}`);
              console.log(`  Reason: Property unassigned, cleaner fields: assignedCleanerId=${jobData.assignedCleanerId}, assignedCleanerName=${jobData.assignedCleanerName}, cleanerId=${jobData.cleanerId}, cleanerName=${jobData.cleanerName}`);
              
              // Remove cleaner from this job - clear ALL possible assignment fields
              removalUpdates.push(
                updateDoc(docSnapshot.ref, {
                  assignedCleanerId: null,
                  assignedCleanerName: null,
                  assignedTeamMemberId: null,
                  cleanerId: null, // Also clear these legacy fields
                  cleanerName: null,
                  status: 'open' // Change back to 'open' since no cleaner assigned
                })
              );
            }
          }
        });
        
        // Execute all removal updates
        if (removalUpdates.length > 0) {
          await Promise.all(removalUpdates);
          console.log(`[MyTeamsScreen] Removed cleaner from ${removalUpdates.length} jobs`);
        } else {
          console.log(`[MyTeamsScreen] No jobs found to remove cleaner from`);
        }
      }
      
      // Auto-assign cleaner to all cleaning jobs for these properties (only for primary cleaners)
      if (selectedMember.role === 'primary_cleaner' && newAssignedProperties.length > 0) {
        // Get the addresses of all newly assigned properties
        const newlyAssignedProperties = newAssignedProperties.filter(propId => 
          !previousAssignedProperties.includes(propId)
        );
        
        const assignedPropertyAddresses = properties
          .filter(p => newlyAssignedProperties.includes(p.id))
          .map(p => p.address);
        
        console.log('[MyTeamsScreen] === AUTO-ASSIGNMENT DEBUG ===');
        console.log('[MyTeamsScreen] Properties to assign:', assignedPropertyAddresses);
        console.log('[MyTeamsScreen] User ID:', user.uid);
        
        // Try both userId and hostId fields since cleaning jobs might use either
        const cleaningJobsQuery = query(
          collection(db, 'cleaningJobs')
        );
        
        const snapshot = await getDocs(cleaningJobsQuery);
        const updates: Promise<void>[] = [];
        let jobsChecked = 0;
        let jobsMatched = 0;
        let debugInfo: any[] = [];
        
          // Get the current cleaner name and ensure we have proper userId
          let currentCleanerName = selectedMember.name;
          let cleanerUserId = selectedMember.userId;
          
          // If member has email but no userId, try to find their user account
          if (!cleanerUserId && selectedMember.email) {
            try {
              const userQuery = await getDocs(query(
                collection(db, 'users'),
                where('email', '==', selectedMember.email)
              ));
              
              if (!userQuery.empty) {
                const userDoc = userQuery.docs[0];
                cleanerUserId = userDoc.id;
                const userData = userDoc.data();
                currentCleanerName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || selectedMember.name;
                
                // Update team member with userId
                await updateDoc(
                  doc(db, 'users', user.uid, 'teamMembers', selectedMember.id),
                  { userId: cleanerUserId }
                );
                
                console.log(`[MyTeamsScreen] Linked team member to user account: ${cleanerUserId}`);
              }
            } catch (error) {
              console.log('[MyTeamsScreen] Could not find user account for email:', selectedMember.email);
            }
          }
          
          // If we have a userId, get the latest name
          if (cleanerUserId) {
            try {
              const userDoc = await getDoc(doc(db, 'users', cleanerUserId));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                const actualName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
                if (actualName && actualName !== 'null null') {
                  currentCleanerName = actualName;
                }
              }
            } catch (error) {
              console.log('[MyTeamsScreen] Could not fetch current user name, using team member name');
            }
          }

        snapshot.forEach((docSnapshot) => {
          const jobData = docSnapshot.data();
          
          // Check if this job belongs to the current user (either userId or hostId)
          const belongsToUser = jobData.userId === user.uid || jobData.hostId === user.uid;
          
          if (belongsToUser) {
            jobsChecked++;
            
            // Normalize addresses for comparison (remove extra spaces, make lowercase)
            const normalizeAddress = (addr: string) => addr ? addr.toLowerCase().replace(/\s+/g, ' ').trim() : '';
            const jobAddress = normalizeAddress(jobData.address || '');
            
            debugInfo.push({
              jobId: docSnapshot.id,
              jobAddress: jobData.address,
              normalizedJobAddress: jobAddress,
              status: jobData.status,
              currentAssignedCleaner: jobData.assignedCleanerName || 'None'
            });
            
            // Check if this job's address matches any of the assigned property addresses
            const matchingProperty = assignedPropertyAddresses.find(propAddr => {
              const normalizedPropAddr = normalizeAddress(propAddr);
              const matches = normalizedPropAddr === jobAddress;
              if (!matches && jobAddress) {
                console.log(`[MyTeamsScreen] Address mismatch: "${normalizedPropAddr}" !== "${jobAddress}"`);
              }
              return matches;
            });
            
            // Only update if status is open or assigned (not completed)
            if (matchingProperty && jobData.status !== 'completed' && jobData.status !== 'cancelled') {
              jobsMatched++;
              console.log(`[MyTeamsScreen] ✓ Assigning job ${docSnapshot.id} at ${jobData.address} to ${currentCleanerName}`);
              
              // IMPORTANT: Only use actual user IDs for assignedCleanerId, never team member IDs
              // This ensures jobs stay assigned when names change
              const updateData: any = {
                assignedTeamMemberId: selectedMember.id, // Always store team member ID for reference
                assignedCleanerName: currentCleanerName,
                status: jobData.status === 'open' ? 'assigned' : jobData.status
              };
              
              // Only set assignedCleanerId if we have a real user ID
              if (cleanerUserId) {
                updateData.assignedCleanerId = cleanerUserId;
              } else {
                // For unregistered cleaners, we don't set assignedCleanerId
                // Jobs will be tracked via assignedTeamMemberId only
                updateData.assignedCleanerId = null;
                console.log(`[MyTeamsScreen] Note: ${currentCleanerName} is not a registered user, using team member tracking only`);
              }
              
              updates.push(updateDoc(docSnapshot.ref, updateData));
            } else if (matchingProperty && (jobData.status === 'completed' || jobData.status === 'cancelled')) {
              console.log(`[MyTeamsScreen] ✗ Skipping job at ${jobData.address} - status: ${jobData.status}`);
            }
          }
        });
        
        console.log(`[MyTeamsScreen] === SUMMARY ===`);
        console.log(`[MyTeamsScreen] Total jobs in database: ${snapshot.size}`);
        console.log(`[MyTeamsScreen] Jobs belonging to user: ${jobsChecked}`);
        console.log(`[MyTeamsScreen] Jobs matched and updated: ${jobsMatched}`);
        console.log('[MyTeamsScreen] Job details:', debugInfo);
        
        // Execute all updates
        if (updates.length > 0) {
          await Promise.all(updates);
          
          // Force a small delay to let Firestore propagate changes
          setTimeout(() => {
            // This will trigger any listeners to refresh
            console.log('[MyTeamsScreen] Updates completed, UI should refresh');
          }, 500);
          
          Alert.alert(
            'Success', 
            `Properties updated for ${selectedMember.name}.\n\n${updates.length} cleaning job(s) were automatically assigned to this cleaner.`
          );
        } else if (removedProperties.length > 0) {
          Alert.alert('Success', `Properties updated for ${selectedMember.name}.\n\nCleaner was removed from jobs at unassigned properties.`);
        } else {
          Alert.alert('Success', `Properties assigned to ${selectedMember.name}`);
        }
      } else {
        Alert.alert('Success', `Properties assigned to ${selectedMember.name}`);
      }
      
      setShowAssignPropertiesModal(false);
      setSelectedMember(null);
      setMemberProperties({});
    } catch (error) {
      console.error('Error assigning properties:', error);
      Alert.alert('Error', 'Failed to assign properties');
    } finally {
      setLoading(false);
    }
  };

  // Add team member to subcollection
  const handleAddTeamMember = async () => {
    if (!memberName.trim()) {
      Alert.alert('Missing Information', 'Please enter team member name');
      return;
    }

    if (!user?.uid) return;

    setLoading(true);
    try {
      // Check if there are existing cleaners to determine role
      let finalRole = memberRole;
      if (memberRole === 'primary_cleaner' || memberRole === 'secondary_cleaner') {
        const existingCleaners = teamMembers.filter(m => 
          m.role === 'primary_cleaner' || m.role === 'secondary_cleaner'
        );
        const hasPrimary = existingCleaners.some(m => m.role === 'primary_cleaner');
        
        // If adding a cleaner and there's already a primary, make them secondary
        if (memberRole === 'primary_cleaner' && hasPrimary) {
          finalRole = 'secondary_cleaner';
        }
      }

      const newMemberData: any = {
        id: `member_${Date.now()}`,
        userId: '',
        name: memberName.trim(),
        role: finalRole,
        addedAt: Date.now(),
        status: 'active',
        rating: 0,
        completedJobs: 0,
        assignedProperties: [] // Initialize with empty array
      };

      // Only add optional fields if they have values
      if (memberPhone.trim()) {
        newMemberData.phoneNumber = memberPhone.trim();
      }
      if (memberEmail.trim()) {
        newMemberData.email = memberEmail.trim();
      }

      const teamCollectionRef = collection(db, 'users', user.uid, 'teamMembers');
      await addDoc(teamCollectionRef, newMemberData);

      Alert.alert('Success', `${memberName} has been added to your team as ${getRoleLabel(finalRole)}!`);
      setShowAddMemberModal(false);
      setMemberName('');
      setMemberEmail('');
      setMemberPhone('');
      setMemberRole('primary_cleaner');
    } catch (error) {
      console.error('Error adding team member:', error);
      Alert.alert('Error', 'Failed to add team member');
    } finally {
      setLoading(false);
    }
  };

  // Remove team member from subcollection
  const handleRemoveTeamMember = async (memberId: string) => {
    Alert.alert(
      'Remove Team Member',
      'Are you sure you want to remove this member from your team?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!user?.uid) return;
            
            try {
              // Get the team member details before deletion
              const member = teamMembers.find(m => m.id === memberId);
              
              if (member) {
                console.log(`[MyTeamsScreen] Removing team member: ${member.name} (ID: ${memberId}, UserID: ${member.userId || 'none'})`);
                
                // Get the actual user ID if this member has one
                let actualUserId = member.userId;
                
                // If member has email but no userId, try to find their user account
                if (!actualUserId && member.email) {
                  try {
                    const userQuery = await getDocs(query(
                      collection(db, 'users'),
                      where('email', '==', member.email)
                    ));
                    
                    if (!userQuery.empty) {
                      actualUserId = userQuery.docs[0].id;
                      console.log(`[MyTeamsScreen] Found user ID by email: ${actualUserId}`);
                    }
                  } catch (error) {
                    console.log('[MyTeamsScreen] Could not find user account by email');
                  }
                }
                
                // Remove cleaner from all assigned cleaning jobs
                const cleaningJobsQuery = query(collection(db, 'cleaningJobs'));
                const snapshot = await getDocs(cleaningJobsQuery);
                const removalUpdates: Promise<void>[] = [];
                let jobsToRemove: any[] = [];
                
                snapshot.forEach((docSnapshot) => {
                  const jobData = docSnapshot.data();
                  
                  // Multiple conditions to check if this job should be unassigned:
                  // 1. Job is assigned via team member ID
                  const assignedViaTeamMember = jobData.assignedTeamMemberId === memberId;
                  
                  // 2. Job is assigned via user ID (for registered users)
                  const assignedViaUserId = actualUserId && jobData.assignedCleanerId === actualUserId;
                  
                  // 3. Job belongs to the current user and is assigned to this member
                  const belongsToCurrentUser = jobData.userId === user.uid || jobData.hostId === user.uid;
                  const nameMatches = jobData.assignedCleanerName === member.name;
                  
                  // Check if this job should be unassigned
                  const shouldUnassign = (assignedViaTeamMember || assignedViaUserId || 
                                          (belongsToCurrentUser && nameMatches)) &&
                                         jobData.status !== 'completed' && 
                                         jobData.status !== 'cancelled';
                  
                  if (shouldUnassign) {
                    jobsToRemove.push({
                      id: docSnapshot.id,
                      address: jobData.address,
                      reason: assignedViaTeamMember ? 'Team member ID' : 
                             assignedViaUserId ? 'User ID' : 
                             'Name match'
                    });
                    
                    console.log(`[MyTeamsScreen] Removing ${member.name} from job at ${jobData.address} (Reason: ${
                      assignedViaTeamMember ? 'Team member ID match' : 
                      assignedViaUserId ? 'User ID match' : 
                      'Name match for user\'s job'
                    })`);
                    
                    // Remove cleaner from this job
                    removalUpdates.push(
                      updateDoc(docSnapshot.ref, {
                        assignedCleanerId: null,
                        assignedCleanerName: null,
                        assignedTeamMemberId: null,
                        status: 'open' // Change back to 'open' since no cleaner assigned
                      })
                    );
                  }
                });
                
                console.log(`[MyTeamsScreen] Jobs to unassign: ${jobsToRemove.length}`, jobsToRemove);
                
                // Execute all removal updates
                if (removalUpdates.length > 0) {
                  await Promise.all(removalUpdates);
                  console.log(`[MyTeamsScreen] Removed ${member.name} from ${removalUpdates.length} jobs`);
                }
              }
              
              // Delete the team member
              const memberDocRef = doc(db, 'users', user.uid, 'teamMembers', memberId);
              await deleteDoc(memberDocRef);
              
              Alert.alert('Success', 'Team member removed and unassigned from all jobs');
            } catch (error) {
              console.error('Error removing team member:', error);
              Alert.alert('Error', 'Failed to remove team member');
            }
          }
        }
      ]
    );
  };

  // Toggle member status
  const handleToggleStatus = async (memberId: string) => {
    if (!user?.uid) return;
    
    const member = teamMembers.find(m => m.id === memberId);
    if (!member) return;
    
    try {
      const memberDocRef = doc(db, 'users', user.uid, 'teamMembers', memberId);
      await updateDoc(memberDocRef, {
        status: member.status === 'active' ? 'inactive' : 'active'
      });
    } catch (error) {
      console.error('Error toggling member status:', error);
      Alert.alert('Error', 'Failed to update member status');
    }
  };

  // Change member role (only for cleaners, not trash service)
  const handleChangeRole = async (memberId: string, currentRole: string) => {
    if (!user?.uid) return;
    
    // Can't change trash service roles
    if (currentRole === 'trash_service') {
      Alert.alert('Info', 'Cannot change role for Trash Service members');
      return;
    }
    
    const member = teamMembers.find(m => m.id === memberId);
    if (!member) return;
    
    const newRole = currentRole === 'primary_cleaner' ? 'secondary_cleaner' : 'primary_cleaner';
    
    Alert.alert(
      'Change Role',
      `Change ${member.name} to ${getRoleLabel(newRole)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          onPress: async () => {
            try {
              const memberDocRef = doc(db, 'users', user.uid, 'teamMembers', memberId);
              await updateDoc(memberDocRef, { role: newRole });
              Alert.alert('Success', `${member.name} is now a ${getRoleLabel(newRole)}`);
            } catch (error) {
              console.error('Error changing role:', error);
              Alert.alert('Error', 'Failed to change role');
            }
          }
        }
      ]
    );
  };

  // Get property name for display
  const getPropertyName = (propertyId: string) => {
    const property = properties.find(p => p.id === propertyId);
    // Return null for non-existent properties so they can be filtered out
    if (!property) return null;
    return property.label || property.address;
  };
  
  // Calendar navigation functions
  const navigateToPreviousMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  const navigateToNextMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  const navigateToToday = () => {
    setCurrentDate(new Date());
  };

  // Handle day press in calendar
  const handleDayPress = (day: CalendarDay) => {
    if (day.cleanings.length === 0) {
      Alert.alert('No Jobs', 'No cleaning jobs scheduled for this date.');
      return;
    }

    if (day.cleanings.length === 1) {
      // Single job - start it directly
      handleStartJob(day.cleanings[0]);
    } else {
      // Multiple jobs - show selection modal
      setSelectedDayJobs(day.cleanings);
      setShowJobSelectionModal(true);
    }
  };

  // Handle starting a job
  const handleStartJob = async (job: CleaningJob) => {
    try {
      const jobRef = doc(db, 'cleaningJobs', job.id);
      await updateDoc(jobRef, { 
        status: 'in_progress',
        startedAt: Date.now()
      });
      Alert.alert('Success', 'Job started! You can now begin cleaning.');
    } catch (error) {
      console.error('Error starting job:', error);
      Alert.alert('Error', 'Failed to start job. Please try again.');
    }
  };

  // Get status color for jobs
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#FFB74D';
      case 'assigned': return '#64B5F6';
      case 'in_progress': return '#4FC3F7';
      case 'completed': return '#66BB6A';
      case 'cancelled': return '#E57373';
      default: return '#9E9E9E';
    }
  };

  // Refresh calendar
  const onRefresh = () => {
    setRefreshing(true);
  };

  // Filter out orphaned property IDs
  const getValidPropertyIds = (propertyIds: string[] | undefined) => {
    if (!propertyIds) return [];
    return propertyIds.filter(propId => {
      const property = properties.find(p => p.id === propId);
      return property !== undefined;
    });
  };

  // Group members by role
  const primaryCleaners = teamMembers.filter(m => m.role === 'primary_cleaner');
  const secondaryCleaners = teamMembers.filter(m => m.role === 'secondary_cleaner');
  const trashServices = teamMembers.filter(m => m.role === 'trash_service');

  // Render calendar view
  const renderCalendarView = () => (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Calendar Header */}
      <View style={styles.calendarHeader}>
        <TouchableOpacity onPress={navigateToPreviousMonth} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.monthYear}>
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </Text>
          <TouchableOpacity onPress={navigateToToday}>
            <Text style={styles.todayButton}>Today</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={navigateToNextMonth} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Day Names */}
      <View style={styles.dayNamesContainer}>
        {dayNames.map((dayName, index) => (
          <View key={index} style={styles.dayNameCell}>
            <Text style={styles.dayNameText}>{dayName}</Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.calendarGrid}>
        {calendarDays.map((day, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.dayCell,
              !day.isCurrentMonth && styles.otherMonthDay,
              day.isToday && styles.todayCell
            ]}
            onPress={() => handleDayPress(day)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.dayNumber,
              !day.isCurrentMonth && styles.otherMonthDayNumber,
              day.isToday && styles.todayNumber
            ]}>
              {day.day}
            </Text>
            
            {day.cleanings.length > 0 && (
              <View style={styles.cleaningInfo}>
                <View style={styles.cleaningIndicators}>
                  {day.cleanings.slice(0, 2).map((cleaning, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.cleaningDot,
                        { backgroundColor: getStatusColor(cleaning.status) }
                      ]}
                    />
                  ))}
                  {day.cleanings.length > 2 && (
                    <Text style={styles.moreIndicator}>+{day.cleanings.length - 2}</Text>
                  )}
                </View>
                
                {day.cleanings.length === 1 && (
                  <>
                    <Text style={styles.cleaningTime} numberOfLines={1}>
                      {day.cleanings[0].preferredTime || '10:00 AM'}
                    </Text>
                    <Text style={styles.cleanerName} numberOfLines={1}>
                      {(day.cleanings[0].assignedCleanerName || day.cleanings[0].cleanerFirstName) ? 
                        (day.cleanings[0].assignedCleanerName || `${day.cleanings[0].cleanerFirstName}`) : 
                        'Unassigned'}
                    </Text>
                  </>
                )}
                
                {day.cleanings.length > 1 && (
                  <Text style={styles.multipleCleanings}>
                    {day.cleanings.length} jobs
                  </Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Upcoming Jobs List */}
      <View style={styles.upcomingSection}>
        <Text style={styles.upcomingSectionTitle}>Upcoming Jobs</Text>
        {cleaningJobs.length === 0 ? (
          <Text style={styles.noJobsText}>No jobs scheduled this month</Text>
        ) : (
          cleaningJobs.map((job) => (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              onPress={() => handleStartJob(job)}
            >
              <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(job.status) }]} />
              <View style={styles.jobCardContent}>
                <Text style={styles.jobAddress} numberOfLines={1}>
                  {job.address}
                </Text>
                <View style={styles.jobCardDetails}>
                  <Text style={styles.jobDate}>
                    {new Date(job.preferredDate!).toLocaleDateString()} at {job.preferredTime || '10:00 AM'}
                  </Text>
                  <Text style={styles.cleanerAssigned}>
                    {(job.assignedCleanerName || (job.cleanerFirstName && job.cleanerLastName))
                      ? (job.assignedCleanerName || `${job.cleanerFirstName} ${job.cleanerLastName}`)
                      : 'No cleaner assigned'}
                  </Text>
                  {job.guestName && (
                    <Text style={styles.guestInfo}>
                      Guest: {job.guestName}
                    </Text>
                  )}
                </View>
                <View style={styles.jobCardFooter}>
                  <Text style={styles.jobType}>{job.cleaningType || 'Standard'}</Text>
                  <Text style={[styles.statusBadge, { color: getStatusColor(job.status) }]}>
                    {job.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {/* Header with view toggle */}
      <View style={styles.header}>
        <Text style={styles.title}>My Team</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={[styles.viewToggle, showCalendarView && styles.viewToggleActive]}
            onPress={() => setShowCalendarView(!showCalendarView)}
          >
            <Ionicons 
              name={showCalendarView ? "list" : "calendar"} 
              size={20} 
              color={showCalendarView ? "white" : "#1E88E5"} 
            />
            <Text style={[styles.viewToggleText, showCalendarView && styles.viewToggleTextActive]}>
              {showCalendarView ? "List View" : "Calendar"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setShowAddMemberModal(true)}
          >
            <Ionicons name="person-add" size={20} color="white" />
            <Text style={styles.addButtonText}>Add Member</Text>
          </TouchableOpacity>
        </View>
      </View>

      {showCalendarView ? renderCalendarView() : (
        <ScrollView showsVerticalScrollIndicator={false}>

        {/* Primary Cleaners Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="star" size={20} color="#10B981" />
            <Text style={styles.sectionTitle}>Primary Cleaners</Text>
            <Text style={styles.sectionCount}>({primaryCleaners.length})</Text>
          </View>
          
          {primaryCleaners.length === 0 ? (
            <Text style={styles.emptyText}>No primary cleaners added yet</Text>
          ) : (
            primaryCleaners.map(member => (
              <TouchableOpacity 
                key={member.id} 
                style={styles.memberCard}
                onPress={() => handleMemberClick(member)}
              >
                <View style={styles.memberInfo}>
                  <TouchableOpacity 
                    style={[styles.roleIndicator, { backgroundColor: getRoleColor(member.role) }]}
                    onPress={() => handleChangeRole(member.id, member.role)}
                  >
                    <Ionicons name={getRoleIcon(member.role) as any} size={16} color="white" />
                  </TouchableOpacity>
                  <View style={styles.memberDetails}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#CBD5E1" style={{ marginLeft: 6 }} />
                    </View>
                    {member.email && <Text style={styles.memberContact}>{member.email}</Text>}
                    {member.phoneNumber && <Text style={styles.memberContact}>{member.phoneNumber}</Text>}
                    {(() => {
                      const validProperties = getValidPropertyIds(member.assignedProperties);
                      if (validProperties.length === 0) return null;
                      
                      return (
                        <View style={styles.propertiesChips}>
                          {validProperties.slice(0, 2).map(propId => {
                            const propertyName = getPropertyName(propId);
                            if (!propertyName) return null;
                            
                            return (
                              <View key={propId} style={styles.propertyChip}>
                                <Ionicons name="home" size={10} color="#10B981" />
                                <Text style={styles.propertyChipText}>
                                  {propertyName}
                                </Text>
                              </View>
                            );
                          })}
                          {validProperties.length > 2 && (
                            <Text style={styles.morePropertiesText}>
                              +{validProperties.length - 2} more
                            </Text>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                </View>
                
                <View style={styles.memberActions}>
                  <TouchableOpacity 
                    style={[styles.statusBadge, member.status === 'active' ? styles.activeStatus : styles.inactiveStatus]}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleToggleStatus(member.id);
                    }}
                  >
                    <Text style={styles.statusText}>
                      {member.status === 'active' ? 'Active' : 'Inactive'}
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={(e) => {
                    e.stopPropagation();
                    handleRemoveTeamMember(member.id);
                  }}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Secondary Cleaners Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person" size={20} color="#3B82F6" />
            <Text style={styles.sectionTitle}>Secondary Cleaners</Text>
            <Text style={styles.sectionCount}>({secondaryCleaners.length})</Text>
          </View>
          
          {secondaryCleaners.length === 0 ? (
            <Text style={styles.emptyText}>No secondary cleaners added yet</Text>
          ) : (
            secondaryCleaners.map(member => (
              <TouchableOpacity 
                key={member.id} 
                style={styles.memberCard}
                onPress={() => handleMemberClick(member)}
              >
                <View style={styles.memberInfo}>
                  <TouchableOpacity 
                    style={[styles.roleIndicator, { backgroundColor: getRoleColor(member.role) }]}
                    onPress={() => handleChangeRole(member.id, member.role)}
                  >
                    <Ionicons name={getRoleIcon(member.role) as any} size={16} color="white" />
                  </TouchableOpacity>
                  <View style={styles.memberDetails}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#CBD5E1" style={{ marginLeft: 6 }} />
                    </View>
                    {member.email && <Text style={styles.memberContact}>{member.email}</Text>}
                    {member.phoneNumber && <Text style={styles.memberContact}>{member.phoneNumber}</Text>}
                    {(() => {
                      const validProperties = getValidPropertyIds(member.assignedProperties);
                      if (validProperties.length === 0) return null;
                      
                      return (
                        <View style={styles.propertiesChips}>
                          {validProperties.slice(0, 2).map(propId => {
                            const propertyName = getPropertyName(propId);
                            if (!propertyName) return null;
                            
                            return (
                              <View key={propId} style={styles.propertyChip}>
                                <Ionicons name="home" size={10} color="#3B82F6" />
                                <Text style={styles.propertyChipText}>
                                  {propertyName}
                                </Text>
                              </View>
                            );
                          })}
                          {validProperties.length > 2 && (
                            <Text style={styles.morePropertiesText}>
                              +{validProperties.length - 2} more
                            </Text>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                </View>
                
                <View style={styles.memberActions}>
                  <TouchableOpacity 
                    style={[styles.statusBadge, member.status === 'active' ? styles.activeStatus : styles.inactiveStatus]}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleToggleStatus(member.id);
                    }}
                  >
                    <Text style={styles.statusText}>
                      {member.status === 'active' ? 'Active' : 'Inactive'}
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={(e) => {
                    e.stopPropagation();
                    handleRemoveTeamMember(member.id);
                  }}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Trash Services Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trash" size={20} color="#8B5CF6" />
            <Text style={styles.sectionTitle}>Trash Services</Text>
            <Text style={styles.sectionCount}>({trashServices.length})</Text>
          </View>
          
          {trashServices.length === 0 ? (
            <Text style={styles.emptyText}>No trash services added yet</Text>
          ) : (
            trashServices.map(member => (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberInfo}>
                  <View style={[styles.roleIndicator, { backgroundColor: getRoleColor(member.role) }]}>
                    <Ionicons name={getRoleIcon(member.role) as any} size={16} color="white" />
                  </View>
                  <View style={styles.memberDetails}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    {member.email && <Text style={styles.memberContact}>{member.email}</Text>}
                    {member.phoneNumber && <Text style={styles.memberContact}>{member.phoneNumber}</Text>}
                  </View>
                </View>
                
                <View style={styles.memberActions}>
                  <TouchableOpacity 
                    style={[styles.statusBadge, member.status === 'active' ? styles.activeStatus : styles.inactiveStatus]}
                    onPress={() => handleToggleStatus(member.id)}
                  >
                    <Text style={styles.statusText}>
                      {member.status === 'active' ? 'Active' : 'Inactive'}
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={() => handleRemoveTeamMember(member.id)}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
        
          <View style={styles.tipContainer}>
            <Ionicons name="information-circle" size={20} color="#64748B" />
            <Text style={styles.tipText}>
              Tap cleaner names to assign properties. Tap role icons to switch between Primary and Secondary. Use Calendar view to see and start cleaning jobs.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Job Selection Modal for multiple jobs on same day */}
      <Modal
        visible={showJobSelectionModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowJobSelectionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Job to Start</Text>
              <TouchableOpacity onPress={() => setShowJobSelectionModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.jobSelectionList}>
              {selectedDayJobs.map((job) => (
                <TouchableOpacity
                  key={job.id}
                  style={styles.jobSelectionItem}
                  onPress={() => {
                    setShowJobSelectionModal(false);
                    handleStartJob(job);
                  }}
                >
                  <View style={[styles.jobStatusIndicator, { backgroundColor: getStatusColor(job.status) }]} />
                  <View style={styles.jobSelectionContent}>
                    <Text style={styles.jobSelectionAddress}>
                      {job.address}
                    </Text>
                    <Text style={styles.jobSelectionTime}>
                      {job.preferredTime || '10:00 AM'}
                    </Text>
                    <Text style={styles.jobSelectionCleaner}>
                      Cleaner: {(job.assignedCleanerName || (job.cleanerFirstName && job.cleanerLastName))
                        ? (job.assignedCleanerName || `${job.cleanerFirstName} ${job.cleanerLastName}`)
                        : 'Not assigned'}
                    </Text>
                    {job.guestName && (
                      <Text style={styles.jobSelectionGuest}>
                        Guest: {job.guestName}
                      </Text>
                    )}
                    <View style={styles.jobSelectionStatus}>
                      <Text style={[styles.jobSelectionStatusText, { color: getStatusColor(job.status) }]}>
                        {job.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Property Assignment Modal */}
      <Modal
        visible={showAssignPropertiesModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAssignPropertiesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Properties</Text>
              <TouchableOpacity onPress={() => setShowAssignPropertiesModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            
            {selectedMember && (
              <>
                <View style={styles.selectedMemberInfo}>
                  <View style={[styles.roleIndicator, { backgroundColor: getRoleColor(selectedMember.role) }]}>
                    <Ionicons name={getRoleIcon(selectedMember.role) as any} size={16} color="white" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedMemberName}>{selectedMember.name}</Text>
                    <Text style={styles.selectedMemberRole}>{getRoleLabel(selectedMember.role)}</Text>
                  </View>
                </View>

                {selectedMember.role === 'secondary_cleaner' && (
                  <View style={styles.infoBox}>
                    <Ionicons name="information-circle" size={16} color="#3B82F6" />
                    <Text style={styles.infoText}>
                      Secondary cleaners are backups and won't see cleaning jobs unless reassigned as primary.
                    </Text>
                  </View>
                )}

                <ScrollView style={styles.propertiesList}>
                  {properties.length === 0 ? (
                    <Text style={styles.emptyText}>No properties available. Add properties first.</Text>
                  ) : (
                    properties.map(property => (
                      <TouchableOpacity
                        key={property.id}
                        style={styles.propertyItem}
                        onPress={() => {
                          setMemberProperties(prev => ({
                            ...prev,
                            [property.id]: !prev[property.id]
                          }));
                        }}
                      >
                        <View style={styles.checkbox}>
                          {memberProperties[property.id] && (
                            <Ionicons name="checkmark" size={16} color="white" />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.propertyLabel}>{property.label || 'Property'}</Text>
                          <Text style={styles.propertyAddress}>{property.address}</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>

                <TouchableOpacity 
                  style={[styles.submitButton, loading && styles.buttonDisabled]}
                  onPress={handleSavePropertyAssignments}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.submitButtonText}>Save Assignments</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Add Member Modal */}
      <Modal
        visible={showAddMemberModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddMemberModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Team Member</Text>
              <TouchableOpacity onPress={() => setShowAddMemberModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            
            <ScrollView>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Role</Text>
                <View style={styles.roleButtons}>
                  {(['primary_cleaner', 'secondary_cleaner', 'trash_service'] as const).map(role => (
                    <TouchableOpacity
                      key={role}
                      style={[styles.roleButton, memberRole === role && styles.roleButtonActive]}
                      onPress={() => setMemberRole(role)}
                    >
                      <Ionicons 
                        name={getRoleIcon(role) as any} 
                        size={20} 
                        color={memberRole === role ? 'white' : '#64748B'} 
                      />
                      <Text style={[styles.roleButtonText, memberRole === role && styles.roleButtonTextActive]}>
                        {getRoleLabel(role)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={memberName}
                  onChangeText={setMemberName}
                  placeholder="Enter member name"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={memberEmail}
                  onChangeText={setMemberEmail}
                  placeholder="member@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={memberPhone}
                  onChangeText={setMemberPhone}
                  placeholder="(123) 456-7890"
                  keyboardType="phone-pad"
                />
              </View>
              
              <TouchableOpacity 
                style={[styles.submitButton, loading && styles.buttonDisabled]}
                onPress={handleAddTeamMember}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.submitButtonText}>Add to Team</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  scrollContent: {
    paddingBottom: Platform.OS === 'ios' ? 90 : 80,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewToggle: {
    backgroundColor: '#E3F2FD',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E88E5',
  },
  viewToggleActive: {
    backgroundColor: '#1E88E5',
  },
  viewToggleText: {
    color: '#1E88E5',
    fontWeight: '600',
    marginLeft: 4,
    fontSize: 12,
  },
  viewToggleTextActive: {
    color: 'white',
  },
  addButton: {
    backgroundColor: '#1E88E5',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: 'white',
    fontWeight: '600',
    marginLeft: 4,
    fontSize: 12,
  },
  // Calendar styles
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E88E5',
    paddingVertical: 20,
    paddingHorizontal: 24,
    shadowColor: '#1E88E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  headerCenter: {
    alignItems: 'center'
  },
  monthYear: {
    fontSize: 22,
    fontWeight: '700',
    color: 'white',
    letterSpacing: 0.5,
  },
  todayButton: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    marginTop: 6,
    fontWeight: '600',
    textDecorationLine: 'underline'
  },
  navButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayNamesContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dayNameCell: {
    flex: 1,
    alignItems: 'center'
  },
  dayNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dayCell: {
    width: '14.28%',
    height: Platform.OS === 'web' ? 42 : 38,
    borderWidth: 0,
    padding: 3,
    backgroundColor: 'white',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  otherMonthDay: {
    backgroundColor: '#F8FAFC'
  },
  todayCell: {
    backgroundColor: '#E0F2FE'
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A'
  },
  otherMonthDayNumber: {
    color: '#CBD5E1'
  },
  todayNumber: {
    fontWeight: '700',
    color: '#0369A1'
  },
  cleaningInfo: {
    marginTop: 2,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  cleaningIndicators: {
    flexDirection: 'row',
    marginBottom: 1,
    justifyContent: 'center'
  },
  cleaningDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 0.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  moreIndicator: {
    fontSize: 7,
    color: '#1E88E5',
    marginLeft: 1,
    fontWeight: '700'
  },
  cleaningTime: {
    fontSize: 7,
    color: '#1E88E5',
    fontWeight: '700',
    marginTop: 0.5,
    textAlign: 'center'
  },
  cleanerName: {
    fontSize: 6,
    color: '#64748B',
    marginTop: 0.5,
    fontWeight: '600',
    textAlign: 'center'
  },
  multipleCleanings: {
    fontSize: 7,
    color: '#F59E0B',
    fontWeight: '700',
    marginTop: 1,
    textAlign: 'center'
  },
  upcomingSection: {
    backgroundColor: '#FFFFFF',
    marginTop: 24,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  upcomingSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  noJobsText: {
    fontSize: 15,
    color: '#94A3B8',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 24
  },
  jobCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  statusIndicator: {
    width: 4,
    marginRight: 12,
    borderRadius: 2
  },
  jobCardContent: {
    flex: 1
  },
  jobAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5
  },
  jobCardDetails: {
    marginBottom: 5
  },
  jobDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2
  },
  cleanerAssigned: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: '500'
  },
  guestInfo: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
    fontStyle: 'italic'
  },
  jobCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  jobType: {
    fontSize: 12,
    color: '#999',
    textTransform: 'capitalize'
  },
  // Job selection modal styles
  jobSelectionList: {
    maxHeight: 300,
  },
  jobSelectionItem: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  jobStatusIndicator: {
    width: 4,
    marginRight: 12,
    borderRadius: 2,
  },
  jobSelectionContent: {
    flex: 1,
  },
  jobSelectionAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8,
  },
  jobSelectionTime: {
    fontSize: 14,
    color: '#1E88E5',
    fontWeight: '600',
    marginBottom: 4,
  },
  jobSelectionCleaner: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  jobSelectionGuest: {
    fontSize: 13,
    color: '#64748B',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  jobSelectionStatus: {
    alignSelf: 'flex-start',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  jobSelectionStatusText: {
    fontSize: 11,
    color: '#1E88E5',
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#334155',
    marginLeft: 8,
  },
  sectionCount: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 4,
  },
  memberCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  memberInfo: {
    flexDirection: 'row',
    flex: 1,
  },
  roleIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memberDetails: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 2,
  },
  memberContact: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  propertiesChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  propertyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  propertyChipText: {
    fontSize: 11,
    color: '#10B981',
    marginLeft: 4,
  },
  morePropertiesText: {
    fontSize: 11,
    color: '#64748B',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  activeStatus: {
    backgroundColor: '#DCFCE7',
  },
  inactiveStatus: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  tipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 8,
  },
  tipText: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 8,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '90%',
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  selectedMemberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: 16,
  },
  selectedMemberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  selectedMemberRole: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 13,
    color: '#3B82F6',
    marginLeft: 8,
    flex: 1,
  },
  propertiesList: {
    maxHeight: 300,
    marginBottom: 16,
  },
  propertyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E88E5',
  },
  propertyLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  propertyAddress: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: 'white',
  },
  roleButtonActive: {
    backgroundColor: '#1E88E5',
    borderColor: '#1E88E5',
  },
  roleButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginLeft: 6,
  },
  roleButtonTextActive: {
    color: 'white',
  },
  submitButton: {
    backgroundColor: '#1E88E5',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
