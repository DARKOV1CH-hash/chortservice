'use client';

import { useState, useEffect, useCallback } from 'react';
import { authApi } from '@/lib/api';
import type { User } from '@/lib/types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const userData = await authApi.getUser();
      setUser(userData);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      setUser({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = () => {
    window.location.href = authApi.getLoginUrl();
  };

  const logout = () => {
    window.location.href = authApi.getLogoutUrl();
  };

  return {
    user,
    loading,
    isAuthenticated: user?.authenticated ?? false,
    isAdmin: user?.is_admin ?? false,
    login,
    logout,
    refetch: fetchUser,
  };
}
