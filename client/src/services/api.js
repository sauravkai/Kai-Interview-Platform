import axios from 'axios';
import { clearStoredAuth, isTokenExpired } from '../utils/authSession';

const pickFirstValidUrl = (value) => {
  if (!value) return '';

  const candidates = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return candidates[0] || '';
};

const normalizeApiBaseUrl = (value) => {
  const selectedValue = pickFirstValidUrl(value);
  if (!selectedValue) return '/api';

  const trimmed = selectedValue.replace(/\/$/, '');
  if (trimmed.endsWith('/api')) return trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    return `${trimmed}/api`;
  }

  return trimmed.startsWith('/') ? `${trimmed}/api` : `/${trimmed}/api`;
};

// Support production multi-domain deployments via VITE_API_URL env var
const API = axios.create({
  baseURL: normalizeApiBaseUrl(import.meta.env.VITE_API_URL || '/api'),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000, // 15 second request timeout
});

// Interceptor to attach JWT token
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && !isTokenExpired(token)) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (token) {
      clearStoredAuth();
      if (typeof window !== 'undefined') {
        window.location.href = '/login?session=expired';
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle auth expiry globally
API.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthFailure = error.response?.status === 401;
    const isExpiredToken = isAuthFailure && (
      error.response?.data?.message?.toLowerCase().includes('expired') ||
      error.response?.data?.message?.toLowerCase().includes('token') ||
      error.response?.data?.message?.toLowerCase().includes('unauthorized') ||
      error.response?.data?.message?.toLowerCase().includes('invalid credentials')
    );

    if (isAuthFailure) {
      clearStoredAuth();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login?session=expired';
      }
    }

    if (isExpiredToken && typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login?session=expired';
    }

    return Promise.reject(error);
  }
);

export default API;
