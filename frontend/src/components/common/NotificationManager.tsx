import { Snackbar, Alert } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { removeNotification } from '@/store/uiSlice';

/**
 * NotificationManager component displays global notifications from Redux store
 * Automatically removes notifications after duration or on user close
 */
function NotificationManager() {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((state) => state.ui.notifications);

  const handleClose = (id: number) => {
    dispatch(removeNotification(id));
  };

  return (
    <>
      {notifications.map((notification) => (
        <Snackbar
          key={notification.id}
          open={true}
          autoHideDuration={notification.duration}
          onClose={() => handleClose(notification.id)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          sx={{ mt: 8 }} // Below header
        >
          <Alert
            onClose={() => handleClose(notification.id)}
            severity={notification.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {notification.message}
          </Alert>
        </Snackbar>
      ))}
    </>
  );
}

export default NotificationManager;
