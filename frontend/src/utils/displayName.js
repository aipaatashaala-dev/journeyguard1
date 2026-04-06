import { updateProfile } from 'firebase/auth';
import { ref, update } from 'firebase/database';
import { auth, db } from '../firebase';
import api from './api';

function normalizeDisplayName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
}

function rememberDisplayName(displayName) {
  const storedJourney = JSON.parse(localStorage.getItem('jg_journey') || '{}');
  if (storedJourney?.trainNumber || storedJourney?.journeyDate) {
    localStorage.setItem('jg_journey', JSON.stringify({
      ...storedJourney,
      displayName,
    }));
  }
}

async function syncDisplayNameDirectly(displayName) {
  const activeUser = auth.currentUser;
  if (!activeUser?.uid) {
    throw new Error('No authenticated user');
  }

  await updateProfile(activeUser, { displayName });
  await activeUser.getIdToken(true).catch(() => {});

  await update(ref(db, `users/${activeUser.uid}`), {
    display_name: displayName,
    updated_at: Date.now(),
  });

  rememberDisplayName(displayName);

  const groupId = localStorage.getItem('jg_group_id');
  if (groupId) {
    await update(ref(db, `user_journeys/${activeUser.uid}`), {
      display_name: displayName,
    }).catch(() => {});

    await update(ref(db, `train_groups/${groupId}/members/${activeUser.uid}`), {
      display_name: displayName,
    }).catch(() => {});
  }
}

export async function saveDisplayName(displayNameInput) {
  const displayName = normalizeDisplayName(displayNameInput);
  if (!displayName) {
    throw new Error('Name is required');
  }

  let backendError = null;
  try {
    await api.put('/auth/profile', {
      display_name: displayName,
    });
    rememberDisplayName(displayName);
    return displayName;
  } catch (error) {
    backendError = error;
  }

  try {
    await syncDisplayNameDirectly(displayName);
    return displayName;
  } catch (fallbackError) {
    const backendDetail = backendError?.response?.data?.detail || backendError?.message || '';
    const fallbackCode = fallbackError?.code || '';

    if (fallbackCode === 'PERMISSION_DENIED' || /permission/i.test(fallbackError?.message || '')) {
      throw new Error(
        'Live Firebase rules still block display_name updates. Publish the latest firebase-database-rules.json or redeploy the backend.'
      );
    }

    throw new Error(
      backendDetail ||
      fallbackError?.message ||
      'Could not update the display name'
    );
  }
}
