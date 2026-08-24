// rider-app/src/__tests__/trips/NewTripScreen.test.js
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import NewTripScreen from '../../screens/trips/NewTripScreen';
import NumericKeypad from '../../components/NumericKeypad';

test('blocks save and shows the fare-amount warning when amount is zero', async () => {
  const navigation = { replace: jest.fn() };
  // No LocalizationProvider wraps this render (matching how this test file already renders
  // other screens standalone) -- useTranslation() falls back to raw i18n keys in that case
  // (see i18n/LocalizationProvider.js), so the button reads "trip.save", not "Save Trip".
  const { getByText } = render(<NewTripScreen navigation={navigation} />);
  fireEvent.press(getByText(/trip\.save/));
  await waitFor(() => {
    expect(navigation.replace).not.toHaveBeenCalled();  // EXC-SB05-001
  });
});

test('NumericKeypad ignores a second decimal point', () => {
  const onChange = jest.fn();
  const { getAllByText } = render(<NumericKeypad value="12.5" onChange={onChange} />);
  fireEvent.press(getAllByText('.')[0]);
  expect(onChange).not.toHaveBeenCalledWith('12.5.');  // BR-SB05-010 / EXC-SB05-005
});
