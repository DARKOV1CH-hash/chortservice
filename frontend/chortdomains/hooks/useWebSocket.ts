'use client';

import { useEffect, useCallback, useState } from 'react';
import { wsClient } from '@/lib/websocket';
import type { WSMessage } from '@/lib/types';

export function useWebSocket(user = 'dev@example.com') {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  useEffect(() => {
    wsClient.connect(user);

    const unsubscribe = wsClient.subscribe((message) => {
      setLastMessage(message);
      if (message.data?.action === 'connected' || message.channel === 'connected') {
        setIsConnected(true);
      }
    });

    // Check connection status periodically
    const interval = setInterval(() => {
      setIsConnected(wsClient.isConnected);
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [user]);

  const notifyLockAcquired = useCallback((resource: string) => {
    wsClient.notifyLockAcquired(resource);
  }, []);

  const notifyLockReleased = useCallback((resource: string) => {
    wsClient.notifyLockReleased(resource);
  }, []);

  return {
    isConnected,
    lastMessage,
    notifyLockAcquired,
    notifyLockReleased,
  };
}

export function useRealtimeUpdates(
  channel: 'servers' | 'domains' | 'assignments' | 'locks',
  onUpdate: (action: string, data: unknown) => void
) {
  useEffect(() => {
    const unsubscribe = wsClient.subscribe((message) => {
      if (message.channel === channel) {
        onUpdate(message.data.action, message.data);
      }
    });

    return unsubscribe;
  }, [channel, onUpdate]);
}
