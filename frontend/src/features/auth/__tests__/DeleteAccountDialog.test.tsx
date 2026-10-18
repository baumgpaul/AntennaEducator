import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/authSlice';
import DeleteAccountDialog from '../DeleteAccountDialog';

const { deleteAccount, logout } = vi.hoisted(() => ({
  deleteAccount: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('@/api/auth', () => ({ deleteAccount }));
vi.mock('@/services/auth', () => ({
  getAuthService: () => ({ logout, getCurrentUser: vi.fn(), getAccessToken: () => null }),
}));

function renderDialog() {
  const store = configureStore({ reducer: { auth: authReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <DeleteAccountDialog open email="student@uni.example" onClose={vi.fn()} />
      </MemoryRouter>
    </Provider>
  );
}

describe('DeleteAccountDialog', () => {
  beforeEach(() => {
    deleteAccount.mockReset();
    logout.mockReset();
  });

  it('only enables deletion once the e-mail is typed', async () => {
    renderDialog();
    const button = screen.getByRole('button', { name: 'Delete account' });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText('E-mail'), 'Student@Uni.example');
    expect(button).toBeEnabled();
  });

  it('deletes, then logs out', async () => {
    deleteAccount.mockResolvedValue(undefined);
    renderDialog();
    await userEvent.type(screen.getByLabelText('E-mail'), 'student@uni.example');
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(deleteAccount).toHaveBeenCalledTimes(1);
  });

  it('shows the server reason and stays logged in on failure', async () => {
    deleteAccount.mockRejectedValue({
      response: { data: { detail: 'Admins and maintainers cannot delete their own account.' } },
    });
    renderDialog();
    await userEvent.type(screen.getByLabelText('E-mail'), 'student@uni.example');
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(await screen.findByText(/cannot delete their own account/)).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });
});
