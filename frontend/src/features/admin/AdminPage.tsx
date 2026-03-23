import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  Chip,
  Alert,
  AlertTitle,
  Button,
  Skeleton,
  CircularProgress,
  TextField,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  AdminPanelSettings,
  Refresh as RefreshIcon,
  AllInclusive,
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useState, useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  fetchUsers,
  updateUserRole,
  updateUserTokens,
  updateUserFlatrate,
  selectUsers,
  selectAdminLoading,
  selectFoldersError,
} from '@/store/foldersSlice';
import type { UserListItem } from '@/store/foldersSlice';
import { showSuccess, showError } from '@/store/uiSlice';
import { formatErrorMessage } from '@/utils/errors';

/**
 * AdminPage — User management panel for admins.
 * View all users and change their roles.
 */
function AdminPage() {
  const dispatch = useAppDispatch();
  const users = useAppSelector(selectUsers);
  const loading = useAppSelector(selectAdminLoading);
  const error = useAppSelector(selectFoldersError);
  const currentUser = useAppSelector((state) => state.auth.user);

  const [changingUserId, setChangingUserId] = useState<string | null>(null);
  const [editingTokenUserId, setEditingTokenUserId] = useState<string | null>(null);
  const [tokenInputValue, setTokenInputValue] = useState('');
  const [flatrateDialogUser, setFlatrateDialogUser] = useState<UserListItem | null>(null);
  const [flatrateDays, setFlatrateDays] = useState('30');

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  const handleRoleChange = async (user: UserListItem, newRole: string) => {
    if (newRole === user.role) return;
    if (user.user_id === currentUser?.id) return;

    const confirmed = window.confirm(
      `Change ${user.username}'s role from "${user.role}" to "${newRole}"?`,
    );
    if (!confirmed) return;

    setChangingUserId(user.user_id);
    try {
      await dispatch(
        updateUserRole({
          userId: user.user_id,
          data: { role: newRole as 'user' | 'maintainer' | 'admin' },
        }),
      ).unwrap();
      dispatch(showSuccess(`${user.username}'s role changed to ${newRole}`));
    } catch (err) {
      dispatch(showError(`Failed to update role: ${formatErrorMessage(err)}`));
    } finally {
      setChangingUserId(null);
    }
  };

  const handleTokenEdit = (user: UserListItem) => {
    setEditingTokenUserId(user.user_id);
    setTokenInputValue(String(user.simulation_tokens));
  };

  const handleTokenSave = async (userId: string) => {
    const amount = parseInt(tokenInputValue, 10);
    if (isNaN(amount) || amount < 0) {
      dispatch(showError('Token amount must be a non-negative number'));
      return;
    }
    setChangingUserId(userId);
    try {
      await dispatch(
        updateUserTokens({ userId, data: { action: 'set', amount } }),
      ).unwrap();
      dispatch(showSuccess(`Tokens updated to ${amount}`));
    } catch (err) {
      dispatch(showError(`Failed to update tokens: ${formatErrorMessage(err)}`));
    } finally {
      setEditingTokenUserId(null);
      setChangingUserId(null);
    }
  };

  const handleTokenCancel = () => {
    setEditingTokenUserId(null);
  };

  const handleGrantFlatrate = async () => {
    if (!flatrateDialogUser) return;
    const days = parseInt(flatrateDays, 10);
    if (isNaN(days) || days <= 0) {
      dispatch(showError('Days must be a positive number'));
      return;
    }
    const until = new Date(Date.now() + days * 86400000).toISOString();
    setChangingUserId(flatrateDialogUser.user_id);
    try {
      await dispatch(
        updateUserFlatrate({
          userId: flatrateDialogUser.user_id,
          data: { until },
        }),
      ).unwrap();
      dispatch(showSuccess(`Flatrate granted for ${days} days`));
    } catch (err) {
      dispatch(showError(`Failed to grant flatrate: ${formatErrorMessage(err)}`));
    } finally {
      setFlatrateDialogUser(null);
      setChangingUserId(null);
    }
  };

  const handleRevokeFlatrate = async (user: UserListItem) => {
    const confirmed = window.confirm(
      `Revoke flatrate for ${user.username}?`,
    );
    if (!confirmed) return;
    setChangingUserId(user.user_id);
    try {
      await dispatch(
        updateUserFlatrate({
          userId: user.user_id,
          data: { until: null },
        }),
      ).unwrap();
      dispatch(showSuccess(`Flatrate revoked for ${user.username}`));
    } catch (err) {
      dispatch(showError(`Failed to revoke flatrate: ${formatErrorMessage(err)}`));
    } finally {
      setChangingUserId(null);
    }
  };

  // Guard: only admins should see this page
  if (currentUser?.role !== 'admin') {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h5" color="error">
          Access Denied
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
          You need admin privileges to access this page.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <AdminPanelSettings color="primary" />
        <Typography variant="h5">User Management</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage user roles across the platform. Maintainers can manage courses.
        Admins can manage everything.
      </Typography>

      {/* Error */}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => dispatch(fetchUsers())}
            >
              Retry
            </Button>
          }
        >
          <AlertTitle>Error</AlertTitle>
          {error}
        </Alert>
      )}

      {/* Users Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Username</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell align="right">Tokens</TableCell>
              <TableCell>Flatrate</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Joined</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && users.length === 0 ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(7)].map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton variant="text" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No users found
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const isCurrentUser = user.user_id === currentUser?.id;
                const isChanging = changingUserId === user.user_id;

                return (
                  <TableRow key={user.user_id} hover>
                    <TableCell>
                      {user.username}
                      {isCurrentUser && (
                        <Chip label="You" size="small" variant="outlined" sx={{ ml: 1 }} />
                      )}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {isChanging ? (
                        <CircularProgress size={20} />
                      ) : (
                        <Select
                          value={user.role}
                          size="small"
                          disabled={isCurrentUser}
                          onChange={(e) => handleRoleChange(user, e.target.value)}
                          sx={{ minWidth: 130 }}
                        >
                          <MenuItem value="user">User</MenuItem>
                          <MenuItem value="maintainer">Maintainer</MenuItem>
                          <MenuItem value="admin">Admin</MenuItem>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {editingTokenUserId === user.user_id ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                          <TextField
                            size="small"
                            type="number"
                            value={tokenInputValue}
                            onChange={(e) => setTokenInputValue(e.target.value)}
                            sx={{ width: 90 }}
                            inputProps={{ min: 0 }}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleTokenSave(user.user_id);
                              if (e.key === 'Escape') handleTokenCancel();
                            }}
                          />
                          <IconButton size="small" color="success" onClick={() => handleTokenSave(user.user_id)}>
                            <CheckIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={handleTokenCancel}>
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                          {user.simulation_tokens}
                          <Tooltip title="Edit tokens">
                            <IconButton size="small" onClick={() => handleTokenEdit(user)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.flatrate_until && new Date(user.flatrate_until) > new Date() ? (
                        <Tooltip title={`Until ${new Date(user.flatrate_until).toLocaleDateString()}`}>
                          <Chip
                            icon={<AllInclusive />}
                            label="Active"
                            color="success"
                            size="small"
                            onDelete={() => handleRevokeFlatrate(user)}
                          />
                        </Tooltip>
                      ) : (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setFlatrateDialogUser(user);
                            setFlatrateDays('30');
                          }}
                        >
                          Grant
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.is_locked ? (
                        <Chip label="Locked" color="error" size="small" />
                      ) : (
                        <Chip label="Active" color="success" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString()
                        : '—'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Flatrate grant dialog */}
      <Dialog
        open={!!flatrateDialogUser}
        onClose={() => setFlatrateDialogUser(null)}
      >
        <DialogTitle>Grant Flatrate</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Grant unlimited simulation access to{' '}
            <strong>{flatrateDialogUser?.username}</strong> for a number of days.
          </Typography>
          <TextField
            label="Days"
            type="number"
            value={flatrateDays}
            onChange={(e) => setFlatrateDays(e.target.value)}
            inputProps={{ min: 1 }}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFlatrateDialogUser(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleGrantFlatrate}>
            Grant
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default AdminPage;
