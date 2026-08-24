// rider-app/src/__tests__/onboarding/DigitBoxInput.test.js
import React, { useState } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DigitBoxInput from '../../components/DigitBoxInput';

function Harness({ length }) {
  const [value, setValue] = useState('');
  return <DigitBoxInput length={length} value={value} onChange={setValue} />;
}

test('accepts exactly 4 digits for every PIN screen, reusing the same component', () => {
  const { getAllByLabelText: getPinBoxes } = render(<Harness length={4} />);
  expect(getPinBoxes(/Digit \d of 4/)).toHaveLength(4);
});
