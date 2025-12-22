import type {
  Server,
  ServerCreate,
  ServerUpdate,
  ServerListResponse,
  ServerWithAssignments,
  Domain,
  DomainCreate,
  DomainBulkCreate,
  DomainUpdate,
  DomainListResponse,
  AssignmentCreate,
  AssignmentBulkCreate,
  AssignmentAutoCreate,
  Assignment,
  AssignmentStats,
  BulkCreateResponse,
  BulkAssignResponse,
  AutoAssignResponse,
  CapacityReport,
  ServerStatus,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}/api/v1${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(response.status, error.detail || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Server API
export const serverApi = {
  list: async (
    page = 1,
    pageSize = 50,
    status?: ServerStatus
  ): Promise<ServerListResponse> => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    if (status) params.append('status_filter', status);
    return fetchApi(`/servers?${params}`);
  },

  get: async (id: number): Promise<ServerWithAssignments> => {
    return fetchApi(`/servers/${id}`);
  },

  create: async (data: ServerCreate): Promise<Server> => {
    return fetchApi('/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: ServerUpdate): Promise<Server> => {
    return fetchApi(`/servers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    return fetchApi(`/servers/${id}`, { method: 'DELETE' });
  },

  lock: async (id: number): Promise<{ message: string }> => {
    return fetchApi(`/servers/${id}/lock`, { method: 'POST' });
  },

  unlock: async (id: number): Promise<{ message: string }> => {
    return fetchApi(`/servers/${id}/unlock`, { method: 'POST' });
  },

  listAvailable: async (): Promise<Server[]> => {
    return fetchApi('/servers/available/list');
  },
};

// Domain API
export const domainApi = {
  list: async (
    page = 1,
    pageSize = 50,
    status?: string,
    search?: string,
    tags?: string[]
  ): Promise<DomainListResponse> => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    if (status) params.append('status_filter', status);
    if (search) params.append('search', search);
    if (tags) tags.forEach(tag => params.append('tags', tag));
    return fetchApi(`/domains?${params}`);
  },

  get: async (id: number): Promise<Domain> => {
    return fetchApi(`/domains/${id}`);
  },

  create: async (data: DomainCreate): Promise<Domain> => {
    return fetchApi('/domains', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  bulkCreate: async (data: DomainBulkCreate): Promise<BulkCreateResponse> => {
    return fetchApi('/domains/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: number, data: DomainUpdate): Promise<Domain> => {
    return fetchApi(`/domains/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    return fetchApi(`/domains/${id}`, { method: 'DELETE' });
  },

  lock: async (id: number): Promise<{ message: string }> => {
    return fetchApi(`/domains/${id}/lock`, { method: 'POST' });
  },

  unlock: async (id: number): Promise<{ message: string }> => {
    return fetchApi(`/domains/${id}/unlock`, { method: 'POST' });
  },
};

// Assignment API
export const assignmentApi = {
  create: async (data: AssignmentCreate): Promise<Assignment> => {
    return fetchApi('/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  bulkCreate: async (data: AssignmentBulkCreate): Promise<BulkAssignResponse> => {
    return fetchApi('/assignments/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  autoAssign: async (data: AssignmentAutoCreate): Promise<AutoAssignResponse> => {
    return fetchApi('/assignments/auto', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: number): Promise<void> => {
    return fetchApi(`/assignments/${id}`, { method: 'DELETE' });
  },

  deleteByDomain: async (domainId: number): Promise<void> => {
    return fetchApi(`/assignments/domain/${domainId}`, { method: 'DELETE' });
  },

  deleteByServer: async (serverId: number): Promise<{ message: string; count: number }> => {
    return fetchApi(`/assignments/server/${serverId}`, { method: 'DELETE' });
  },

  getStats: async (): Promise<AssignmentStats> => {
    return fetchApi('/assignments/stats');
  },

  exportDomainHub: async (serverId?: number): Promise<string> => {
    const params = serverId ? `?server_id=${serverId}` : '';
    const response = await fetch(`${API_URL}/api/v1/assignments/export/domain-hub${params}`, {
      credentials: 'include',
    });
    return response.text();
  },

  exportCsv: async (): Promise<string> => {
    const response = await fetch(`${API_URL}/api/v1/assignments/export/csv`, {
      credentials: 'include',
    });
    return response.text();
  },

  getCapacityReport: async (): Promise<CapacityReport> => {
    return fetchApi('/assignments/export/capacity-report');
  },

  getServerConfig: async (serverId: number): Promise<Record<string, unknown>> => {
    return fetchApi(`/assignments/export/server/${serverId}`);
  },
};

export { ApiError };
