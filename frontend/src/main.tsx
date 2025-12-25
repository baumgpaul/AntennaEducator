import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import App from './App';
import { store } from './store';
import { lightTheme, darkTheme } from './theme';
import { useAppSelector } from './store/hooks';

/**
 * ThemeWrapper component handles theme switching based on Redux state
 */
function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { mode } = useAppSelector((state) => state.ui.theme);
  const theme = mode === 'dark' ? darkTheme : lightTheme;

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

// Create root and render application
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <ThemeWrapper>
          <CssBaseline />
          <App />
        </ThemeWrapper>
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
