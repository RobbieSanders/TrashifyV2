import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, arrayRemove } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { useAuthStore } from '../stores/authStore';

export const PropertyCleanupTool: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [cleanupResults, setCleanupResults] = useState<string[]>([]);
  const { user } = useAuthStore();
  
  const addResult = (message: string) => {
    console.log(message);
    setCleanupResults(prev => [...prev, message]);
  };
  
  const cleanupOrphanedData = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to run cleanup');
      return;
    }
    
    setIsLoading(true);
    setCleanupResults([]);
    
    try {
      addResult('Starting comprehensive cleanup for all orphaned data...');
      addResult('---');
      
      // First, get all existing property addresses for the current user
      const existingPropertyAddresses = new Set<string>();
      const userPropertiesQuery = query(collection(db, 'users', user.uid, 'properties'));
      const userPropertiesSnapshot = await getDocs(userPropertiesQuery);
      
      userPropertiesSnapshot.forEach(propDoc => {
        const propData = propDoc.data();
        if (propData.address) {
          // Store normalized addresses
          existingPropertyAddresses.add(propData.address.toLowerCase().trim());
        }
      });
      
      addResult(`Found ${existingPropertyAddresses.size} existing properties for user`);
      addResult('---');
      
      // 1. Clean up ALL orphaned cleaning jobs
      addResult('Checking ALL cleaning jobs for orphaned properties...');
      let cleaningJobsDeleted = 0;
      let jobsChecked = 0;
      
      // Get ALL cleaning jobs
      const allCleaningJobsQuery = query(collection(db, 'cleaningJobs'));
      const allCleaningJobsSnapshot = await getDocs(allCleaningJobsQuery);
      
      for (const jobDoc of allCleaningJobsSnapshot.docs) {
        const jobData = jobDoc.data();
        jobsChecked++;
        
        // Check if this job belongs to the current user
        const belongsToUser = jobData.userId === user.uid || jobData.hostId === user.uid;
        
        if (belongsToUser) {
          // Get the job's address (could be in 'address' or 'propertyAddress' field)
          const jobAddress = (jobData.address || jobData.propertyAddress || '').toLowerCase().trim();
          
          // Check if this address exists in user's current properties
          let propertyExists = false;
          
          if (jobAddress) {
            // Check for exact match or partial match
            for (const existingAddress of existingPropertyAddresses) {
              if (existingAddress === jobAddress || 
                  existingAddress.includes(jobAddress) || 
                  jobAddress.includes(existingAddress)) {
                propertyExists = true;
                break;
              }
            }
          }
          
          // If property doesn't exist and job is not completed/cancelled, delete it
          if (!propertyExists && jobData.status !== 'completed' && jobData.status !== 'cancelled') {
            await deleteDoc(doc(db, 'cleaningJobs', jobDoc.id));
            cleaningJobsDeleted++;
            addResult(`  - Deleted orphaned job: ${jobDoc.id} at ${jobData.address || jobData.propertyAddress || 'unknown address'}`);
          }
        }
      }
      
      addResult(`  - Checked ${jobsChecked} total jobs`);
      if (cleaningJobsDeleted === 0) {
        addResult('  - No orphaned cleaning jobs found');
      } else {
        addResult(`  - Total orphaned cleaning jobs deleted: ${cleaningJobsDeleted}`);
      }
      
      addResult('---');
      
      // 2. Clean up orphaned pickup jobs
      addResult('Checking ALL pickup jobs for orphaned properties...');
      let pickupJobsDeleted = 0;
      let pickupsChecked = 0;
      
      // Get ALL pickup jobs
      const allPickupJobsQuery = query(collection(db, 'pickupJobs'));
      const allPickupJobsSnapshot = await getDocs(allPickupJobsQuery);
      
      for (const jobDoc of allPickupJobsSnapshot.docs) {
        const jobData = jobDoc.data();
        pickupsChecked++;
        
        // Check if this job belongs to the current user
        const belongsToUser = jobData.userId === user.uid || jobData.hostId === user.uid;
        
        if (belongsToUser) {
          // Get the job's address
          const jobAddress = (jobData.address || jobData.propertyAddress || '').toLowerCase().trim();
          
          // Check if this address exists in user's current properties
          let propertyExists = false;
          
          if (jobAddress) {
            for (const existingAddress of existingPropertyAddresses) {
              if (existingAddress === jobAddress || 
                  existingAddress.includes(jobAddress) || 
                  jobAddress.includes(existingAddress)) {
                propertyExists = true;
                break;
              }
            }
          }
          
          // If property doesn't exist, delete the pickup job
          if (!propertyExists && jobData.status !== 'completed' && jobData.status !== 'cancelled') {
            await deleteDoc(doc(db, 'pickupJobs', jobDoc.id));
            pickupJobsDeleted++;
            addResult(`  - Deleted orphaned pickup: ${jobDoc.id} at ${jobData.address || jobData.propertyAddress || 'unknown address'}`);
          }
        }
      }
      
      addResult(`  - Checked ${pickupsChecked} total pickup jobs`);
      if (pickupJobsDeleted === 0) {
        addResult('  - No orphaned pickup jobs found');
      } else {
        addResult(`  - Total orphaned pickup jobs deleted: ${pickupJobsDeleted}`);
      }
      
      addResult('---');
      
      // 3. Clean up cleaner recruitments
      addResult('Checking cleaner recruitment posts...');
      let recruitmentsUpdated = 0;
      let recruitmentsDeleted = 0;
      
      const recruitmentsQuery = query(collection(db, 'cleanerRecruitments'));
      const recruitmentsSnapshot = await getDocs(recruitmentsQuery);
      
      for (const recruitDoc of recruitmentsSnapshot.docs) {
        const data = recruitDoc.data();
        
        // Check if this recruitment belongs to the current user
        if (data.userId === user.uid || data.hostId === user.uid) {
          let needsUpdate = false;
          let propertiesToRemove: string[] = [];
          
          // Check if properties array contains orphaned properties
          if (data.properties && Array.isArray(data.properties)) {
            for (const propAddress of data.properties) {
              const normalizedPropAddress = propAddress.toLowerCase().trim();
              let propertyExists = false;
              
              // Check if this property still exists
              for (const existingAddress of existingPropertyAddresses) {
                if (existingAddress === normalizedPropAddress || 
                    existingAddress.includes(normalizedPropAddress) || 
                    normalizedPropAddress.includes(existingAddress)) {
                  propertyExists = true;
                  break;
                }
              }
              
              if (!propertyExists) {
                propertiesToRemove.push(propAddress);
                needsUpdate = true;
              }
            }
          }
          
          if (needsUpdate) {
            // Remove the orphaned properties from the array
            const remainingProperties = data.properties.filter(
              (prop: string) => !propertiesToRemove.includes(prop)
            );
            
            if (remainingProperties.length === 0) {
              // If no properties left, delete the recruitment post
              await deleteDoc(doc(db, 'cleanerRecruitments', recruitDoc.id));
              recruitmentsDeleted++;
              addResult(`  - Deleted recruitment post: ${recruitDoc.id} (no properties left)`);
            } else {
              // Update the recruitment post with remaining properties
              await updateDoc(doc(db, 'cleanerRecruitments', recruitDoc.id), {
                properties: remainingProperties
              });
              recruitmentsUpdated++;
              addResult(`  - Updated recruitment post: ${recruitDoc.id} (removed ${propertiesToRemove.length} orphaned properties)`);
            }
          }
        }
      }
      
      if (recruitmentsUpdated === 0 && recruitmentsDeleted === 0) {
        addResult('  - No recruitment posts needed cleanup');
      } else {
        addResult(`  - Recruitment posts updated: ${recruitmentsUpdated}`);
        addResult(`  - Recruitment posts deleted: ${recruitmentsDeleted}`);
      }
      
      addResult('---');
      
      // 4. Clean up team members in user subcollections
      addResult('Checking team members...');
      let teamMembersUpdated = 0;
      
      // Get all users to check their team members
      const usersQuery = query(collection(db, 'users'));
      const usersSnapshot = await getDocs(usersQuery);
      
      for (const userDoc of usersSnapshot.docs) {
        const teamMembersQuery = query(collection(db, 'users', userDoc.id, 'teamMembers'));
        const teamMembersSnapshot = await getDocs(teamMembersQuery);
        
        for (const memberDoc of teamMembersSnapshot.docs) {
          const memberData = memberDoc.data();
          let needsUpdate = false;
          let propertyIdsToRemove: string[] = [];
          
          // Check assignedProperties array (this is how properties are stored in team members)
          if (memberData.assignedProperties && Array.isArray(memberData.assignedProperties)) {
            // We need to check if any assigned property IDs match the deleted property
            // First, let's get all properties for this user to find the deleted one
            const propertiesQuery = query(collection(db, 'users', userDoc.id, 'properties'));
            const propertiesSnapshot = await getDocs(propertiesQuery);
            
            // Check for orphaned property IDs - no need to check addresses since we already have the list of valid property IDs
            
            // Also check for orphaned property IDs (properties that no longer exist)
            for (const assignedPropId of memberData.assignedProperties) {
              const exists = propertiesSnapshot.docs.some(doc => doc.id === assignedPropId);
              if (!exists) {
                propertyIdsToRemove.push(assignedPropId);
                needsUpdate = true;
                addResult(`  - Found orphaned property ID: ${assignedPropId} in team member ${memberData.name}`);
              }
            }
            
            if (needsUpdate) {
              const cleanedProperties = memberData.assignedProperties.filter(
                (propId: string) => !propertyIdsToRemove.includes(propId)
              );
              
              await updateDoc(
                doc(db, 'users', userDoc.id, 'teamMembers', memberDoc.id),
                { assignedProperties: cleanedProperties }
              );
              teamMembersUpdated++;
              addResult(`  - Cleaned team member: ${memberData.name} (removed ${propertyIdsToRemove.length} property references)`);
            }
          }
        }
      }
      
      if (teamMembersUpdated === 0) {
        addResult('  - No team members needed cleanup');
      } else {
        addResult(`  - Total team members updated: ${teamMembersUpdated}`);
      }
      
      addResult('---');
      addResult('✅ Cleanup completed successfully!');
      
      Alert.alert(
        'Cleanup Complete',
        `Successfully cleaned up orphaned data:\n\n` +
        `- Cleaning jobs deleted: ${cleaningJobsDeleted}\n` +
        `- Pickup jobs deleted: ${pickupJobsDeleted}\n` +
        `- Recruitment posts updated: ${recruitmentsUpdated}\n` +
        `- Recruitment posts deleted: ${recruitmentsDeleted}\n` +
        `- Team members updated: ${teamMembersUpdated}`
      );
      
    } catch (error) {
      console.error('Cleanup error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      addResult('❌ Error during cleanup: ' + errorMessage);
      Alert.alert('Error', 'Failed to complete cleanup: ' + errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Property Data Cleanup Tool</Text>
      <Text style={styles.subtitle}>
        Clean up ALL orphaned data from deleted properties
      </Text>
      
      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={cleanupOrphanedData}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>Run Cleanup</Text>
        )}
      </TouchableOpacity>
      
      {cleanupResults.length > 0 && (
        <ScrollView style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>Cleanup Results:</Text>
          {cleanupResults.map((result, index) => (
            <Text key={index} style={styles.resultLine}>
              {result}
            </Text>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 5,
    color: '#666',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultsContainer: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
    marginTop: 10,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  resultLine: {
    fontSize: 14,
    marginBottom: 5,
    color: '#555',
    fontFamily: 'monospace',
  },
});

export default PropertyCleanupTool;
