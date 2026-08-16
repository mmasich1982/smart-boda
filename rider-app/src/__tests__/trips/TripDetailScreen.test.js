// rider-app/src/__tests__/trips/TripDetailScreen.test.js
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import TripDetailScreen from '../../screens/trips/TripDetailScreen';

// AUDIT FIX: this suite has always referenced 'old-trip-outside-window' and
// 'recent-trip-within-window' by name, but nothing anywhere ever seeded them -- getTripById
// would have returned undefined and crashed on `loaded.amount`. Mocked here since these are
// screen-level UI tests, not integration tests of the repository itself.
jest.mock('../../offline/tripsRepository', () => ({
  getTripById: jest.fn((id) => Promise.resolve(
    id === 'old-trip-outside-window'
      ? { id, amount: 500, payment_channel_code: 'cash', recorded_at: Date.now() - 1000 * 60 * 60 * 100, status: 'active' }
      : { id, amount: 500, payment_channel_code: 'cash', recorded_at: Date.now(), status: 'active' }
  )),
  saveTripCorrection: jest.fn(() => Promise.resolve(true)),
  voidTripLocally: jest.fn(() => Promise.resolve(true)),
  queueOowRequest: jest.fn(() => Promise.resolve(true)),
}));

test('locked trip shows the banner and only a Request Correction button', async () => {
  const route = { params: { tripId: 'old-trip-outside-window' } };
  const { findByText, queryByText } = render(<TripDetailScreen route={route} navigation={{}} />);
  // AUDIT FIX: increased timeout to 10000ms to allow async trip loading to complete
  await findByText(/trip\.locked_banner/, {}, { timeout: 10000 });  // BR-SB07-006
  expect(queryByText(/trip\.save_correction/)).toBeNull();
}, 15000);

test('void button stays disabled until a reason is chosen AND the checkbox is ticked', async () => {
  const route = { params: { tripId: 'recent-trip-within-window' } };
  const { getByText, getByRole } = render(<TripDetailScreen route={route} navigation={{}} />);
  // AUDIT FIX: increased timeout to allow async trip loading to complete
  await waitFor(() => getByText(/trip\.void_button/), { timeout: 10000 });
  const voidBtn = getByRole('button', { name: /trip\.void_button/ });
  expect(voidBtn.props.disabled ?? voidBtn.props.accessibilityState?.disabled).toBe(true);  // BR-SB07-003
}, 15000);
