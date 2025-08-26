import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  orderBy,
  limit,
  addDoc,
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile, ActivityLogEntry } from './userService';
import { Job, UserStats, ActivityLog } from './types';
import { useAuthStore } from './authStore';

interface AdminStats {
  totalHosts: number;
  totalWorkers: number;
  totalCustomerService: number;
  totalAdmins: number;
  totalScheduledPickups: number;
  completedPickups: number;
  cancelledPickups: number;
  recurringPickups: number;
  activeUsers: number;
  deactivatedUsers: number;
}

export function AdminDashboard({ navigation }: any) {
  const currentUser = useAuthStore(s => s.user);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'jobs' | 'reports' | 'activity'>('overview');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<AdminStats>({
    totalHosts: 0,
    totalWorkers: 0,
    totalCustomerService: 0,
    totalAdmins: 0,
    totalScheduledPickups: 0,
    completedPickups: 0,
    cancelledPickups: 0,
    recurringPickups: 0,
    activeUsers: 0,
    deactivatedUsers: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  // Check admin permissions
  const isSuper = currentUser?.role === 'super_admin';
  const isManager = currentUser?.role === 'manager_admin';
  const canEditUsers = isSuper || isManager;
  const canDeleteUsers = isSuper;
  const canChangeRoles = isSuper;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData = usersSnapshot.docs.map(doc => ({
        ...doc.data(),
        uid: doc.id
      } as UserProfile));
      setUsers(usersData);

      // Load jobs
      const jobsSnapshot = await getDocs(collection(db, 'jobs'));
      const jobsData = jobsSnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as Job));
      setJobs(jobsData);

      // Load activity logs - handle if collection doesn't exist
      try {
        const logsQuery = query(
          collection(db, 'activityLogs'),
          orderBy('timestamp', 'desc'),
          limit(100)
        );
        
        // Use onSnapshot with error handler to silently fallback
        const unsubscribe = onSnapshot(
          logsQuery, 
          (snapshot) => {
            const logsData = snapshot.docs.map(doc => ({
              ...doc.data(),
              id: doc.id
            } as ActivityLog));
            setActivityLogs(logsData);
            unsubscribe(); // Unsubscribe after getting data
          },
          (error) => {
            // Silently fallback to simpler query without orderBy if index is missing
            const fallbackQuery = query(
              collection(db, 'activityLogs'),
              limit(100)
            );
            
            getDocs(fallbackQuery).then(snapshot => {
              const logsData = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id
              } as ActivityLog));
              // Sort manually
              logsData.sort((a, b) => {
                const aTime = a.timestamp || 0;
                const bTime = b.timestamp || 0;
                return bTime - aTime;
              });
              setActivityLogs(logsData);
            }).catch(() => {
              // Collection doesn't exist yet
              setActivityLogs([]);
            });
          }
        );
      } catch (error) {
        // Collection doesn't exist yet
        setActivityLogs([]);
      }

      // Calculate stats
      calculateStats(usersData, jobsData);
    } catch (error) {
      console.error('Error loading admin data:', error);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (users: UserProfile[], jobs: Job[]) => {
    const stats: AdminStats = {
      totalHosts: users.filter(u => u.role === 'host').length,
      totalWorkers: users.filter(u => u.role === 'worker').length,
      totalCustomerService: users.filter(u => u.role === 'customer_service').length,
      totalAdmins: users.filter(u => 
        u.role === 'admin' || u.role === 'manager_admin' || u.role === 'super_admin'
      ).length,
      totalScheduledPickups: jobs.filter(j => 
        j.status === 'open' || j.status === 'accepted' || j.status === 'in_progress'
      ).length,
      completedPickups: jobs.filter(j => j.status === 'completed').length,
      cancelledPickups: jobs.filter(j => j.status === 'cancelled').length,
      recurringPickups: jobs.filter(j => j.isRecurring).length,
      activeUsers: users.filter(u => !u.deactivated).length,
      deactivatedUsers: users.filter(u => u.deactivated).length
    };
    setStats(stats);
  };

  const logActivity = async (
    userId: string,
    action: string,
    details?: string,
    changes?: Record<string, any>
  ) => {
    try {
      await addDoc(collection(db, 'activityLogs'), {
        userId,
        action,
        performedBy: currentUser?.uid || 'system',
        performedByName: `${currentUser?.firstName} ${currentUser?.lastName}`,
        timestamp: serverTimestamp(),
        details,
        changes
      });
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    if (!canChangeRoles) {
      Alert.alert('Permission Denied', 'You do not have permission to change user roles');
      return;
    }

    try {
      const userRef = doc(db, 'users', userId);
      const oldUser = users.find(u => u.uid === userId);
      
      await updateDoc(userRef, {
        role: newRole,
        updatedAt: serverTimestamp()
      });

      await logActivity(
        userId,
        'ROLE_CHANGED',
        `Role changed from ${oldUser?.role} to ${newRole}`,
        { oldRole: oldUser?.role, newRole }
      );

      Alert.alert('Success', 'User role updated successfully');
      loadData();
    } catch (error) {
      console.error('Error updating user role:', error);
      Alert.alert('Error', 'Failed to update user role');
    }
  };

  const deactivateUser = async (userId: string) => {
    if (!canDeleteUsers) {
      Alert.alert('Permission Denied', 'You do not have permission to deactivate users');
      return;
    }

    Alert.alert(
      'Confirm Deactivation',
      'Are you sure you want to deactivate this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              const userRef = doc(db, 'users', userId);
              await updateDoc(userRef, {
                deactivated: true,
                updatedAt: serverTimestamp()
              });

              await logActivity(userId, 'USER_DEACTIVATED', 'User account deactivated');

              Alert.alert('Success', 'User deactivated successfully');
              loadData();
            } catch (error) {
              console.error('Error deactivating user:', error);
              Alert.alert('Error', 'Failed to deactivate user');
            }
          }
        }
      ]
    );
  };

  const reactivateUser = async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        deactivated: false,
        updatedAt: serverTimestamp()
      });

      await logActivity(userId, 'USER_REACTIVATED', 'User account reactivated');

      Alert.alert('Success', 'User reactivated successfully');
      loadData();
    } catch (error) {
      console.error('Error reactivating user:', error);
      Alert.alert('Error', 'Failed to reactivate user');
    }
  };

  const getUserStats = (userId: string): UserStats => {
    const userJobs = jobs.filter(j => 
      j.hostId === userId || j.workerId === userId
    );

    const completedJobs = userJobs.filter(j => j.status === 'completed').length;
    const cancelledJobs = userJobs.filter(j => j.status === 'cancelled').length;
    const totalJobs = userJobs.length;

    return {
      totalJobs,
      completedJobs,
      cancelledJobs,
      acceptanceRate: totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0,
      averageCompletionTime: 0, // Would need to calculate from job timestamps
      rating: 0, // Would need rating system
      lastActiveDate: Date.now()
    };
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    
    return matchesSearch && matchesRole;
  });

  const renderOverview = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={styles.sectionTitle}>System Overview</Text>
      
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <View style={styles.statCardInner}>
            <Ionicons name="people" size={24} color="#1E88E5" />
            <Text style={styles.statNumber}>{stats.activeUsers}</Text>
            <Text style={styles.statLabel}>Active Users</Text>
          </View>
        </View>
        
        <View style={styles.statCard}>
          <View style={styles.statCardInner}>
            <Ionicons name="home" size={24} color="#10B981" />
            <Text style={styles.statNumber}>{stats.totalHosts}</Text>
            <Text style={styles.statLabel}>Hosts</Text>
          </View>
        </View>
        
        <View style={styles.statCard}>
          <View style={styles.statCardInner}>
            <Ionicons name="briefcase" size={24} color="#F59E0B" />
            <Text style={styles.statNumber}>{stats.totalWorkers}</Text>
            <Text style={styles.statLabel}>Workers</Text>
          </View>
        </View>
        
        <View style={styles.statCard}>
          <View style={styles.statCardInner}>
            <Ionicons name="shield" size={24} color="#EF4444" />
            <Text style={styles.statNumber}>{stats.totalAdmins}</Text>
            <Text style={styles.statLabel}>Admins</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Pickup Statistics</Text>
      
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <View style={styles.statCardInner}>
            <Ionicons name="calendar" size={24} color="#1E88E5" />
            <Text style={styles.statNumber}>{stats.totalScheduledPickups}</Text>
            <Text style={styles.statLabel}>Scheduled</Text>
          </View>
        </View>
        
        <View style={styles.statCard}>
          <View style={styles.statCardInner}>
            <Ionicons name="checkmark-circle" size={24} color="#10B981" />
            <Text style={styles.statNumber}>{stats.completedPickups}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>
        
        <View style={styles.statCard}>
          <View style={styles.statCardInner}>
            <Ionicons name="close-circle" size={24} color="#EF4444" />
            <Text style={styles.statNumber}>{stats.cancelledPickups}</Text>
            <Text style={styles.statLabel}>Cancelled</Text>
          </View>
        </View>
        
        <View style={styles.statCard}>
          <View style={styles.statCardInner}>
            <Ionicons name="refresh" size={24} color="#8B5CF6" />
            <Text style={styles.statNumber}>{stats.recurringPickups}</Text>
            <Text style={styles.statLabel}>Recurring</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Recent Activity</Text>
      {activityLogs.slice(0, 5).map((log) => (
        <View key={log.id} style={styles.activityItem}>
          <Text style={styles.activityText}>
            {log.performedByName || 'System'} {log.action.toLowerCase().replace(/_/g, ' ')}
          </Text>
          <Text style={styles.activityTime}>
            {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Unknown time'}
          </Text>
          {log.details && (
            <Text style={styles.activityDetails}>{log.details}</Text>
          )}
        </View>
      ))}
      {activityLogs.length === 0 && (
        <Text style={styles.muted}>No activity logs yet</Text>
      )}
    </ScrollView>
  );

  const renderUsers = () => (
    <View style={styles.tabContent}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color="#64748B" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
        {['all', 'host', 'worker', 'customer_service', 'admin', 'manager_admin', 'super_admin'].map(role => (
          <TouchableOpacity
            key={role}
            style={[
              styles.filterChip,
              filterRole === role && styles.filterChipActive
            ]}
            onPress={() => setFilterRole(role)}
          >
            <Text style={[
              styles.filterChipText,
              filterRole === role && styles.filterChipTextActive
            ]}>
              {role === 'all' ? 'All' : role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filteredUsers}
        keyExtractor={item => item.uid}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.userCard}
            onPress={() => {
              setSelectedUser(item);
              setShowUserModal(true);
            }}
          >
            <View style={styles.userCardHeader}>
              <View>
                <Text style={styles.userName}>
                  {item.firstName} {item.lastName}
                </Text>
                <Text style={styles.userEmail}>{item.email}</Text>
              </View>
              <View style={[
                styles.roleBadge,
                { backgroundColor: getRoleColor(item.role || 'host') }
              ]}>
                <Text style={styles.roleBadgeText}>
                  {item.role?.replace(/_/g, ' ').toUpperCase()}
                </Text>
              </View>
            </View>
            {item.deactivated && (
              <View style={styles.deactivatedBadge}>
                <Text style={styles.deactivatedText}>DEACTIVATED</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'super_admin': return '#DC2626';
      case 'manager_admin': return '#EA580C';
      case 'admin': return '#CA8A04';
      case 'customer_service': return '#0891B2';
      case 'worker': return '#059669';
      case 'host': return '#7C3AED';
      default: return '#6B7280';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1E88E5" />
        <Text style={styles.loadingText}>Loading admin data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'overview' && styles.activeTab]}
          onPress={() => setActiveTab('overview')}
        >
          <Ionicons name="speedometer" size={20} color={activeTab === 'overview' ? '#1E88E5' : '#64748B'} />
          <Text style={[styles.tabText, activeTab === 'overview' && styles.activeTabText]}>
            Overview
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && styles.activeTab]}
          onPress={() => setActiveTab('users')}
        >
          <Ionicons name="people" size={20} color={activeTab === 'users' ? '#1E88E5' : '#64748B'} />
          <Text style={[styles.tabText, activeTab === 'users' && styles.activeTabText]}>
            Users
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'activity' && styles.activeTab]}
          onPress={() => setActiveTab('activity')}
        >
          <Ionicons name="list" size={20} color={activeTab === 'activity' ? '#1E88E5' : '#64748B'} />
          <Text style={[styles.tabText, activeTab === 'activity' && styles.activeTabText]}>
            Activity
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'users' && renderUsers()}
      {activeTab === 'activity' && (
        <FlatList
          style={styles.tabContent}
          data={activityLogs}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.activityItem}>
              <Text style={styles.activityText}>
                {item.performedByName || 'System'} {item.action.toLowerCase().replace(/_/g, ' ')}
              </Text>
              <Text style={styles.activityTime}>
                {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Unknown time'}
              </Text>
              {item.details && (
                <Text style={styles.activityDetails}>{item.details}</Text>
              )}
            </View>
          )}
        />
      )}

      {selectedUser && (
        <Modal
          visible={showUserModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowUserModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>User Details</Text>
                <TouchableOpacity onPress={() => setShowUserModal(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView>
                <View style={styles.userDetailSection}>
                  <Text style={styles.sectionTitle}>Personal Information</Text>
                  <Text style={styles.detailText}>
                    Name: {selectedUser.firstName} {selectedUser.lastName}
                  </Text>
                  <Text style={styles.detailText}>
                    Email: {selectedUser.email}
                  </Text>
                  <Text style={styles.detailText}>
                    Phone: {selectedUser.phone || 'Not provided'}
                  </Text>
                  <Text style={styles.detailText}>
                    Role: {selectedUser.role?.replace(/_/g, ' ').toUpperCase()}
                  </Text>
                  <Text style={[styles.detailText, { 
                    color: selectedUser.deactivated ? '#EF4444' : '#10B981' 
                  }]}>
                    Status: {selectedUser.deactivated ? 'Deactivated' : 'Active'}
                  </Text>
                </View>

                {canEditUsers && (
                  <View style={styles.userDetailSection}>
                    <Text style={styles.sectionTitle}>Actions</Text>
                    
                    {canChangeRoles && (
                      <View style={{ marginBottom: 12 }}>
                        <Text style={styles.detailText}>Change Role:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          {['host', 'worker', 'customer_service', 'admin', 'manager_admin', 'super_admin']
                            .filter(role => role !== selectedUser.role)
                            .map(role => (
                              <TouchableOpacity
                                key={role}
                                style={styles.roleButton}
                                onPress={() => {
                                  updateUserRole(selectedUser.uid, role);
                                  setShowUserModal(false);
                                }}
                              >
                                <Text style={styles.roleButtonText}>
                                  {role.replace(/_/g, ' ').toUpperCase()}
                                </Text>
                              </TouchableOpacity>
                            ))
                          }
                        </ScrollView>
                      </View>
                    )}

                    <View style={styles.actionButtons}>
                      {selectedUser.deactivated ? (
                        <TouchableOpacity
                          style={[styles.actionButton, { backgroundColor: '#10B981' }]}
                          onPress={() => {
                            reactivateUser(selectedUser.uid);
                            setShowUserModal(false);
                          }}
                        >
                          <Text style={styles.actionButtonText}>Reactivate User</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[styles.actionButton, { backgroundColor: '#EF4444' }]}
                          onPress={() => {
                            deactivateUser(selectedUser.uid);
                            setShowUserModal(false);
                          }}
                        >
                          <Text style={styles.actionButtonText}>Deactivate User</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  loadingText: {
    marginTop: 16,
    color: '#64748B',
    fontSize: 16,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#1E88E5',
  },
  tabText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#1E88E5',
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  statCard: {
    width: '50%',
    padding: 8,
  },
  statCardInner: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  filterBar: {
    marginBottom: 12,
    maxHeight: 40,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#1E88E5',
    borderColor: '#1E88E5',
  },
  filterChipText: {
    fontSize: 14,
    color: '#64748B',
  },
  filterChipTextActive: {
    color: 'white',
  },
  userCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  userCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  userEmail: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '600',
  },
  deactivatedBadge: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FEE2E2',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  deactivatedText: {
    fontSize: 10,
    color: '#DC2626',
    fontWeight: '600',
  },
  activityItem: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  activityText: {
    fontSize: 14,
    color: '#0F172A',
  },
  activityTime: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  activityDetails: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    fontStyle: 'italic',
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
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
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
  userDetailSection: {
    marginBottom: 20,
  },
  detailText: {
    fontSize: 14,
    color: '#334155',
    marginBottom: 8,
  },
  muted: {
    color: '#64748B',
  },
  roleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
    marginRight: 8,
    marginTop: 8,
  },
  roleButtonText: {
    fontSize: 12,
    color: '#1E88E5',
    fontWeight: '600',
  },
  actionButtons: {
    marginTop: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});
