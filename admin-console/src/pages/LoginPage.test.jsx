// admin-console/src/pages/LoginPage.test.jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
import api from '../api/client';

vi.mock('../api/client', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an error message on invalid credentials instead of crashing', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 401 } });
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'wrong@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i));
  });

  it('disables the submit button while a login request is in flight', async () => {
    let resolveLogin;
    api.post.mockReturnValueOnce(new Promise((resolve) => { resolveLogin = resolve; }));
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'correct' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(screen.getByRole('button')).toBeDisabled();
    await waitFor(() => resolveLogin({ data: { name: 'Admin', role: 'super_admin', email: 'admin@example.com' } }));
  });
});
