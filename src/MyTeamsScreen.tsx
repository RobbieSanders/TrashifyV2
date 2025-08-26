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
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from './authStore';
import { TeamMember } from './types';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

export function MyTeamsScreen({ navigation }: any) {
  const user = useAuthStore(s => s.user);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form fields for adding team member
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberRole, setMemberRole] = useState<'primary_cleaner' | 'secondary_cleaner' | 'trash_service'>('primary_cleaner');

  // Subscribe to team members
  useEffect(() => {
    if (!db || !user?.uid) return;

    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      const userData = snapshot.data();
      if (userData?.myTeam) {
        setTeamMembers(userData.myTeam);
      } else {
        setTeamMembers([]);
      }
    }, (error) => {
      console.error('[MyTeamsScreen] Error loading team:', error);
      setTeamMembers([]);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Add team member
  const handleAddTeamMember = async () => {
    if (!memberName.trim()) {
      Alert.alert('Missing Information', 'Please enter team member name');
      return;
    }

    if (!user?.uid) return;

    setLoading(true);
    try {
      const newMember: TeamMember = {
        id: `member_${Date.now()}`,
        userId: '', // Will be filled when cleaner accepts invitation
        name: memberName.trim(),
        role: memberRole,
        addedAt: Date.now(),
        phoneNumber: memberPhone.trim(),
        email: memberEmail.trim(),
        status: 'active',
        rating: 0,
        completedJobs: 0
      };

      const userRef = doc(db, 'users', user.uid);
      const updatedTeam = [...teamMembers, newMember];
      
      await updateDoc(userRef, {
        myTeam: updatedTeam
      });

      Alert.alert('Success', `${memberName} has been added to your team!`);
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

  // Remove team member
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
              const userRef = doc(db, 'users', user.uid);
              const updatedTeam = teamMembers.filter(m => m.id !== memberId);
              
              await updateDoc(userRef, {
                myTeam: updatedTeam
              });
              
              Alert.alert('Success', 'Team member removed');
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
    
    try {
      const userRef = doc(db, 'users', user.uid);
      const updatedTeam = teamMembers.map(member => {
        if (member.id === memberId) {
          return {
            ...member,
            status: member.status === 'active' ? 'inactive' : 'active'
          };
        }
        return member;
      });
      
      await updateDoc(userRef, {
        myTeam: updatedTeam
      });
    } catch (error) {
      console.error('Error toggling member status:', error);
      Alert.alert('Error', 'Failed to update member status');
    }
  };

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

  // Group members by role
  const primaryCleaners = teamMembers.filter(m => m.role === 'primary_cleaner');
  const secondaryCleaners = teamMembers.filter(m => m.role === 'secondary_cleaner');
  const trashServices = teamMembers.filter(m => m.role === 'trash_service');

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>My Team</Text>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setShowAddMemberModal(true)}
          >
            <Ionicons name="person-add" size={24} color="white" />
            <Text style={styles.addButtonText}>Add Member</Text>
          </TouchableOpacity>
        </View>

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
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberInfo}>
                  <View style={[styles.roleIndicator, { backgroundColor: getRoleColor(member.role) }]}>
                    <Ionicons name={getRoleIcon(member.role) as any} size={16} color="white" />
                  </View>
                  <View style={styles.memberDetails}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    {member.email && <Text style={styles.memberContact}>{member.email}</Text>}
                    {member.phoneNumber && <Text style={styles.memberContact}>{member.phoneNumber}</Text>}
                    <View style={styles.memberStats}>
                      {member.rating ? (
                        <View style={styles.stat}>
                          <Ionicons name="star" size={12} color="#F59E0B" />
                          <Text style={styles.statText}>{member.rating.toFixed(1)}</Text>
                        </View>
                      ) : null}
                      {member.completedJobs ? (
                        <View style={styles.stat}>
                          <Ionicons name="checkmark-done" size={12} color="#10B981" />
                          <Text style={styles.statText}>{member.completedJobs} jobs</Text>
                        </View>
                      ) : null}
                    </View>
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
      </ScrollView>

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
              {/* Role Selection */}
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
              
              {/* Name Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={memberName}
                  onChangeText={setMemberName}
                  placeholder="Enter member name"
                />
              </View>
              
              {/* Email Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={memberEmail}
                  onChangeText={setMemberEmail}
                  placeholder="member@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              
              {/* Phone Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone (Optional)</Text>
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
  addButton: {
    backgroundColor: '#1E88E5',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonText: {
    color: 'white',
    fontWeight: '600',
    marginLeft: 6,
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
  memberStats: {
    flexDirection: 'row',
    marginTop: 6,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  statText: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 4,
  },
  memberActions: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
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
    color: '#0F172A',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
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
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: 'white',
  },
  roleButtons: {
    flexDirection: 'column',
    gap: 8,
  },
  roleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  roleButtonActive: {
    backgroundColor: '#1E88E5',
    borderColor: '#1E88E5',
  },
  roleButtonText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
    marginLeft: 8,
  },
  roleButtonTextActive: {
    color: 'white',
  },
  submitButton: {
    backgroundColor: '#1E88E5',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
