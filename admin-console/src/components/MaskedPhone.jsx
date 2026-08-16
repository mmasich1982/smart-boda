// admin-console/src/components/MaskedPhone.jsx
import React, { useState } from 'react';
import { maskPhone } from '../utils/pii';

export default function MaskedPhone({ value }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span>
      {revealed ? value : maskPhone(value)}{' '}
      <button
        type="button"
        className="link-button"
        aria-label={revealed ? 'Hide phone number' : 'Reveal phone number'}
        onClick={() => setRevealed((r) => !r)}
        style={{ background: 'none', border: 'none', color: 'var(--boda-orange)', cursor: 'pointer', fontSize: 12 }}
      >
        {revealed ? 'hide' : 'reveal'}
      </button>
    </span>
  );
}
