import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Alert
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { doc, getDoc, collection, query, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { assignCleaningJob } from '../../services/cleaningJobsService';

type AssignCleanerRouteProp = RouteProp<{ params: { cleaningJobId: string } }, 'params'>;

interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email?: string;
  phoneNumber?: string;
  role: string;
  rating?: number;
  completedJobs?: number;
  addedAt: number;
  status: string;
}

interface CleaningJobInfo {
  id: string;
  address: string;
  preferredDate?: number;
  preferredTime?: string;
  guestName?: string;
  cleaningType?: string;
}

const AssignCleanerScreen: React.FC = () => {
  const route = useRoute<AssignCleanerRouteProp>();
  const navigation = useNavigation<any>();
  const user = useAuthStore(s => s.user);
  const { cleaningJobId } = route.params;
  
  const [cleaningJob, setCleaningJob] = useState<CleaningJobInfo | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    fetchCleaningJob();
    fetchTeamMembers();
  }, [cleaningJobId]);

  const fetchCleaningJob = async () => {
    try {
      const jobDoc = await getDoc(doc(db, 'cleaningJobs', cleaningJobId));
      if (jobDoc.exists()) {
        const jobData = { id: jobDoc.id, ...jobDoc.data() } as CleaningJobInfo;
        setCleaningJob(jobData);
      }
    } catch (error) {
      console.error('Error fetching cleaning job:', error);
      Alert.alert('Error', 'Failed to load cleaning job details');
    }
  };

  const fetchTeamMembers = async () => {
    if (!user?.uid) return;
    
    try {
      // Fetch team members from the host's subcollection
      const teamMembersRef = collection(db, 'users', user.uid, 'teamMembers');
      const teamSnapshot = await getDocs(teamMembersRef);
      
      const members: TeamMember[] = [];
      teamSnapshot.forEach((doc) => {
        const memberData = { id: doc.id, ...doc.data() } as TeamMember;
        // Only include active team members
        if (memberData.status === 'active') {
          members.push(memberData);
        }
      });
      
      // Sort by rating and completed jobs
      members.sort((a, b) => {
        // Prioritize by rating first
        const ratingDiff = (b.rating || 0) - (a.rating || 0);
        if (ratingDiff !== 0) return ratingDiff;
        // Then by completed jobs
        return (b.completedJobs || 0) - (a.completedJobs || 0);
      });
      
      setTeamMembers(members);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching team members:', error);
      Alert.alert('Error', 'Failed to load team members');
      setLoading(false);
    }
  };

  const handleAssignCleaner = async (member?: TeamMember) => {
    const memberToAssign = member || selectedMember;
    if (!memberToAssign) {
      Alert.alert('No Selection', 'Please select a team member to assign');
      return;
    }

    setAssigning(true);
    try {
      // Update the cleaning job with the assigned cleaner
      await assignCleaningJob(
        cleaningJobId,
        memberToAssign.userId,
        memberToAssign.name
      );
      
      Alert.alert(
        'Success', 
        `${memberToAssign.name} has been assigned to this cleaning job`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );
    } catch (error) {
      console.error('Error assigning cleaner:', error);
      Alert.alert('Error', 'Failed to assign cleaner');
      setAssigning(false);
    }
  };

  const handleMemberSelect = (member: TeamMember) => {
    if (selectedMember?.id === member.id) {
      // If already selected, deselect
      setSelectedMember(null);
    } else {
      // Select the member and show confirmation
      setSelectedMember(member);
      Alert.alert(
        'Assign Cleaner',
        `Do you want to assign ${member.name} to this cleaning job?`,
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Assign Now',
            onPress: () => handleAssignCleaner(member)
          }
        ]
      );
    }
  };

  const formatDate = (timestamp: number | undefined) => {
    if (!timestamp) return 'Date not set';
    const date = new Date(timestamp);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E88E5" />
          <Text style={styles.loadingText}>Loading team members...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Assign Team Member</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Job Info Card */}
        {cleaningJob && (
          <View style={styles.jobInfoCard}>
            <View style={styles.jobInfoHeader}>
              <Ionicons name="briefcase" size={20} color="#1E88E5" />
              <Text style={styles.jobInfoTitle}>Job Details</Text>
            </View>
            <View style={styles.jobInfoContent}>
              <View style={styles.jobDetailRow}>
                <Ionicons name="location" size={16} color="#64748B" />
                <Text style={styles.jobDetailText} numberOfLines={2}>{cleaningJob.address}</Text>
              </View>
              <View style={styles.jobDetailRow}>
                <Ionicons name="calendar" size={16} color="#64748B" />
                <Text style={styles.jobDetailText}>
                  {formatDate(cleaningJob.preferredDate)} at {cleaningJob.preferredTime || '10:00 AM'}
                </Text>
              </View>
              {cleaningJob.guestName && (
                <View style={styles.jobDetailRow}>
                  <Ionicons name="person" size={16} color="#64748B" />
                  <Text style={styles.jobDetailText}>Guest: {cleaningJob.guestName}</Text>
                </View>
              )}
              {cleaningJob.cleaningType && (
                <View style={styles.jobDetailRow}>
                  <Ionicons name="brush" size={16} color="#64748B" />
                  <Text style={styles.jobDetailText}>Type: {cleaningJob.cleaningType}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Team Members Section */}
        <View style={styles.teamSection}>
          <Text style={styles.sectionTitle}>Select a Team Member</Text>
          
          {teamMembers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyText}>No team members available</Text>
              <Text style={styles.emptySubtext}>
                Add team members by posting a recruitment and accepting cleaner bids
              </Text>
            </View>
          ) : (
            teamMembers.map((member) => (
              <TouchableOpacity
                key={member.id}
                style={[
                  styles.memberCard,
                  selectedMember?.id === member.id && styles.selectedMemberCard
                ]}
                onPress={() => handleMemberSelect(member)}
              >
                <View style={styles.memberHeader}>
                  <View style={styles.memberInfo}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>
                        {member.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.memberDetails}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      <Text style={styles.memberRole}>
                        {member.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Text>
                    </View>
                  </View>
                  {selectedMember?.id === member.id && (
                    <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                  )}
                </View>
                
                <View style={styles.memberStats}>
                  <View style={styles.statItem}>
                    <Ionicons name="star" size={14} color="#F59E0B" />
                    <Text style={styles.statText}>
                      {member.rating ? member.rating.toFixed(1) : 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="briefcase" size={14} color="#64748B" />
                    <Text style={styles.statText}>
                      {member.completedJobs || 0} jobs
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="calendar" size={14} color="#64748B" />
                    <Text style={styles.statText}>
                      Joined {new Date(member.addedAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                
                {member.phoneNumber && (
                  <View style={styles.contactInfo}>
                    <Ionicons name="call-outline" size={14} color="#64748B" />
                    <Text style={styles.contactText}>{member.phoneNumber}</Text>
                  </View>
                )}
                
                {member.email && (
                  <View style={styles.contactInfo}>
                    <Ionicons name="mail-outline" size={14} color="#64748B" />
                    <Text style={styles.contactText}>{member.email}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* Assign Button */}
      {teamMembers.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.assignButton,
              (!selectedMember || assigning) && styles.assignButtonDisabled
            ]}
            onPress={() => handleAssignCleaner()}
            disabled={!selectedMember || assigning}
          >
            {assigning ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="white" />
                <Text style={styles.assignButtonText}>
                  {selectedMember ? `Assign ${selectedMember.name}` : 'Select a Team Member'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748B'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  backButton: {
    padding: 4,
    marginRight: 12
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A'
  },
  jobInfoCard: {
    backgroundColor: 'white',
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden'
  },
  jobInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  jobInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginLeft: 8
  },
  jobInfoContent: {
    padding: 16
  },
  jobDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10
  },
  jobDetailText: {
    fontSize: 14,
    color: '#334155',
    marginLeft: 10,
    flex: 1
  },
  teamSection: {
    paddingHorizontal: 16,
    paddingBottom: 100
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 12
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 24
  },
  memberCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB'
  },
  selectedMemberCard: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4'
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E88E5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  memberAvatarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700'
  },
  memberDetails: {
    marginLeft: 12
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A'
  },
  memberRole: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2
  },
  memberStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 8
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  statText: {
    fontSize: 13,
    color: '#475569'
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6
  },
  contactText: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 6
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  assignButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  assignButtonDisabled: {
    backgroundColor: '#94A3B8'
  },
  assignButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8
  }
});

export default AssignCleanerScreen;
