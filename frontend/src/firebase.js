import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyBd2ZtpRMXC5cqHioODxvnEA8NDc7XiBxs",
  authDomain: "journeyguard.firebaseapp.com",
  databaseURL: "https://journeyguard-default-rtdb.firebaseio.com",
  projectId: "journeyguard",
  storageBucket: "journeyguard.firebasestorage.app",
  messagingSenderId: "160169757616",
  appId: "1:160169757616:web:508ea1f2923cca48c5e475",
  measurementId: "G-ZPV67RT9W4"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
const analytics = getAnalytics(app);
export const firebaseConfigLooksPlaceholder =
  firebaseConfig.apiKey === 'YOUR_API_KEY' ||
  firebaseConfig.appId === '1:000:web:000';

export default app;
