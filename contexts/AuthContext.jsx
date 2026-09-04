'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { authApi } from '../lib/api';

const TOKEN_STORAGE_KEY = 'taskmgmt_token';

const AuthContext = createContext(undefined);

function getErrorMessage(error, fallback = 'An unexpected authentication error occurred.') {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function getResponseUser(response) {
  const user = response?.user ?? response?.data?.user;

  if (!user || typeof user !== 'object') {
    throw new Error('The authentication server returned an invalid user response.');
  }

  return user;
}

function getResponseToken(response) {
  const token = response?.token ?? response?.accessToken ?? response?.data?.token;

  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('The authentication server returned an invalid token.');
  }

  return token;
}

function readStoredToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeToken(token) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    return true;
  } catch {
    return false;
  }
}

function removeStoredToken() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Authentication state is still cleared in memory when storage is unavailable.
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const operationRef = useRef(0);

  useEffect(() => {
    const operation = ++operationRef.current;
    const storedToken = readStoredToken();

    if (!storedToken) {
      setLoading(false);
      return undefined;
    }

    const restoreSession = async () => {
      setLoading(true);
      setError(null);

      try {
        const getCurrentUser = authApi.me ?? authApi.getCurrentUser;

        if (typeof getCurrentUser !== 'function') {
          throw new Error('Current-user lookup is unavailable.');
        }

        const response = await getCurrentUser(storedToken);

        if (operationRef.current !== operation) {
          return;
        }

        setToken(storedToken);
        setUser(getResponseUser(response));
      } catch (restoreError) {
        if (operationRef.current !== operation) {
          return;
        }

        removeStoredToken();
        setToken(null);
        setUser(null);
        setError(
          getErrorMessage(
            restoreError,
            'Your session could not be restored. Please sign in again.',
          ),
        );
      } finally {
        if (operationRef.current === operation) {
          setLoading(false);
        }
      }
    };

    restoreSession();

    return () => {
      if (operationRef.current === operation) {
        operationRef.current += 1;
      }
    };
  }, []);

  const completeAuthentication = useCallback((response) => {
    const authenticatedUser = getResponseUser(response);
    const authenticatedToken = getResponseToken(response);
    const persisted = storeToken(authenticatedToken);

    setToken(authenticatedToken);
    setUser(authenticatedUser);
    setError(
      persisted
        ? null
        : 'You are signed in, but this browser could not persist your session.',
    );

    return authenticatedUser;
  }, []);

  const login = useCallback(
    async (credentials, password) => {
      const operation = ++operationRef.current;
      const payload =
        typeof credentials === 'string'
          ? { email: credentials, password }
          : credentials;

      setLoading(true);
      setError(null);

      try {
        const response = await authApi.login(payload);

        if (operationRef.current !== operation) {
          return null;
        }

        return completeAuthentication(response);
      } catch (loginError) {
        if (operationRef.current === operation) {
          setError(getErrorMessage(loginError, 'Unable to sign in.'));
        }
        throw loginError;
      } finally {
        if (operationRef.current === operation) {
          setLoading(false);
        }
      }
    },
    [completeAuthentication],
  );

  const signup = useCallback(
    async (details, email, password) => {
      const operation = ++operationRef.current;
      const payload =
        typeof details === 'string'
          ? { name: details, email, password }
          : details;

      setLoading(true);
      setError(null);

      try {
        const response = await authApi.signup(payload);

        if (operationRef.current !== operation) {
          return null;
        }

        return completeAuthentication(response);
      } catch (signupError) {
        if (operationRef.current === operation) {
          setError(getErrorMessage(signupError, 'Unable to create your account.'));
        }
        throw signupError;
      } finally {
        if (operationRef.current === operation) {
          setLoading(false);
        }
      }
    },
    [completeAuthentication],
  );

  const logout = useCallback(() => {
    operationRef.current += 1;
    removeStoredToken();
    setUser(null);
    setToken(null);
    setError(null);
    setLoading(false);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      error,
      isAuthenticated: Boolean(user && token),
      login,
      signup,
      logout,
      clearError,
    }),
    [user, token, loading, error, login, signup, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}