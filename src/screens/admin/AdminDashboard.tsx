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
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { UserProfile, ActivityLogEntry } from '../../services/userService';
import { Job, UserStats, ActivityLog } from '../../utils/types';
import { useAuthStore } from '../../stores/authStore';
import PropertyCleanupTool from '../../components/PropertyCleanupTool';
import { EmergencyCleaningDebugTool } from '../../components/EmergencyCleaningDebugTool';
import { SearchCleanersDebugTool } from '../../components/SearchCleanersDebugTool';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'jobs' | 'reports' | 'activity' | 'tools'>('overview');
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

  // Initial data load
  useEffect(() => {
    loadData();
  }, []); // Only run once on mount
  
  // Set up real-time listener for cleaning jobs
  useEffect(() => {
    if (!db) return;
    
    const cleaningJobsUnsubscribe = onSnapshot(
      collection(db, 'cleaningJobs'),
      (snapshot) => {
        const jobsData = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        } as Job));
        setJobs(jobsData);
      },
      (error) => {
        console.error('Error listening to cleaning jobs:', error);
      }
    );
    
    // Cleanup listener on unmount
    return () => {
      cleaningJobsUnsubscribe();
    };
  }, []); // Only set up listener once
  
  // Recalculate stats when users or jobs change
  useEffect(() => {
    if (users.length > 0 && jobs.length >= 0) {
      calculateStats(users, jobs);
    }
  }, [users, jobs]); // Recalculate when either changes

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

      // Load cleaning jobs (changed from 'jobs' to 'cleaningJobs')
      const cleaningJobsSnapshot = await getDocs(collection(db, 'cleaningJobs'));
      const jobsData = cleaningJobsSnapshot.docs.map(doc => ({
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
            <Ionicons name="trash" size={24} color="#F59E0B" />
            <Text style={styles.statNumber}>{stats.totalWorkers}</Text>
            <Text style={styles.statLabel}>Trash Services</Text>
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
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'tools' && styles.activeTab]}
          onPress={() => setActiveTab('tools')}
        >
          <Ionicons name="settings" size={20} color={activeTab === 'tools' ? '#1E88E5' : '#64748B'} />
          <Text style={[styles.tabText, activeTab === 'tools' && styles.activeTabText]}>
            Tools
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
      {activeTab === 'tools' && (
        <ScrollView 
          style={styles.tabContent}
          contentContainerStyle={styles.toolsScrollContent}
          showsVerticalScrollIndicator={true}
        >
          <Text style={styles.sectionTitle}>Admin Tools</Text>
          <PropertyCleanupTool />
          
          {/* Emergency Cleaning Debug Tool */}
          <EmergencyCleaningDebugTool />
          
          {/* SearchCleaners Debug Tool */}
          <SearchCleanersDebugTool />
          
          {/* Notification System Debug Tools */}
          <View style={styles.toolSection}>
            <Text style={styles.toolTitle}>🔔 Notification System Debug</Text>
            
            <TouchableOpacity 
              style={styles.debugButton}
              onPress={async () => {
                if (!currentUser?.uid) return;
                try {
                  const { default: DirectNotificationService } = await import('../../services/directNotificationService');
                  const notificationId = await DirectNotificationService.createTestNotification(currentUser.uid);
                  Alert.alert('Success', `Test notification created! ID: ${notificationId.substring(0, 8)}...`);
                } catch (error) {
                  Alert.alert('Error', 'Failed to create test notification');
                }
              }}
            >
              <Ionicons name="notifications" size={20} color="#fff" />
              <Text style={styles.debugButtonText}>Create Test Notification</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.debugButton, { backgroundColor: '#F59E0B' }]}
              onPress={async () => {
                if (!currentUser?.uid) return;
                try {
                  const { default: DirectNotificationService } = await import('../../services/directNotificationService');
                  const notificationId = await DirectNotificationService.createReviewNotification(
                    currentUser.uid,
                    'test-cleaner-123',
                    'Test Cleaner',
                    'test-job-456',
                    '123 Test Street'
                  );
                  Alert.alert('Success', `Review notification created! ID: ${notificationId.substring(0, 8)}...`);
                } catch (error) {
                  Alert.alert('Error', 'Failed to create review notification');
                }
              }}
            >
              <Ionicons name="star" size={20} color="#fff" />
              <Text style={styles.debugButtonText}>Create Review Notification</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.debugButton, { backgroundColor: '#8B5CF6' }]}
              onPress={async () => {
                if (!currentUser?.uid) return;
                try {
                  const { default: DirectNotificationService } = await import('../../services/directNotificationService');
                  await DirectNotificationService.debugNotifications(currentUser.uid);
                  Alert.alert('Debug Complete', 'Check console for notification debug info');
                } catch (error) {
                  Alert.alert('Error', 'Failed to debug notifications');
                }
              }}
            >
              <Ionicons name="bug" size={20} color="#fff" />
              <Text style={styles.debugButtonText}>Debug My Notifications</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.debugButton, { backgroundColor: '#DC2626' }]}
              onPress={async () => {
                if (!currentUser?.uid) return;
                try {
                  const { updateCleaningJobStatus } = await import('../../services/cleaningJobsService');
                  
                  // Create a test job first
                  const testJobRef = await addDoc(collection(db, 'cleaningJobs'), {
                    hostId: currentUser.uid,
                    assignedCleanerId: 'test-cleaner-123',
                    assignedCleanerName: 'Test Cleaner',
                    address: '123 Test Street, Test City, CA',
                    status: 'assigned',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    preferredDate: Date.now()
                  });
                  
                  // Mark it as completed to trigger notification
                  await updateCleaningJobStatus(testJobRef.id, 'completed');
                  
                  // Clean up the test job
                  await deleteDoc(doc(db, 'cleaningJobs', testJobRef.id));
                  
                  Alert.alert('Success', 'Test job completion flow executed! Check your notifications.');
                } catch (error) {
                  console.error('Test job completion error:', error);
                  Alert.alert('Error', 'Failed to test job completion flow');
                }
              }}
            >
              <Ionicons name="checkmark-done" size={20} color="#fff" />
              <Text style={styles.debugButtonText}>Test Job Completion Flow</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.debugButton, { backgroundColor: '#7C3AED' }]}
              onPress={async () => {
                if (!currentUser?.uid) return;
                try {
                  // Check recent completed jobs
                  const cleaningJobsRef = collection(db, 'cleaningJobs');
                  const completedJobsQuery = query(
                    cleaningJobsRef,
                    where('hostId', '==', currentUser.uid),
                    where('status', '==', 'completed'),
                    orderBy('updatedAt', 'desc')
                  );
                  
                  const completedJobsSnapshot = await getDocs(completedJobsQuery);
                  console.log(`\n🔍 DEBUGGING COMPLETED JOBS FOR HOST: ${currentUser.uid}`);
                  console.log(`📋 Found ${completedJobsSnapshot.size} completed jobs\n`);
                  
                  if (completedJobsSnapshot.empty) {
                    Alert.alert('Debug Result', 'No completed jobs found for this host');
                    return;
                  }
                  
                  let debugInfo = `Found ${completedJobsSnapshot.size} completed jobs:\n\n`;
                  
                  for (const jobDoc of completedJobsSnapshot.docs) {
                    const job = { id: jobDoc.id, ...jobDoc.data() } as any;
                    const cleanerId = job.assignedCleanerId || job.cleanerId || job.assignedTeamMemberId;
                    const cleanerName = job.assignedCleanerName || job.cleanerName || 
                                      (job.cleanerFirstName ? `${job.cleanerFirstName} ${job.cleanerLastName || ''}`.trim() : null);
                    
                    debugInfo += `Job: ${job.address}\n`;
                    debugInfo += `Cleaner: ${cleanerName || 'MISSING'} (${cleanerId || 'NO ID'})\n`;
                    debugInfo += `Completed: ${job.completedAt ? new Date(job.completedAt).toLocaleString() : 'No time'}\n\n`;
                    
                    console.log(`📝 Job: ${job.id}`);
                    console.log(`   Address: ${job.address}`);
                    console.log(`   Cleaner ID: ${cleanerId || 'MISSING'}`);
                    console.log(`   Cleaner Name: ${cleanerName || 'MISSING'}`);
                    console.log(`   Completed: ${job.completedAt ? new Date(job.completedAt).toLocaleString() : 'No completion time'}`);
                    console.log('');
                  }
                  
                  // Check notifications
                  const notificationsRef = collection(db, 'notifications');
                  const notificationsQuery = query(
                    notificationsRef,
                    where('userId', '==', currentUser.uid),
                    where('type', '==', 'review_request')
                  );
                  
                  const notificationsSnapshot = await getDocs(notificationsQuery);
                  console.log(`📬 Found ${notificationsSnapshot.size} review notifications for this host`);
                  
                  debugInfo += `\nReview Notifications: ${notificationsSnapshot.size}`;
                  
                  Alert.alert('Debug Complete', debugInfo);
                } catch (error: any) {
                  console.error('Debug error:', error);
                  Alert.alert('Debug Error', error.message || 'Debug failed');
                }
              }}
            >
              <Ionicons name="search" size={20} color="#fff" />
              <Text style={styles.debugButtonText}>Debug Recent Completed Jobs</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.debugButton, { backgroundColor: '#059669' }]}
              onPress={async () => {
                if (!currentUser?.uid) return;
                try {
                  // Check all notifications for this user
                  const notificationsRef = collection(db, 'notifications');
                  const allNotificationsQuery = query(
                    notificationsRef,
                    where('userId', '==', currentUser.uid)
                  );
                  
                  const allNotificationsSnapshot = await getDocs(allNotificationsQuery);
                  console.log(`\n🔍 DEBUGGING ALL NOTIFICATIONS FOR USER: ${currentUser.uid}`);
                  console.log(`📬 Found ${allNotificationsSnapshot.size} total notifications\n`);
                  
                  let debugInfo = `Total Notifications: ${allNotificationsSnapshot.size}\n\n`;
                  
                  if (allNotificationsSnapshot.size > 0) {
                    allNotificationsSnapshot.docs.forEach((notifDoc, index) => {
                      const notif = { id: notifDoc.id, ...notifDoc.data() } as any;
                      console.log(`📨 Notification ${index + 1}:`);
                      console.log(`   ID: ${notif.id}`);
                      console.log(`   Type: ${notif.type}`);
                      console.log(`   Message: ${notif.message}`);
                      console.log(`   Created: ${new Date(notif.createdAt).toLocaleString()}`);
                      console.log(`   Read: ${notif.read}`);
                      console.log('');
                      
                      debugInfo += `${index + 1}. ${notif.type}: ${notif.message.substring(0, 50)}...\n`;
                      debugInfo += `   Created: ${new Date(notif.createdAt).toLocaleString()}\n`;
                      debugInfo += `   Read: ${notif.read}\n\n`;
                    });
                  } else {
                    debugInfo += 'No notifications found in Firebase for this user.';
                  }
                  
                  // Also check local notification store
                  const { useNotifications } = await import('../../stores/notificationsStore');
                  const localStore = useNotifications.getState();
                  const localNotifications = localStore.items.filter(item => item.userId === currentUser.uid);
                  
                  console.log(`📱 Local notification store has ${localNotifications.length} notifications for this user`);
                  debugInfo += `\nLocal Store Notifications: ${localNotifications.length}`;
                  
                  Alert.alert('All Notifications Debug', debugInfo);
                } catch (error: any) {
                  console.error('Debug error:', error);
                  Alert.alert('Debug Error', error.message || 'Debug failed');
                }
              }}
            >
              <Ionicons name="list" size={20} color="#fff" />
              <Text style={styles.debugButtonText}>Debug All My Notifications</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.debugButton, { backgroundColor: '#16A34A' }]}
              onPress={async () => {
                if (!currentUser?.uid) return;
                try {
                  // Import and run the complete flow test
                  const { testCompleteNotificationFlow } = await import('../../scripts/test/testCompleteNotificationFlow.js');
                  const result = await testCompleteNotificationFlow();
                  
                  if (result && result.success) {
                    Alert.alert(
                      'Test Successful!', 
                      `Notification created and synced successfully!\n\nNotification ID: ${result.notificationId?.substring(0, 8)}...\nLocal notifications: ${result.localNotifications}\nUnread count: ${result.unreadCount}\n\nCheck the notification icon in the top-right corner!`
                    );
                  } else {
                    Alert.alert('Test Failed', result?.error || 'Unknown error occurred');
                  }
                } catch (error: any) {
                  console.error('Complete flow test error:', error);
                  Alert.alert('Test Error', error.message || 'Failed to run complete flow test');
                }
              }}
            >
              <Ionicons name="flash" size={20} color="#fff" />
              <Text style={styles.debugButtonText}>Test Complete Flow (Firebase → App)</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.debugButton, { backgroundColor: '#DC2626' }]}
              onPress={async () => {
                try {
                  console.log('\n🔍 Starting comprehensive manual job notification flow debug...');
                  
                  // Import and run the debug flow
                  const { debugManualJobNotificationFlow } = await import('../../scripts/debug/debugManualJobNotificationFlow.js');
                  const result = await debugManualJobNotificationFlow();
                  
                  console.log('\n🏁 Debug flow completed:', result);
                  
                  if (result.success) {
                    Alert.alert(
                      'Debug Successful!', 
                      `Manual job notification flow is working!\n\n✅ Job created and completed\n✅ ${result.notificationsCreated} notification(s) created\n📊 ${result.completedJobCount} completed jobs found\n📝 ${result.existingReviews} existing reviews\n\nCheck console for detailed logs.`
                    );
                  } else {
                    Alert.alert(
                      'Debug Failed!', 
                      `Manual job notification flow has issues:\n\n❌ ${result.error || 'Unknown error'}\n\nThis explains why manual job completion isn't triggering notifications. Check console for detailed logs.`
                    );
                  }
                } catch (error: any) {
                  console.error('Manual job debug error:', error);
                  Alert.alert('Debug Error', `Failed to run manual job debug: ${error.message || 'Unknown error'}`);
                }
              }}
            >
              <Ionicons name="construct" size={20} color="#fff" />
              <Text style={styles.debugButtonText}>Debug Manual Job Notification Flow</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.debugButton, { backgroundColor: '#059669' }]}
              onPress={async () => {
                try {
                  console.log('\n🔧 Starting manual job notification fix...');
                  
                  // Import and run the fix
                  const { fixManualJobNotifications } = await import('../../scripts/fix/fixManualJobNotifications.js');
                  const result = await fixManualJobNotifications();
                  
                  console.log('\n🏁 Fix completed:', result);
                  
                  if (result.success) {
                    Alert.alert(
                      'Fix Completed!', 
                      `Manual job notification fix applied!\n\n✅ Total jobs checked: ${result.totalJobs}\n🔧 Jobs fixed: ${result.jobsFixed}\n⚠️ Jobs with issues: ${result.jobsWithIssues}\n\nThis should resolve notification issues for future job completions. Check console for detailed logs.`
                    );
                  } else {
                    Alert.alert(
                      'Fix Failed!', 
                      `Manual job notification fix encountered issues:\n\n❌ ${result.error || 'Unknown error'}\n\nCheck console for detailed logs.`
                    );
                  }
                } catch (error: any) {
                  console.error('Manual job fix error:', error);
                  Alert.alert('Fix Error', `Failed to run manual job fix: ${error.message || 'Unknown error'}`);
                }
              }}
            >
              <Ionicons name="hammer" size={20} color="#fff" />
              <Text style={styles.debugButtonText}>Fix Manual Job Notifications</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.debugButton, { backgroundColor: '#7C2D12' }]}
              onPress={async () => {
                if (!currentUser?.uid) return;
                try {
                  console.log('\n🔍 Testing real manual job creation flow...');
                  
                  // Get user's team members to test with
                  const teamMembersRef = collection(db, 'users', currentUser.uid, 'teamMembers');
                  const teamSnapshot = await getDocs(teamMembersRef);
                  
                  if (teamSnapshot.empty) {
                    Alert.alert('No Team Members', 'You need to have team members to test manual job creation. Add cleaners to your team first.');
                    return;
                  }
                  
                  // Get the first active cleaner
                  let testCleaner: any = null;
                  teamSnapshot.forEach(doc => {
                    const member = { id: doc.id, ...doc.data() } as any;
                    if (member.status === 'active' && 
                        (member.role === 'primary_cleaner' || member.role === 'secondary_cleaner') && 
                        !testCleaner) {
                      testCleaner = member;
                    }
                  });
                  
                  if (!testCleaner) {
                    Alert.alert('No Active Cleaners', 'You need to have active cleaners in your team to test manual job creation.');
                    return;
                  }
                  
                  console.log('🧹 Found test cleaner:', testCleaner);
                  
                  // Create a test manual job using the same logic as ManualCleanForm
                  const { createCleaningJob } = await import('../../services/cleaningJobsService');
                  
                  const cleanerId = testCleaner.userId || testCleaner.id;
                  
                  const jobData = {
                    address: '123 Test Manual Job Street, Test City, CA',
                    destination: { latitude: 25.7617, longitude: -80.1918 },
                    hostId: currentUser.uid,
                    cleaningType: 'standard' as const,
                    preferredDate: Date.now() + (24 * 60 * 60 * 1000), // Tomorrow
                    preferredTime: '10:00 AM',
                    status: 'assigned' as const,
                    assignedCleanerId: cleanerId,
                    assignedCleanerName: testCleaner.name,
                    assignedTeamMemberId: testCleaner.id,
                    notes: 'Test manual job for notification debugging'
                  };
                  
                  console.log('📋 Creating manual job with data:', jobData);
                  
                  const jobId = await createCleaningJob(jobData);
                  console.log(`✅ Manual job created with ID: ${jobId}`);
                  
                  // Now mark it as completed to test notification
                  const { updateCleaningJobStatus } = await import('../../services/cleaningJobsService');
                  console.log('🔄 Marking job as completed...');
                  await updateCleaningJobStatus(jobId, 'completed');
                  
                  // Clean up the test job
                  await deleteDoc(doc(db, 'cleaningJobs', jobId));
                  console.log('🧹 Test job cleaned up');
                  
                  Alert.alert(
                    'Manual Job Test Complete!', 
                    `Test completed successfully!\n\n✅ Manual job created and assigned to ${testCleaner.name}\n✅ Job marked as completed\n✅ Test job cleaned up\n\nCheck your notifications and console logs for results.`
                  );
                } catch (error: any) {
                  console.error('Manual job test error:', error);
                  Alert.alert('Test Error', `Failed to test manual job creation: ${error.message || 'Unknown error'}`);
                }
              }}
            >
              <Ionicons name="play-circle" size={20} color="#fff" />
              <Text style={styles.debugButtonText}>Test Real Manual Job Flow</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.debugButton, { backgroundColor: '#B91C1C' }]}
              onPress={async () => {
                if (!currentUser?.uid) return;
                try {
                  console.log('\n🔍 Tracing your real job completion...');
                  
                  // Import and run the trace
                  const { traceRealJobCompletion } = await import('../../scripts/debug/traceRealJobCompletion.js');
                  const result = await traceRealJobCompletion(currentUser.uid);
                  
                  console.log('\n🏁 Trace completed:', result);
                  
                  if (result.success) {
                    Alert.alert(
                      'Trace Complete - No Issues Found!', 
                      `Your most recent job completion looks correct:\n\n✅ Job: ${result.jobAddress}\n✅ Cleaner: ${result.cleanerName}\n📊 Completion #${result.completedCleanCount}\n📝 Has reviewed: ${result.hasReviewed}\n🔔 Should notify: ${result.shouldSendNotification}\n📬 Related notifications: ${result.relatedNotifications}\n\nCheck console for detailed analysis.`
                    );
                  } else {
                    Alert.alert(
                      'Issue Found!', 
                      `Problem identified with your job completion:\n\n❌ ${result.issueFound || result.error}\n\n${result.jobAddress ? `Job: ${result.jobAddress}` : 'No recent job found'}\n\nThis explains why notifications aren't appearing. Check console for detailed analysis.`
                    );
                  }
                } catch (error: any) {
                  console.error('Trace error:', error);
                  Alert.alert('Trace Error', `Failed to trace job completion: ${error.message || 'Unknown error'}`);
                }
              }}
            >
              <Ionicons name="analytics" size={20} color="#fff" />
              <Text style={styles.debugButtonText}>Trace Real Job Completion</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
  toolSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  toolTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  debugButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E88E5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  debugButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  toolsScrollContent: {
    paddingBottom: 100, // Add extra padding at bottom to prevent overlap with navigation
  },
});
