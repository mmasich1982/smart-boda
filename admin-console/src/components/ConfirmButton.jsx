// admin-console/src/components/ConfirmButton.jsx
// AUDIT FIX (Admin Console, High): "Consequential actions (re-lock an account, approve a
// PIN reset, resolve a duplicate-plate case) fire immediately on click, with no
// confirmation step and no way to record why." This wraps any action button with a
// lightweight native-confirm gate plus an optional reason capture, so every call site
// gets the same guarantee without re-implementing it.
import React, { useState } from 'react';

export default function ConfirmButton({
  onConfirm,
  label,
  confirmMessage = 'Are you sure? This cannot be undone.',
  requireReason = false,
  className = 'primary',
  disabled = false,
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    let reason = '';
    if (requireReason) {
      reason = window.prompt(`${confirmMessage}\n\nEnter a reason to continue:`, '');
      if (reason === null || reason.trim() === '') return; // cancelled or empty -- do nothing
    } else if (!window.confirm(confirmMessage)) {
      return;
    }
    setBusy(true);
    try {
      await onConfirm(reason);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className={className} onClick={handleClick} disabled={disabled || busy}>
      {busy ? 'Working…' : label}
    </button>
  );
}
