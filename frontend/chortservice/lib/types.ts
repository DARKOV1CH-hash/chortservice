// Server types
export type CapacityMode = '1:5' | '1:7' | '1:10';
export type ServerStatus = 'free' | 'in_use';

export interface Server {
  id: number;
  name: string;
  ip_address: string;
  status: ServerStatus;
  capacity_mode: CapacityMode;
  max_domains: number;
  current_domains: number;
  is_central_config: boolean;
  individual_config: string | null;
  central_config: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  locked_by: string | null;
  locked_at: string | null;
}

export interface ServerWithAssignments extends Server {
  assigned_domains: string[];
}

export interface ServerCreate {
  name: string;
  ip_address: string;
  capacity_mode?: CapacityMode;
  is_central_config?: boolean;
  individual_config?: string | null;
  central_config?: string | null;
  description?: string | null;
}

export interface ServerUpdate {
  name?: string;
  ip_address?: string;
  capacity_mode?: CapacityMode;
  is_central_config?: boolean;
  individual_config?: string | null;
  central_config?: string | null;
  description?: string | null;
  status?: ServerStatus;
}

export interface ServerListResponse {
  servers: Server[];
  total: number;
  page: number;
  page_size: number;
}

// Domain types
export type DomainStatus = 'free' | 'assigned';

export interface Domain {
  id: number;
  name: string;
  status: DomainStatus;
  description: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  locked_by: string | null;
  locked_at: string | null;
  assigned_server_id: number | null;
  assigned_server_name: string | null;
}

export interface DomainCreate {
  name: string;
  description?: string | null;
  tags?: string[] | null;
}

export interface DomainBulkCreate {
  domains: string[];
  description?: string | null;
  tags?: string[] | null;
}

export interface DomainUpdate {
  name?: string;
  description?: string | null;
  tags?: string[] | null;
  status?: DomainStatus;
}

export interface DomainListResponse {
  domains: Domain[];
  total: number;
  page: number;
  page_size: number;
}

// Assignment types
export interface Assignment {
  id: number;
  domain_id: number;
  domain_name: string;
  server_id: number;
  server_name: string;
  assigned_at: string;
  assigned_by: string;
}

export interface AssignmentCreate {
  domain_id: number;
  server_id: number;
}

export interface AssignmentBulkCreate {
  domain_ids: number[];
  server_id: number;
}

export interface AssignmentAutoCreate {
  domain_ids: number[];
  capacity_mode?: string;
  distribute_evenly?: boolean;
}

export interface AssignmentStats {
  total_servers: number;
  total_domains: number;
  assigned_domains: number;
  free_domains: number;
  servers_in_use: number;
  servers_free: number;
  average_load: number;
  capacity_utilization: Record<string, Record<string, number>>;
}

export interface BulkCreateResponse {
  created: number;
  skipped: number;
  skipped_domains: string[];
  domains: Domain[];
}

export interface BulkAssignResponse {
  success: number;
  failed: number;
  failed_domain_ids: number[];
  assignments: Assignment[];
}

export interface AutoAssignResponse extends BulkAssignResponse {
  servers_used: number;
}

export interface CapacityReport {
  servers: Array<{
    id: number;
    name: string;
    ip_address: string;
    capacity_mode: string;
    max_domains: number;
    current_domains: number;
    utilization_percent: number;
    available_slots: number;
  }>;
  summary: {
    total_capacity: number;
    used_capacity: number;
    overall_utilization: number;
  };
}

// WebSocket types
export interface WSMessage {
  channel: string;
  data: {
    action: string;
    [key: string]: unknown;
  };
}
