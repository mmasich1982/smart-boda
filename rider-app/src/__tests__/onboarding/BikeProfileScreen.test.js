// rider-app/src/__tests__/onboarding/BikeProfileScreen.test.js
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import BikeProfileScreen from '../../screens/onboarding/BikeProfileScreen';

test('shows "Number plate is required." when Continue is tapped with a blank plate', async () => {
  const navigation = { navigate: jest.fn() };
  const { getByText } = render(<BikeProfileScreen navigation={navigation} />);
  fireEvent.press(getByText(/Continue/));
  await waitFor(() => {
    expect(getByText(/Number plate is required\./)).toBeTruthy();  // EXC-SB02-001
  });
  expect(navigation.navigate).not.toHaveBeenCalled();
});

test('auto-uppercases the number plate as it is typed', () => {
  const { getByPlaceholderText } = render(<BikeProfileScreen navigation={{}} />);
  const input = getByPlaceholderText('e.g. KMEA 001A');
  fireEvent.changeText(input, 'kda123x');
  expect(input.props.value).toBe('KDA123X');  // BR-SB02-001
});
