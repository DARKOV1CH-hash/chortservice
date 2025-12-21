'use client';

import { useEffect, useState, useCallback } from 'react';
import { assignmentApi, serverApi, domainApi } from '@/lib/api';
import type { AssignmentStats, Server, Domain } from '@/lib/types';
import { Card, Badge } from '@/components/ui';
import { useRealtimeUpdates } from '@/hooks/useWebSocket';
import Link from 'next/link';

export default function Dashboard() {
  const [stats, setStats] = useState<AssignmentStats | null>(null);
  const [recentServers, setRecentServers] = useState<Server[]>([]);
  const [recentDomains, setRecentDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [statsData, serversData, domainsData] = await Promise.all([
        assignmentApi.getStats(),
        serverApi.list(1, 5),
        domainApi.list(1, 5),
      ]);
      setStats(statsData);
      setRecentServers(serversData.servers);
      setRecentDomains(domainsData.domains);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time updates
  useRealtimeUpdates('servers', loadData);
  useRealtimeUpdates('domains', loadData);
  useRealtimeUpdates('assignments', loadData);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Overview of your domain and server management
        </p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Servers"
            value={stats.total_servers}
            subtitle={`${stats.servers_in_use} in use, ${stats.servers_free} free`}
            color="blue"
          />
          <StatCard
            title="Total Domains"
            value={stats.total_domains}
            subtitle={`${stats.assigned_domains} assigned, ${stats.free_domains} free`}
            color="green"
          />
          <StatCard
            title="Average Load"
            value={`${(stats.average_load * 100).toFixed(1)}%`}
            subtitle="Across all servers"
            color="yellow"
          />
          <StatCard
            title="Servers In Use"
            value={stats.servers_in_use}
            subtitle={`${((stats.servers_in_use / Math.max(stats.total_servers, 1)) * 100).toFixed(0)}% utilization`}
            color="purple"
          />
        </div>
      )}

      {/* Capacity by Mode */}
      {stats?.capacity_utilization && Object.keys(stats.capacity_utilization).length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Capacity by Mode
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(stats.capacity_utilization).map(([mode, data]) => (
              <div
                key={mode}
                className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg"
              >
                <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Mode {mode}
                </div>
                <div className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {data.servers} servers
                </div>
                <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {data.used}/{data.capacity} domains used
                </div>
                <div className="mt-2 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(data.used / Math.max(data.capacity, 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Servers */}
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Recent Servers
            </h2>
            <Link
              href="/servers"
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {recentServers.length === 0 ? (
              <div className="px-6 py-8 text-center text-zinc-500 dark:text-zinc-400">
                No servers yet
              </div>
            ) : (
              recentServers.map((server) => (
                <Link
                  key={server.id}
                  href={`/servers?id=${server.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <div>
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {server.name}
                    </div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      {server.ip_address}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={server.status === 'free' ? 'success' : 'warning'}>
                      {server.status}
                    </Badge>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      {server.current_domains}/{server.max_domains}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        {/* Recent Domains */}
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Recent Domains
            </h2>
            <Link
              href="/domains"
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {recentDomains.length === 0 ? (
              <div className="px-6 py-8 text-center text-zinc-500 dark:text-zinc-400">
                No domains yet
              </div>
            ) : (
              recentDomains.map((domain) => (
                <Link
                  key={domain.id}
                  href={`/domains?id=${domain.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <div>
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {domain.name}
                    </div>
                    {domain.assigned_server_name && (
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">
                        Assigned to {domain.assigned_server_name}
                      </div>
                    )}
                  </div>
                  <Badge variant={domain.status === 'free' ? 'success' : 'info'}>
                    {domain.status}
                  </Badge>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  color: 'blue' | 'green' | 'yellow' | 'purple';
}

function StatCard({ title, value, subtitle, color }: StatCardProps) {
  const colors = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
  };

  return (
    <Card className={`p-6 border ${colors[color]}`}>
      <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {title}
      </div>
      <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
      <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {subtitle}
      </div>
    </Card>
  );
}
