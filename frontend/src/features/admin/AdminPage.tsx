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
} from '@mui/material';
import {
  AdminPanelSettings,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useState, useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  fetchUsers,
  updateUserRole,
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
              <TableCell>Status</TableCell>
              <TableCell>Joined</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && users.length === 0 ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(5)].map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton variant="text" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
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
    </Box>
  );
}

export default AdminPage;
