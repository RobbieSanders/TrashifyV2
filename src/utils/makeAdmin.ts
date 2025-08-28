// Script to make a user an admin
// Run this in your browser console or as a separate script

import { 
  doc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase';

export async function makeUserAdmin(email: string) {
  try {
    // First, find the user by email
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.error('User not found with email:', email);
      return false;
    }
    
    const userDoc = querySnapshot.docs[0];
    const userId = userDoc.id;
    
    // Update the user's role to admin
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      role: 'admin',
      updatedAt: serverTimestamp()
    });
    
    console.log(`Successfully made ${email} an admin`);
    return true;
  } catch (error) {
    console.error('Error making user admin:', error);
    return false;
  }
}

// Make Roberto1.Sanders@gmail.com an admin
// Uncomment the line below to run it
// makeUserAdmin('Roberto1.Sanders@gmail.com');
