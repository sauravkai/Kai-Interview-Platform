import React, { createContext, useContext, useState, useEffect } from 'react';
import API from '../services/api';
import { clearStoredAuth, isTokenExpired } from '../utils/authSession';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState(() => {
    const savedToken = localStorage.getItem('token') || '';
    if (savedToken && isTokenExpired(savedToken)) {
      clearStoredAuth();
      return '';
    }
    return savedToken;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      if (isTokenExpired(token)) {
        clearStoredAuth();
        setUser(null);
        setToken('');
        return;
      }
      fetchCurrentUser();
    }
  }, [token]);

  const fetchCurrentUser = async () => {
    try {
      setLoading(true);
      const res = await API.get('/auth/me');
      if (res.data.success && res.data.user) {
        setUser(res.data.user);
        localStorage.setItem('user', JSON.stringify(res.data.user));
      }
    } catch (err) {
      console.warn('Using local cached user state.');
    } finally {
      setLoading(false);
    }
  };

  const clearUserScopedInterviewData = () => {
    const keysToClear = [
      'previousInterviewReports',
      'cancelledInterviewHistory',
      'solvedQuestionHistory',
      'learningStreak',
      'solvedProgress',
      'solvedHistoryResetAt',
      'lastSolvedMonth',
      'interview_ai_notifications',
      'interview_ai_scheduled_sessions',
      ...Object.keys(localStorage).filter(
        (key) => key.startsWith('previousInterviewReports_') || key.startsWith('cancelledInterviewHistory_')
      ),
    ];

    keysToClear.forEach((key) => localStorage.removeItem(key));
  };

  const login = async (email, password) => {
    try {
      setLoading(true);
      clearUserScopedInterviewData();
      const res = await API.post('/auth/login', { email, password });
      if (res.data.success) {
        setToken(res.data.token);
        setUser(res.data.user);
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        return { success: true, user: res.data.user };
      }
    } catch (err) {
      return { success: false, message: err.response?.data?.message || 'Login failed' };
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async (email) => {
    try {
      setLoading(true);
      const res = await API.post('/auth/forgot-password', { email });
      return {
        success: Boolean(res.data.success),
        message: res.data.message || 'If an account exists, a reset link has been sent.',
        resetToken: res.data.resetToken || '',
      };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || 'Unable to send a password reset request right now.',
        resetToken: '',
      };
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (token, password) => {
    try {
      setLoading(true);
      const res = await API.post('/auth/reset-password', { token, password });
      return {
        success: Boolean(res.data.success),
        message: res.data.message || 'Password reset successful.',
      };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || 'Password reset failed.',
      };
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    try {
      setLoading(true);
      clearUserScopedInterviewData();
      const res = await API.post('/auth/register', userData);
      if (res.data.success) {
        setToken(res.data.token);
        setUser(res.data.user);
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        return { success: true, user: res.data.user };
      }
    } catch (err) {
      return { success: false, message: err.response?.data?.message || 'Registration failed' };
    } finally {
      setLoading(false);
    }
  };

  const registerWithGoogle = async () => {
    try {
      setLoading(true);
      clearUserScopedInterviewData();

      const res = await API.post('/auth/google', { provider: 'google' });
      if (res.data.success) {
        setToken(res.data.token);
        setUser(res.data.user);
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        return { success: true, user: res.data.user };
      }

      return { success: false, message: res.data.message || 'Google sign-in failed' };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || 'Google sign-in failed. Please try again.',
      };
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    try {
      setLoading(true);
      clearUserScopedInterviewData();

      const res = await API.post('/auth/google', { provider: 'google' });
      if (res.data.success) {
        setToken(res.data.token);
        setUser(res.data.user);
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        return { success: true, user: res.data.user };
      }

      return { success: false, message: res.data.message || 'Google sign-in failed' };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || 'Google sign-in failed. Please try again.',
      };
    } finally {
      setLoading(false);
    }
  };

  const loginAsDemoRole = async (role = 'candidate') => {
    try {
      setLoading(true);
      clearUserScopedInterviewData();
      const res = await API.post('/auth/demo', { role });
      if (res.data.success && res.data.token) {
        setToken(res.data.token);
        setUser(res.data.user);
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        return { success: true, user: res.data.user };
      }

      return {
        success: false,
        message: res.data.message || 'Demo login is unavailable right now.',
      };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || 'Demo login is unavailable right now.',
      };
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const res = await API.get('/auth/me');
      if (res.data.success && res.data.user) {
        setUser(res.data.user);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        return res.data.user;
      }
      return user;
    } catch (err) {
      console.warn('Could not refresh user state from server.', err.message);
      return user;
    }
  };

  const updateUserStats = (statsPatch = {}) => {
    setUser((currentUser) => {
      if (!currentUser) return currentUser;

      const nextUser = {
        ...currentUser,
        stats: {
          ...currentUser.stats,
          ...statsPatch,
        },
      };

      localStorage.setItem('user', JSON.stringify(nextUser));
      return nextUser;
    });
  };

  const logout = async () => {
    try {
      // Create logout session
      await API.post('/sessions', {
        userId: user?.id,
        type: 'logout',
        ipAddress: '',
        location: '',
        device: navigator.userAgent,
      });
    } catch (error) {
      console.warn('Failed to create logout session:', error);
    }

    setUser(null);
    setToken('');
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('interview_ai_notifications');
    localStorage.removeItem('interview_ai_scheduled_sessions');

    if (typeof window !== 'undefined') {
      window.location.assign(`${window.location.origin}/`);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        forgotPassword,
        resetPassword,
        register,
        registerWithGoogle,
        loginWithGoogle,
        loginAsDemoRole,
        refreshUser,
        updateUserStats,
        logout,
        setUser,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
