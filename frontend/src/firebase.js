import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'journeyguard.firebaseapp.com',
  databaseURL: 'https://journeyguard-default-rtdb.firebaseio.com/',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'journeyguard',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'journeyguard.appspot.com',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '000000',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:000:web:000',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const firebaseConfigLooksPlaceholder =
  firebaseConfig.apiKey === 'YOUR_API_KEY' ||
  firebaseConfig.projectId === 'journeyguard' ||
  firebaseConfig.appId === '1:000:web:000';

export default app;
