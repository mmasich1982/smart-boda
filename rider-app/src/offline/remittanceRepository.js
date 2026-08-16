import { db } from './LocalStore';

/**
 * Save a new remittance (Send Money Home) transaction
 */
export async function saveRemittance(remittance) {
  try {
    const table = db.get('remittances', []);
    remittance.id = remittance.id || `RMT-${Math.floor(100000 + Math.random() * 900000)}`;
    remittance.ts = remittance.ts || new Date().toISOString();
    remittance.syncStatus = remittance.syncStatus || 'pending';
    table.push(remittance);
    db.set('remittances', table);
    return remittance;
  } catch (err) {
    console.error('Error saving remittance:', err);
    throw err;
  }
}

/**
 * Get all remittances for the current rider
 */
export async function getAllRemittances() {
  try {
    return db.get('remittances', []);
  } catch (err) {
    console.error('Error getting remittances:', err);
    return [];
  }
}

/**
 * Get remittances for a specific period
 */
export async function getRemittancesByPeriod(startDate, endDate) {
  try {
    const remittances = db.get('remittances', []);
    return remittances.filter((r) => {
      const ts = new Date(r.ts);
      return ts >= startDate && ts <= endDate;
    });
  } catch (err) {
    console.error('Error getting remittances by period:', err);
    return [];
  }
}

/**
 * Get remittances by period with summary
 */
export async function getRemittanceSummary(period) {
  try {
    const now = new Date();
    const remittances = db.get('remittances', []);
    let filtered = [];

    if (period === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      filtered = remittances.filter((r) => new Date(r.ts) >= start);
    } else if (period === 'lastMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      filtered = remittances.filter((r) => {
        const ts = new Date(r.ts);
        return ts >= start && ts < end;
      });
    } else if (period === 'last6') {
      const start = new Date(now);
      start.setDate(start.getDate() - 180);
      filtered = remittances.filter((r) => new Date(r.ts) >= start);
    } else if (period === 'sinceJoining') {
      filtered = remittances;
    }

    const totalSent = filtered.reduce((sum, r) => sum + (r.amount || 0), 0);

    return {
      totalSent,
      entriesLogged: filtered.length,
      remittances: filtered.sort((a, b) => new Date(b.ts) - new Date(a.ts)),
    };
  } catch (err) {
    console.error('Error getting remittance summary:', err);
    return { totalSent: 0, entriesLogged: 0, remittances: [] };
  }
}

/**
 * Get saved recipients
 */
export async function getSavedRecipients() {
  try {
    return db.get('savedRecipients', []);
  } catch (err) {
    console.error('Error getting saved recipients:', err);
    return [];
  }
}

/**
 * Save a recipient to the saved recipients list
 */
export async function saveRecipient(recipient) {
  try {
    const recipients = db.get('savedRecipients', []);
    if (!recipients.includes(recipient)) {
      recipients.push(recipient);
      db.set('savedRecipients', recipients);
    }
    return recipients;
  } catch (err) {
    console.error('Error saving recipient:', err);
    throw err;
  }
}

/**
 * Delete a remittance (within correction window)
 */
export async function deleteRemittance(remittanceId) {
  try {
    const remittances = db.get('remittances', []);
    const remittance = remittances.find((r) => r.id === remittanceId);

    if (!remittance) {
      throw new Error('Remittance not found');
    }

    const timeSinceCreation = new Date() - new Date(remittance.ts);
    const hoursElapsed = timeSinceCreation / (1000 * 60 * 60);

    if (hoursElapsed > 24) {
      throw new Error('Cannot delete remittance outside correction window');
    }

    const filtered = remittances.filter((r) => r.id !== remittanceId);
    db.set('remittances', filtered);
    return true;
  } catch (err) {
    console.error('Error deleting remittance:', err);
    throw err;
  }
}

/**
 * Get remittance detail by ID
 */
export async function getRemittanceById(remittanceId) {
  try {
    const remittances = db.get('remittances', []);
    return remittances.find((r) => r.id === remittanceId) || null;
  } catch (err) {
    console.error('Error getting remittance by ID:', err);
    return null;
  }
}

/**
 * Sync pending remittances to backend
 */
export async function syncRemittances(api) {
  try {
    const remittances = db.get('remittances', []);
    const pending = remittances.filter((r) => r.syncStatus === 'pending');

    if (pending.length === 0) {
      return { synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;

    for (const remittance of pending) {
      try {
        await api.post('/api/remittance/send', {
          recipient: remittance.recipient,
          relationship: remittance.relationship,
          amount: remittance.amount,
          channel: remittance.channel,
        });
        remittance.syncStatus = 'synced';
        synced++;
      } catch (err) {
        console.error(`Failed to sync remittance ${remittance.id}:`, err);
        failed++;
      }
    }

    db.set('remittances', remittances);
    return { synced, failed };
  } catch (err) {
    console.error('Error syncing remittances:', err);
    throw err;
  }
}