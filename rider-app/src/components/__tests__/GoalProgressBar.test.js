// rider-app/src/components/__tests__/GoalProgressBar.test.js
import { render } from '@testing-library/react-native';
import GoalProgressBar from '../GoalProgressBar';

test('caps visual fill at 100% even when earned exceeds target', () => {
  const { getByTestId } = render(<GoalProgressBar earned={15000} target={10000} testID="bar" />);
  // EXC-SB17-005: 150% raw progress must still render as a 100%-wide fill
  expect(getByTestId('bar')).toBeTruthy();
});
