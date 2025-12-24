'use client';

import { useEffect, useState, useCallback } from 'react';
import { domainApi, serverApi, assignmentApi } from '@/lib/api';
import type { Domain, DomainCreate, DomainUpdate, Server } from '@/lib/types';
import { Button, Card, Table, Pagination, Modal, Input, Textarea, Badge, Select, Checkbox } from '@/components/ui';
import { useRealtimeUpdates } from '@/hooks/useWebSocket';

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showServerExportModal, setShowServerExportModal] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [selectedDomains, setSelectedDomains] = useState<Set<number>>(new Set());
  const [availableServers, setAvailableServers] = useState<Server[]>([]);

  // Server export modal state
  const [exportServerId, setExportServerId] = useState<number | null>(null);
  const [exportServerName, setExportServerName] = useState<string>('');
  const [exportContent, setExportContent] = useState<string>('');
  const [exportLoading, setExportLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState<DomainCreate>({
    name: '',
    description: '',
    tags: [],
  });
  const [bulkDomains, setBulkDomains] = useState('');
  const [bulkTags, setBulkTags] = useState('');
  const [assignServerId, setAssignServerId] = useState<number | ''>('');
  const [autoAssign, setAutoAssign] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadDomains = useCallback(async () => {
    try {
      const response = await domainApi.list(
        page,
        pageSize,
        statusFilter || undefined,
        searchQuery || undefined
      );
      setDomains(response.domains);
      setTotal(response.total);
    } catch (error) {
      console.error('Failed to load domains:', error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, searchQuery]);

  useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  // Real-time updates
  useRealtimeUpdates('domains', loadDomains);
  useRealtimeUpdates('assignments', loadDomains);

  const loadAvailableServers = async () => {
    try {
      const servers = await serverApi.listAvailable();
      setAvailableServers(servers);
    } catch (error) {
      console.error('Failed to load available servers:', error);
    }
  };

  const openServerExportModal = async (serverId: number, serverName: string) => {
    setExportServerId(serverId);
    setExportServerName(serverName);
    setExportContent('');
    setExportLoading(true);
    setShowServerExportModal(true);

    try {
      const content = await assignmentApi.exportDomainHub(serverId);
      setExportContent(content);
    } catch (error) {
      console.error('Failed to load server export:', error);
      setExportContent('Failed to load export');
    } finally {
      setExportLoading(false);
    }
  };

  const copyExportToClipboard = () => {
    navigator.clipboard.writeText(exportContent);
  };

  const downloadExport = () => {
    const blob = new Blob([exportContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportServerName}-export.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleCreate = async () => {
    setFormError('');
    setSubmitting(true);

    try {
      await domainApi.create(formData);
      setShowCreateModal(false);
      resetForm();
      loadDomains();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create domain');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkCreate = async () => {
    setFormError('');
    setSubmitting(true);

    try {
      const domainsList = bulkDomains
        .split('\n')
        .map(d => d.trim())
        .filter(d => d.length > 0);

      if (domainsList.length === 0) {
        setFormError('Please enter at least one domain');
        setSubmitting(false);
        return;
      }

      const tags = bulkTags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const result = await domainApi.bulkCreate({
        domains: domainsList,
        tags: tags.length > 0 ? tags : undefined,
      });

      setShowBulkModal(false);
      setBulkDomains('');
      setBulkTags('');
      loadDomains();

      if (result.skipped > 0) {
        alert(`Created ${result.created} domains. Skipped ${result.skipped} (already exist): ${result.skipped_domains.join(', ')}`);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to bulk create domains');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedDomain) return;

    setFormError('');
    setSubmitting(true);

    try {
      const updateData: DomainUpdate = {
        name: formData.name,
        description: formData.description || null,
        tags: formData.tags && formData.tags.length > 0 ? formData.tags : null,
      };

      await domainApi.update(selectedDomain.id, updateData);
      setShowEditModal(false);
      resetForm();
      loadDomains();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to update domain');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDomain) return;

    setSubmitting(true);

    try {
      await domainApi.delete(selectedDomain.id);
      setShowDeleteModal(false);
      setSelectedDomain(null);
      loadDomains();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to delete domain');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssign = async () => {
    setFormError('');
    setSubmitting(true);

    try {
      const domainIds = Array.from(selectedDomains);

      if (autoAssign) {
        await assignmentApi.autoAssign({
          domain_ids: domainIds,
        });
      } else if (assignServerId) {
        await assignmentApi.bulkCreate({
          domain_ids: domainIds,
          server_id: Number(assignServerId),
        });
      } else {
        setFormError('Please select a server or enable auto-assign');
        setSubmitting(false);
        return;
      }

      setShowAssignModal(false);
      setSelectedDomains(new Set());
      setAssignServerId('');
      setAutoAssign(false);
      loadDomains();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to assign domains');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnassign = async (domain: Domain) => {
    try {
      await assignmentApi.deleteByDomain(domain.id);
      loadDomains();
    } catch (error) {
      console.error('Failed to unassign domain:', error);
    }
  };

  const openEditModal = (domain: Domain) => {
    setSelectedDomain(domain);
    setFormData({
      name: domain.name,
      description: domain.description || '',
      tags: domain.tags || [],
    });
    setFormError('');
    setShowEditModal(true);
  };

  const openDeleteModal = (domain: Domain) => {
    setSelectedDomain(domain);
    setFormError('');
    setShowDeleteModal(true);
  };

  const openAssignModal = () => {
    loadAvailableServers();
    setFormError('');
    setShowAssignModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      tags: [],
    });
    setFormError('');
    setSelectedDomain(null);
  };

  const toggleSelectDomain = (id: number) => {
    const newSelected = new Set(selectedDomains);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedDomains(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedDomains.size === domains.filter(d => d.status === 'free').length) {
      setSelectedDomains(new Set());
    } else {
      setSelectedDomains(new Set(domains.filter(d => d.status === 'free').map(d => d.id)));
    }
  };

  const columns = [
    {
      key: 'select',
      header: (
        <Checkbox
          checked={selectedDomains.size > 0 && selectedDomains.size === domains.filter(d => d.status === 'free').length}
          onChange={toggleSelectAll}
        />
      ),
      render: (domain: Record<string, unknown>) => {
        const d = domain as unknown as Domain;
        return d.status === 'free' ? (
          <Checkbox
            checked={selectedDomains.has(d.id)}
            onChange={() => toggleSelectDomain(d.id)}
          />
        ) : <span className="text-zinc-300">-</span>;
      },
    },
    {
      key: 'name',
      header: 'Domain',
      render: (domain: Record<string, unknown>) => {
        const d = domain as unknown as Domain;
        return (
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {d.name}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (domain: Record<string, unknown>) => {
        const d = domain as unknown as Domain;
        return (
          <Badge variant={d.status === 'free' ? 'success' : 'info'}>
            {d.status}
          </Badge>
        );
      },
    },
    {
      key: 'assigned_server_name',
      header: 'Server',
      render: (domain: Record<string, unknown>) => {
        const d = domain as unknown as Domain;
        return d.assigned_server_name && d.assigned_server_id ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openServerExportModal(d.assigned_server_id!, d.assigned_server_name!);
            }}
            className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
          >
            {d.assigned_server_name}
          </button>
        ) : (
          <span className="text-zinc-400">-</span>
        );
      },
    },
    {
      key: 'tags',
      header: 'Tags',
      render: (domain: Record<string, unknown>) => {
        const d = domain as unknown as Domain;
        return d.tags && d.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {d.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="default">{tag}</Badge>
            ))}
            {d.tags.length > 3 && (
              <Badge variant="default">+{d.tags.length - 3}</Badge>
            )}
          </div>
        ) : (
          <span className="text-zinc-400">-</span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (domain: Record<string, unknown>) => {
        const d = domain as unknown as Domain;
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(d);
              }}
            >
              Edit
            </Button>
            {d.status === 'assigned' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnassign(d);
                }}
                className="text-orange-600 hover:text-orange-700"
              >
                Unassign
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openDeleteModal(d);
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
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Domains</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage your domain inventory
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedDomains.size > 0 && (
            <Button variant="secondary" onClick={openAssignModal}>
              Assign ({selectedDomains.size})
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowBulkModal(true)}>
            Bulk Import
          </Button>
          <Button onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}>
            Add Domain
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <Input
            placeholder="Search domains..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'free', label: 'Free' },
              { value: 'assigned', label: 'Assigned' },
            ]}
            className="w-48"
          />
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          data={domains as unknown as Record<string, unknown>[]}
          keyField="id"
          loading={loading}
          emptyMessage="No domains found"
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
        title="Add Domain"
      >
        <div className="space-y-4">
          <Input
            label="Domain Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="example.com"
          />
          <Textarea
            label="Description"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Optional description..."
            rows={3}
          />
          <Input
            label="Tags (comma-separated)"
            value={formData.tags?.join(', ') || ''}
            onChange={(e) => setFormData({
              ...formData,
              tags: e.target.value.split(',').map(t => t.trim()).filter(t => t),
            })}
            placeholder="tag1, tag2"
          />

          {formError && (
            <p className="text-sm text-red-500">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={submitting}>
              Create Domain
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Import Modal */}
      <Modal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        title="Bulk Import Domains"
        size="lg"
      >
        <div className="space-y-4">
          <Textarea
            label="Domains (one per line)"
            value={bulkDomains}
            onChange={(e) => setBulkDomains(e.target.value)}
            placeholder="example1.com&#10;example2.com&#10;example3.com"
            rows={10}
          />
          <Input
            label="Tags for all (comma-separated)"
            value={bulkTags}
            onChange={(e) => setBulkTags(e.target.value)}
            placeholder="imported, bulk"
          />

          {formError && (
            <p className="text-sm text-red-500">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowBulkModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkCreate} loading={submitting}>
              Import Domains
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Domain"
      >
        <div className="space-y-4">
          <Input
            label="Domain Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <Textarea
            label="Description"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
          />
          <Input
            label="Tags (comma-separated)"
            value={formData.tags?.join(', ') || ''}
            onChange={(e) => setFormData({
              ...formData,
              tags: e.target.value.split(',').map(t => t.trim()).filter(t => t),
            })}
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
        title="Delete Domain"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-zinc-600 dark:text-zinc-400">
            Are you sure you want to delete <strong>{selectedDomain?.name}</strong>?
            This action cannot be undone.
          </p>

          {selectedDomain?.status === 'assigned' && (
            <p className="text-sm text-yellow-600 dark:text-yellow-500">
              Warning: This domain is currently assigned to a server.
              You must unassign it first.
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

      {/* Assign Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title={`Assign ${selectedDomains.size} Domain(s)`}
      >
        <div className="space-y-4">
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Selected domains: {selectedDomains.size}
            </p>
          </div>

          <Checkbox
            label="Auto-assign (fill servers one at a time)"
            checked={autoAssign}
            onChange={(e) => {
              setAutoAssign(e.target.checked);
              if (e.target.checked) setAssignServerId('');
            }}
          />

          {!autoAssign && (
            <Select
              label="Select Server"
              value={String(assignServerId)}
              onChange={(e) => setAssignServerId(e.target.value ? Number(e.target.value) : '')}
              options={[
                { value: '', label: 'Choose a server...' },
                ...availableServers.map(s => ({
                  value: String(s.id),
                  label: `${s.name} (${s.current_domains}/${s.max_domains} used)`,
                })),
              ]}
            />
          )}

          {formError && (
            <p className="text-sm text-red-500">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowAssignModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} loading={submitting}>
              Assign Domains
            </Button>
          </div>
        </div>
      </Modal>

      {/* Server Export Modal */}
      <Modal
        isOpen={showServerExportModal}
        onClose={() => setShowServerExportModal(false)}
        title={`Domain Hub Export - ${exportServerName}`}
        size="lg"
      >
        <div className="space-y-4">
          {exportLoading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : (
            <>
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                <div className="bg-zinc-50 dark:bg-zinc-800 px-4 py-2 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700">
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Domain Hub Format
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={copyExportToClipboard}>
                      Copy
                    </Button>
                    <Button variant="ghost" size="sm" onClick={downloadExport}>
                      Download
                    </Button>
                  </div>
                </div>
                <pre className="p-4 text-sm font-mono text-zinc-800 dark:text-zinc-200 overflow-auto max-h-96 whitespace-pre-wrap">
                  {exportContent || 'No domains assigned to this server'}
                </pre>
              </div>
            </>
          )}

          <div className="flex justify-end pt-4">
            <Button variant="secondary" onClick={() => setShowServerExportModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
