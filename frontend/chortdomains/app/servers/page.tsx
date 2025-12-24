'use client';

import { useEffect, useState, useCallback } from 'react';
import { serverApi, serverGroupApi } from '@/lib/api';
import type { Server, ServerCreate, ServerUpdate, CapacityMode, ServerStatus, ServerBulkCreate, ServerGroup, ServerGroupCreate } from '@/lib/types';
import { Button, Card, Table, Pagination, Modal, Input, Select, Textarea, Badge } from '@/components/ui';
import { useRealtimeUpdates } from '@/hooks/useWebSocket';

const CAPACITY_OPTIONS = [
  { value: '1:5', label: '1:5 (5 domains max)' },
  { value: '1:7', label: '1:7 (7 domains max)' },
  { value: '1:10', label: '1:10 (10 domains max)' },
];

const GROUP_COLORS = [
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Green' },
  { value: '#f59e0b', label: 'Orange' },
  { value: '#ef4444', label: 'Red' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#6b7280', label: 'Gray' },
];

export default function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [groups, setGroups] = useState<ServerGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ServerStatus | ''>('');
  const [groupFilter, setGroupFilter] = useState<number | ''>('');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [serverDetail, setServerDetail] = useState<Server & { assigned_domains: string[] } | null>(null);

  // Form state
  const [formData, setFormData] = useState<ServerCreate>({
    name: '',
    ip_address: '',
    capacity_mode: '1:5',
    is_central_config: true,
    description: '',
    password: '',
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Bulk import state
  const [bulkData, setBulkData] = useState<ServerBulkCreate>({
    servers: [],
    capacity_mode: '1:5',
    description: '',
  });
  const [bulkText, setBulkText] = useState('');
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number; skipped_ips: string[] } | null>(null);

  // Group modal states
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showAssignGroupModal, setShowAssignGroupModal] = useState(false);
  const [showGroupExportModal, setShowGroupExportModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<ServerGroup | null>(null);
  const [groupFormData, setGroupFormData] = useState<ServerGroupCreate>({
    name: '',
    description: '',
    color: '#3b82f6',
  });
  const [selectedServersForGroup, setSelectedServersForGroup] = useState<number[]>([]);
  const [groupExportContent, setGroupExportContent] = useState('');
  const [ungroupedServers, setUngroupedServers] = useState<Array<{ id: number; name: string; ip_address: string; current_domains: number; max_domains: number; is_locked: boolean }>>([]);
  const [groupSearch, setGroupSearch] = useState('');

  const filteredGroups = groups.filter((group) =>
    groupSearch === '' ||
    group.name.toLowerCase().includes(groupSearch.toLowerCase()) ||
    (group.description && group.description.toLowerCase().includes(groupSearch.toLowerCase()))
  );

  const loadServers = useCallback(async () => {
    try {
      const response = await serverApi.list(
        page,
        pageSize,
        statusFilter || undefined,
        groupFilter || undefined
      );
      setServers(response.servers);
      setTotal(response.total);
    } catch (error) {
      console.error('Failed to load servers:', error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, groupFilter]);

  const loadGroups = useCallback(async () => {
    try {
      const response = await serverGroupApi.list(1, 100);
      setGroups(response.groups);
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  }, []);

  useEffect(() => {
    loadServers();
    loadGroups();
  }, [loadServers, loadGroups]);

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
        password: formData.password || null,
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

  const handleBulkImport = async () => {
    setFormError('');
    setSubmitting(true);
    setBulkResult(null);

    try {
      const servers = bulkText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      if (servers.length === 0) {
        setFormError('Please enter at least one server');
        return;
      }

      const result = await serverApi.bulkCreate({
        servers,
        capacity_mode: bulkData.capacity_mode,
        description: bulkData.description || undefined,
      });

      setBulkResult({
        created: result.created,
        skipped: result.skipped,
        skipped_ips: result.skipped_ips,
      });

      if (result.created > 0) {
        loadServers();
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to import servers');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleLock = async (server: Server) => {
    try {
      await serverApi.toggleLock(server.id);
      loadServers();
    } catch (error) {
      console.error('Failed to toggle lock:', error);
    }
  };

  const handleCreateGroup = async () => {
    setFormError('');
    setSubmitting(true);

    try {
      await serverGroupApi.create(groupFormData);
      setShowGroupModal(false);
      resetGroupForm();
      loadGroups();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create group');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateGroup = async () => {
    if (!selectedGroup) return;

    setFormError('');
    setSubmitting(true);

    try {
      await serverGroupApi.update(selectedGroup.id, groupFormData);
      setShowGroupModal(false);
      resetGroupForm();
      loadGroups();
      loadServers();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to update group');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGroup = async (group: ServerGroup) => {
    if (!confirm(`Are you sure you want to delete group "${group.name}"?`)) return;

    try {
      await serverGroupApi.delete(group.id);
      loadGroups();
      loadServers();
    } catch (error) {
      console.error('Failed to delete group:', error);
    }
  };

  const handleAssignToGroup = async () => {
    if (!selectedGroup || selectedServersForGroup.length === 0) return;

    setFormError('');
    setSubmitting(true);

    try {
      await serverGroupApi.assignServers(selectedGroup.id, selectedServersForGroup);
      setShowAssignGroupModal(false);
      setSelectedServersForGroup([]);
      loadGroups();
      loadServers();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to assign servers');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveFromGroup = async (server: Server) => {
    if (!server.group_id) return;

    try {
      await serverGroupApi.removeServers(server.group_id, [server.id]);
      loadGroups();
      loadServers();
    } catch (error) {
      console.error('Failed to remove from group:', error);
    }
  };

  const handleExportGroup = async (group: ServerGroup) => {
    try {
      const content = await serverGroupApi.exportDomainHub(group.id);
      setGroupExportContent(content);
      setSelectedGroup(group);
      setShowGroupExportModal(true);
    } catch (error) {
      console.error('Failed to export group:', error);
    }
  };

  const openGroupModal = (group?: ServerGroup) => {
    if (group) {
      setSelectedGroup(group);
      setGroupFormData({
        name: group.name,
        description: group.description || '',
        color: group.color || '#3b82f6',
      });
    } else {
      setSelectedGroup(null);
      resetGroupForm();
    }
    setFormError('');
    setShowGroupModal(true);
  };

  const openAssignModal = async (group: ServerGroup) => {
    setSelectedGroup(group);
    setSelectedServersForGroup([]);
    setFormError('');
    try {
      const ungrouped = await serverGroupApi.getUngroupedServers();
      setUngroupedServers(ungrouped);
    } catch (error) {
      console.error('Failed to load ungrouped servers:', error);
    }
    setShowAssignGroupModal(true);
  };

  const resetGroupForm = () => {
    setGroupFormData({
      name: '',
      description: '',
      color: '#3b82f6',
    });
    setSelectedGroup(null);
    setFormError('');
  };

  const openEditModal = (server: Server) => {
    setSelectedServer(server);
    setFormData({
      name: server.name,
      ip_address: server.ip_address,
      capacity_mode: server.capacity_mode,
      is_central_config: server.is_central_config,
      description: server.description || '',
      password: server.password || '',
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
      password: '',
    });
    setFormError('');
    setSelectedServer(null);
  };

  const resetBulkForm = () => {
    setBulkData({
      servers: [],
      capacity_mode: '1:5',
      description: '',
    });
    setBulkText('');
    setBulkResult(null);
    setFormError('');
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
      key: 'group',
      header: 'Group',
      render: (item: Record<string, unknown>) => {
        const server = item as unknown as Server;
        const group = groups.find(g => g.id === server.group_id);
        if (!server.group_id) {
          return <span className="text-zinc-400 dark:text-zinc-500">No group</span>;
        }
        return (
          <div className="flex items-center gap-2">
            {group?.color && (
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: group.color }}
              />
            )}
            <span>{server.group_name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveFromGroup(server);
              }}
              className="text-xs text-zinc-400 hover:text-red-500"
              title="Remove from group"
            >
              ✕
            </button>
          </div>
        );
      },
    },
    {
      key: 'is_locked',
      header: 'Assignment Lock',
      render: (item: Record<string, unknown>) => {
        const server = item as unknown as Server;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleLock(server);
            }}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              server.is_locked
                ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800'
                : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800'
            }`}
          >
            {server.is_locked ? 'Locked' : 'Unlocked'}
          </button>
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
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              resetBulkForm();
              setShowBulkImportModal(true);
            }}
          >
            Bulk Import
          </Button>
          <Button onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}>
            Add Server
          </Button>
        </div>
      </div>

      {/* Server Groups */}
      {groups.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Server Groups</h2>
            <div className="flex items-center gap-3">
              <Input
                placeholder="Search groups..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                className="w-48"
              />
              <Button size="sm" onClick={() => openGroupModal()}>
                New Group
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredGroups.length === 0 && groupSearch ? (
              <p className="col-span-full text-center text-zinc-500 dark:text-zinc-400 py-4">
                No groups match &quot;{groupSearch}&quot;
              </p>
            ) : (
              filteredGroups.map((group) => (
              <div
                key={group.id}
                className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
                style={{ borderLeftWidth: '4px', borderLeftColor: group.color || '#6b7280' }}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-zinc-900 dark:text-zinc-100">{group.name}</h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openGroupModal(group)}
                      className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                      title="Edit group"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(group)}
                      className="p-1 text-zinc-400 hover:text-red-500"
                      title="Delete group"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                {group.description && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">{group.description}</p>
                )}
                <div className="text-sm text-zinc-600 dark:text-zinc-300 space-y-1">
                  <div className="flex justify-between">
                    <span>Servers:</span>
                    <span className="font-medium">{group.server_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Domains:</span>
                    <span className="font-medium">{group.total_domains}/{group.total_capacity}</span>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openAssignModal(group)}
                    className="flex-1"
                  >
                    Add Servers
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleExportGroup(group)}
                    disabled={group.server_count === 0}
                  >
                    Export
                  </Button>
                </div>
              </div>
            ))
            )}
          </div>
        </Card>
      )}

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
          <Select
            label="Group"
            value={String(groupFilter)}
            onChange={(e) => setGroupFilter(e.target.value ? Number(e.target.value) : '')}
            options={[
              { value: '', label: 'All groups' },
              ...groups.map(g => ({ value: String(g.id), label: g.name })),
            ]}
            className="w-48"
          />
          {groups.length === 0 && (
            <Button variant="secondary" size="sm" onClick={() => openGroupModal()}>
              Create First Group
            </Button>
          )}
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
          <Input
            label="Password"
            value={formData.password || ''}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder="Server password (optional)"
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
          <Input
            label="Password"
            value={formData.password || ''}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder="Server password (optional)"
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

      {/* Bulk Import Modal */}
      <Modal
        isOpen={showBulkImportModal}
        onClose={() => setShowBulkImportModal(false)}
        title="Bulk Import Servers"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Enter one server per line. Format: <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">IP password</code> or just <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">IP</code>
          </p>
          <Textarea
            label="Servers"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`38.180.129.110 3o4cuMcKSF\n192.168.1.1 password123\n10.0.0.1`}
            rows={10}
          />
          <Select
            label="Capacity Mode"
            value={bulkData.capacity_mode}
            onChange={(e) => setBulkData({ ...bulkData, capacity_mode: e.target.value as CapacityMode })}
            options={CAPACITY_OPTIONS}
          />
          <Input
            label="Description (optional)"
            value={bulkData.description || ''}
            onChange={(e) => setBulkData({ ...bulkData, description: e.target.value })}
            placeholder="Batch import description..."
          />

          {formError && (
            <p className="text-sm text-red-500">{formError}</p>
          )}

          {bulkResult && (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                Import complete: {bulkResult.created} created, {bulkResult.skipped} skipped
              </p>
              {bulkResult.skipped_ips.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Skipped IPs (already exist):</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {bulkResult.skipped_ips.map((ip) => (
                      <Badge key={ip} variant="warning">{ip}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowBulkImportModal(false)}>
              Close
            </Button>
            <Button onClick={handleBulkImport} loading={submitting}>
              Import Servers
            </Button>
          </div>
        </div>
      </Modal>

      {/* Group Create/Edit Modal */}
      <Modal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        title={selectedGroup ? 'Edit Group' : 'Create Group'}
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={groupFormData.name}
            onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
            placeholder="Production Servers"
          />
          <Textarea
            label="Description"
            value={groupFormData.description || ''}
            onChange={(e) => setGroupFormData({ ...groupFormData, description: e.target.value })}
            placeholder="Optional description..."
            rows={3}
          />
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Color
            </label>
            <div className="flex gap-2">
              {GROUP_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setGroupFormData({ ...groupFormData, color: color.value })}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    groupFormData.color === color.value
                      ? 'border-zinc-900 dark:border-white scale-110'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          {formError && (
            <p className="text-sm text-red-500">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowGroupModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={selectedGroup ? handleUpdateGroup : handleCreateGroup}
              loading={submitting}
            >
              {selectedGroup ? 'Save Changes' : 'Create Group'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Assign Servers to Group Modal */}
      <Modal
        isOpen={showAssignGroupModal}
        onClose={() => setShowAssignGroupModal(false)}
        title={`Add Servers to ${selectedGroup?.name || 'Group'}`}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Select servers to add to this group. Only ungrouped servers are shown.
          </p>

          <div className="max-h-96 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-lg">
            {ungroupedServers.length === 0 ? (
              <p className="p-4 text-center text-zinc-500 dark:text-zinc-400">
                No ungrouped servers available
              </p>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {ungroupedServers.map((server) => (
                  <label
                    key={server.id}
                    className="flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedServersForGroup.includes(server.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedServersForGroup([...selectedServersForGroup, server.id]);
                        } else {
                          setSelectedServersForGroup(selectedServersForGroup.filter(id => id !== server.id));
                        }
                      }}
                      className="rounded border-zinc-300 dark:border-zinc-600"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{server.name}</div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">{server.ip_address}</div>
                    </div>
                    <div className="text-sm text-zinc-500">
                      {server.current_domains}/{server.max_domains} domains
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {selectedServersForGroup.length > 0 && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {selectedServersForGroup.length} server(s) selected
            </p>
          )}

          {formError && (
            <p className="text-sm text-red-500">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowAssignGroupModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssignToGroup}
              loading={submitting}
              disabled={selectedServersForGroup.length === 0}
            >
              Add to Group
            </Button>
          </div>
        </div>
      </Modal>

      {/* Group Export Modal */}
      <Modal
        isOpen={showGroupExportModal}
        onClose={() => setShowGroupExportModal(false)}
        title={`Export: ${selectedGroup?.name || 'Group'}`}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Domain Hub export format for all servers in this group
          </p>

          <Textarea
            value={groupExportContent}
            readOnly
            rows={15}
            className="font-mono text-sm"
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowGroupExportModal(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(groupExportContent);
              }}
            >
              Copy to Clipboard
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
