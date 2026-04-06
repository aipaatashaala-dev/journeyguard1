import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  EmailAuthProvider,
  signOut,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
} from 'firebase/auth';

const AuthContext = createContext(null);

function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const register = (email, password) =>
    createUserWithEmailAndPassword(auth, email, password);

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const loginWithGoogle = () =>
    signInWithPopup(auth, createGoogleProvider());

  const changePassword = async ({ currentPassword = '', newPassword }) => {
    const activeUser = auth.currentUser;
    if (!activeUser) {
      throw new Error('No authenticated user');
    }

    const providerIds = new Set(
      (activeUser.providerData || [])
        .map((provider) => provider?.providerId)
        .filter(Boolean)
    );

    if (providerIds.has('password')) {
      if (!currentPassword) {
        throw new Error('Current password is required');
      }
      if (!activeUser.email) {
        throw new Error('No account email found');
      }

      const credential = EmailAuthProvider.credential(activeUser.email, currentPassword);
      await reauthenticateWithCredential(activeUser, credential);
    } else if (providerIds.has('google.com')) {
      await reauthenticateWithPopup(activeUser, createGoogleProvider());
    }

    await updatePassword(activeUser, newPassword);
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, loading, register, login, loginWithGoogle, changePassword, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
