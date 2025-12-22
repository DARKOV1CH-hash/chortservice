'use client';

import { useEffect, useState, useCallback } from 'react';
import { assignmentApi, serverApi } from '@/lib/api';
import type { AssignmentStats, CapacityReport, Server } from '@/lib/types';
import { Button, Card, Badge, Modal, Select } from '@/components/ui';
import { useRealtimeUpdates } from '@/hooks/useWebSocket';

export default function AssignmentsPage() {
  const [stats, setStats] = useState<AssignmentStats | null>(null);
  const [capacityReport, setCapacityReport] = useState<CapacityReport | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);

  // Export modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState<'domain-hub' | 'csv'>('domain-hub');
  const [exportServerId, setExportServerId] = useState<string>('');
  const [exportContent, setExportContent] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [statsData, reportData, serversData] = await Promise.all([
        assignmentApi.getStats(),
        assignmentApi.getCapacityReport(),
        serverApi.list(1, 100),
      ]);
      setStats(statsData);
      setCapacityReport(reportData);
      setServers(serversData.servers);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time updates
  useRealtimeUpdates('assignments', loadData);
  useRealtimeUpdates('servers', loadData);
  useRealtimeUpdates('domains', loadData);

  const handleExport = async () => {
    setExporting(true);
    try {
      let content: string;
      if (exportType === 'domain-hub') {
        content = await assignmentApi.exportDomainHub(
          exportServerId ? Number(exportServerId) : undefined
        );
      } else {
        content = await assignmentApi.exportCsv();
      }
      setExportContent(content);
    } catch (error) {
      console.error('Failed to export:', error);
    } finally {
      setExporting(false);
    }
  };

  const downloadExport = () => {
    const blob = new Blob([exportContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportType === 'domain-hub' ? 'domain-hub-export.txt' : 'assignments.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(exportContent);
  };

  const handleClearServerAssignments = async (serverId: number) => {
    if (!confirm('Are you sure you want to remove all assignments from this server?')) {
      return;
    }

    try {
      await assignmentApi.deleteByServer(serverId);
      loadData();
    } catch (error) {
      console.error('Failed to clear assignments:', error);
    }
  };

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Assignments</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            View and export domain-server assignments
          </p>
        </div>
        <Button onClick={() => {
          setExportContent('');
          setShowExportModal(true);
        }}>
          Export Data
        </Button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total Servers" value={stats.total_servers} />
          <StatCard label="Servers In Use" value={stats.servers_in_use} />
          <StatCard label="Total Domains" value={stats.total_domains} />
          <StatCard label="Assigned Domains" value={stats.assigned_domains} />
          <StatCard label="Free Domains" value={stats.free_domains} />
          <StatCard label="Average Load" value={`${(stats.average_load).toFixed(1)}%`} />
        </div>
      )}

      {/* Capacity Overview */}
      {capacityReport && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Server Capacity Overview
            </h2>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
              Total: {capacityReport.summary?.used_capacity ?? 0}/{capacityReport.summary?.total_capacity ?? 0} domains
              ({(capacityReport.summary?.overall_utilization ?? 0).toFixed(1)}% utilized)
            </div>
          </div>

          <div className="space-y-3">
            {(capacityReport.servers ?? []).map((server) => (
              <div
                key={server.id}
                className="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {server.name}
                    </span>
                    <Badge variant="default">{server.capacity_mode}</Badge>
                  </div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    {server.ip_address}
                  </div>
                </div>

                <div className="flex items-center gap-3 w-64">
                  <div className="flex-1">
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                      {server.current_domains ?? 0}/{server.max_domains ?? 0} domains
                    </div>
                    <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          (server.utilization_percent ?? 0) >= 100
                            ? 'bg-red-500'
                            : (server.utilization_percent ?? 0) > 70
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(server.utilization_percent ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 w-12 text-right">
                    {(server.utilization_percent ?? 0).toFixed(0)}%
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {(server.current_domains ?? 0) > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleClearServerAssignments(server.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Clear All
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {(capacityReport.servers ?? []).length === 0 && (
              <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                No servers found
              </div>
            )}
          </div>
        </Card>
      )}


      {/* Export Modal */}
      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Assignments"
        size="xl"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Select
              label="Export Format"
              value={exportType}
              onChange={(e) => {
                setExportType(e.target.value as 'domain-hub' | 'csv');
                setExportContent('');
              }}
              options={[
                { value: 'domain-hub', label: 'Domain Hub Format' },
                { value: 'csv', label: 'CSV' },
              ]}
            />

            {exportType === 'domain-hub' && (
              <Select
                label="Server (optional)"
                value={exportServerId}
                onChange={(e) => {
                  setExportServerId(e.target.value);
                  setExportContent('');
                }}
                options={[
                  { value: '', label: 'All servers' },
                  ...servers.map(s => ({
                    value: String(s.id),
                    label: s.name,
                  })),
                ]}
              />
            )}

            <div className="flex-1" />

            <Button onClick={handleExport} loading={exporting}>
              Generate Export
            </Button>
          </div>

          {exportContent && (
            <>
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                <div className="bg-zinc-50 dark:bg-zinc-800 px-4 py-2 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700">
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Preview
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={copyToClipboard}>
                      Copy
                    </Button>
                    <Button variant="ghost" size="sm" onClick={downloadExport}>
                      Download
                    </Button>
                  </div>
                </div>
                <pre className="p-4 text-sm font-mono text-zinc-800 dark:text-zinc-200 overflow-auto max-h-96">
                  {exportContent}
                </pre>
              </div>
            </>
          )}


        </div>
      </Modal>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</div>
    </Card>
  );
}
