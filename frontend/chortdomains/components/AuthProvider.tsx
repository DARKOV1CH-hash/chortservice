'use client';

import { useEffect, useState } from 'react';
import { authApi } from '@/lib/api';
import type { User } from '@/lib/types';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userData = await authApi.getUser();
        setUser(userData);

        // If not authenticated, redirect to login
        if (!userData.authenticated) {
          window.location.href = authApi.getLoginUrl();
          return;
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        // On error, redirect to login
        window.location.href = authApi.getLoginUrl();
        return;
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-600 dark:text-zinc-400">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!user?.authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-600 dark:text-zinc-400">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
