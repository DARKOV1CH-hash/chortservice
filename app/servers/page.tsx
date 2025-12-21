'use client';

import { useEffect, useState, useCallback } from 'react';
import { serverApi } from '@/lib/api';
import type { Server, ServerCreate, ServerUpdate, CapacityMode, ServerStatus } from '@/lib/types';
import { Button, Card, Table, Pagination, Modal, Input, Select, Textarea, Badge } from '@/components/ui';
import { useRealtimeUpdates } from '@/hooks/useWebSocket';

const CAPACITY_OPTIONS = [
  { value: '1:5', label: '1:5 (5 domains max)' },
  { value: '1:7', label: '1:7 (7 domains max)' },
  { value: '1:10', label: '1:10 (10 domains max)' },
];

export default function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ServerStatus | ''>('');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [serverDetail, setServerDetail] = useState<Server & { assigned_domains: string[] } | null>(null);

  // Form state
  const [formData, setFormData] = useState<ServerCreate>({
    name: '',
    ip_address: '',
    capacity_mode: '1:5',
    is_central_config: true,
    description: '',
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadServers = useCallback(async () => {
    try {
      const response = await serverApi.list(
        page,
        pageSize,
        statusFilter || undefined
      );
      setServers(response.servers);
      setTotal(response.total);
    } catch (error) {
      console.error('Failed to load servers:', error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // Real-time updates
  useRealtimeUpdates('servers', loadServers);

  const handleCreate = async () => {
    setFormError('');
    setSubmitting(true);

    try {
      await serverApi.create(formData);
      setShowCreateModal(false);
      resetForm();
      loadServers();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create server');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedServer) return;

    setFormError('');
    setSubmitting(true);

    try {
      const updateData: ServerUpdate = {
        name: formData.name,
        ip_address: formData.ip_address,
        capacity_mode: formData.capacity_mode,
        is_central_config: formData.is_central_config,
        description: formData.description || null,
      };

      await serverApi.update(selectedServer.id, updateData);
      setShowEditModal(false);
      resetForm();
      loadServers();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to update server');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedServer) return;

    setSubmitting(true);

    try {
      await serverApi.delete(selectedServer.id);
      setShowDeleteModal(false);
      setSelectedServer(null);
      loadServers();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to delete server');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (server: Server) => {
    setSelectedServer(server);
    setFormData({
      name: server.name,
      ip_address: server.ip_address,
      capacity_mode: server.capacity_mode,
      is_central_config: server.is_central_config,
      description: server.description || '',
    });
    setFormError('');
    setShowEditModal(true);
  };

  const openDeleteModal = (server: Server) => {
    setSelectedServer(server);
    setFormError('');
    setShowDeleteModal(true);
  };

  const openDetailModal = async (server: Server) => {
    try {
      const detail = await serverApi.get(server.id);
      setServerDetail(detail);
      setShowDetailModal(true);
    } catch (error) {
      console.error('Failed to load server details:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      ip_address: '',
      capacity_mode: '1:5',
      is_central_config: true,
      description: '',
    });
    setFormError('');
    setSelectedServer(null);
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (item: Record<string, unknown>) => {
        const server = item as unknown as Server;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openDetailModal(server);
            }}
            className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            {server.name}
          </button>
        );
      },
    },
    {
      key: 'ip_address',
      header: 'IP Address',
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Record<string, unknown>) => {
        const server = item as unknown as Server;
        return (
          <Badge variant={server.status === 'free' ? 'success' : 'warning'}>
            {server.status}
          </Badge>
        );
      },
    },
    {
      key: 'capacity',
      header: 'Capacity',
      render: (item: Record<string, unknown>) => {
        const server = item as unknown as Server;
        return (
          <div className="flex items-center gap-2">
            <span>{server.current_domains}/{server.max_domains}</span>
            <div className="w-16 bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${
                  server.current_domains >= server.max_domains
                    ? 'bg-red-500'
                    : server.current_domains > server.max_domains * 0.7
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${(server.current_domains / server.max_domains) * 100}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'capacity_mode',
      header: 'Mode',
      render: (item: Record<string, unknown>) => {
        const server = item as unknown as Server;
        return <Badge variant="default">{server.capacity_mode}</Badge>;
      },
    },
    {
      key: 'locked_by',
      header: 'Lock',
      render: (item: Record<string, unknown>) => {
        const server = item as unknown as Server;
        return server.locked_by ? (
          <Badge variant="warning">{server.locked_by}</Badge>
        ) : (
          <span className="text-zinc-400">-</span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: Record<string, unknown>) => {
        const server = item as unknown as Server;
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(server);
              }}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openDeleteModal(server);
              }}
              className="text-red-600 hover:text-red-700"
            >
              Delete
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Servers</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage your server infrastructure
          </p>
        </div>
        <Button onClick={() => {
          resetForm();
          setShowCreateModal(true);
        }}>
          Add Server
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ServerStatus | '')}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'free', label: 'Free' },
              { value: 'in_use', label: 'In Use' },
            ]}
            className="w-48"
          />
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          data={servers as unknown as Record<string, unknown>[]}
          keyField="id"
          loading={loading}
          emptyMessage="No servers found"
        />
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
        />
      </Card>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Add Server"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="server-01"
          />
          <Input
            label="IP Address"
            value={formData.ip_address}
            onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
            placeholder="192.168.1.1"
          />
          <Select
            label="Capacity Mode"
            value={formData.capacity_mode}
            onChange={(e) => setFormData({ ...formData, capacity_mode: e.target.value as CapacityMode })}
            options={CAPACITY_OPTIONS}
          />
          <Textarea
            label="Description"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Optional description..."
            rows={3}
          />

          {formError && (
            <p className="text-sm text-red-500">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={submitting}>
              Create Server
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Server"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <Input
            label="IP Address"
            value={formData.ip_address}
            onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
          />
          <Select
            label="Capacity Mode"
            value={formData.capacity_mode}
            onChange={(e) => setFormData({ ...formData, capacity_mode: e.target.value as CapacityMode })}
            options={CAPACITY_OPTIONS}
          />
          <Textarea
            label="Description"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
          />

          {formError && (
            <p className="text-sm text-red-500">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} loading={submitting}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Server"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-zinc-600 dark:text-zinc-400">
            Are you sure you want to delete <strong>{selectedServer?.name}</strong>?
            This action cannot be undone.
          </p>

          {selectedServer && selectedServer.current_domains > 0 && (
            <p className="text-sm text-yellow-600 dark:text-yellow-500">
              Warning: This server has {selectedServer.current_domains} assigned domain(s).
              You must remove all assignments before deleting.
            </p>
          )}

          {formError && (
            <p className="text-sm text-red-500">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={submitting}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={serverDetail?.name || 'Server Details'}
        size="lg"
      >
        {serverDetail && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  IP Address
                </label>
                <p className="text-zinc-900 dark:text-zinc-100">{serverDetail.ip_address}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Status
                </label>
                <p>
                  <Badge variant={serverDetail.status === 'free' ? 'success' : 'warning'}>
                    {serverDetail.status}
                  </Badge>
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Capacity Mode
                </label>
                <p className="text-zinc-900 dark:text-zinc-100">{serverDetail.capacity_mode}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Domains
                </label>
                <p className="text-zinc-900 dark:text-zinc-100">
                  {serverDetail.current_domains}/{serverDetail.max_domains}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Created By
                </label>
                <p className="text-zinc-900 dark:text-zinc-100">{serverDetail.created_by}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Created At
                </label>
                <p className="text-zinc-900 dark:text-zinc-100">
                  {new Date(serverDetail.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            {serverDetail.description && (
              <div>
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Description
                </label>
                <p className="text-zinc-900 dark:text-zinc-100">{serverDetail.description}</p>
              </div>
            )}

            {serverDetail.assigned_domains.length > 0 && (
              <div>
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Assigned Domains ({serverDetail.assigned_domains.length})
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {serverDetail.assigned_domains.map((domain) => (
                    <Badge key={domain} variant="info">{domain}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
              <Button variant="secondary" onClick={() => setShowDetailModal(false)}>
                Close
              </Button>
              <Button onClick={() => {
                setShowDetailModal(false);
                openEditModal(serverDetail);
              }}>
                Edit
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
