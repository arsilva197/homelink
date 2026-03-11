const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = `${baseUrl}/api/v1`;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('homelink_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    });

    // Handle token refresh
    if (response.status === 401) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        return this.request(endpoint, options);
      }
      // Redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/login';
      }
      throw new Error('Unauthorized');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(data.message || 'Request failed', response.status, data.code);
    }

    return data;
  }

  private async refreshToken(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.accessToken) {
          localStorage.setItem('homelink_token', data.data.accessToken);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  async postForm<T>(endpoint: string, formData: FormData): Promise<T> {
    const token = this.getToken();
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) throw new ApiError(data.message, response.status, data.code);
    return data;
  }
}

export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code = 'ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const api = new ApiClient(API_URL);

// ─── Typed API methods ──────────────────────────────────────────────────────

export const authApi = {
  register: (data: { email: string; password: string; firstName: string; lastName: string }) =>
    api.post<{ success: boolean; data: { user: User; accessToken: string } }>('/auth/register', data),

  login: (email: string, password: string) =>
    api.post<{ success: boolean; data: { user: User; accessToken: string } }>('/auth/login', { email, password }),

  me: () => api.get<{ success: boolean; data: User }>('/auth/me'),

  logout: () => api.post('/auth/logout'),
};

export const propertyApi = {
  list: (filters?: Record<string, unknown>) => {
    const params = filters ? '?' + new URLSearchParams(filters as Record<string, string>).toString() : '';
    return api.get<{ success: boolean; data: Property[]; pagination: Pagination }>(`/properties${params}`);
  },
  get: (id: string) => api.get<{ success: boolean; data: Property }>(`/properties/${id}`),
  create: (data: Partial<Property>) => api.post<{ success: boolean; data: Property }>('/properties', data),
  update: (id: string, data: Partial<Property>) => api.patch<{ success: boolean; data: Property }>(`/properties/${id}`, data),
  myProperties: () => api.get<{ success: boolean; data: Property[] }>('/users/me/properties'),
};

export const chainApi = {
  list: (status?: string) => {
    const params = status ? `?status=${status}` : '';
    return api.get<{ success: boolean; data: ChainOpportunity[]; pagination: Pagination }>(`/chains${params}`);
  },
  get: (id: string) => api.get<{ success: boolean; data: ChainOpportunity }>(`/chains/${id}`),
  approve: (id: string) => api.patch(`/chains/${id}/approve`),
  reject: (id: string, reason?: string) => api.patch(`/chains/${id}/reject`, { reason }),
  assignBroker: (id: string, brokerId: string) => api.patch(`/chains/${id}/assign-broker`, { brokerId }),
  triggerRun: () => api.post('/chains/trigger-run'),
};

export const adminApi = {
  metrics: () => api.get<{ success: boolean; data: AdminMetrics }>('/admin/metrics'),
  users: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<{ success: boolean; data: User[] }>(`/admin/users${q}`);
  },
  brokers: (status?: string) => api.get<{ success: boolean; data: BrokerProfile[] }>(`/admin/brokers${status ? `?status=${status}` : ''}`),
  approveBroker: (id: string) => api.patch(`/admin/brokers/${id}/approve`),
  suspendBroker: (id: string, reason: string) => api.patch(`/admin/brokers/${id}/suspend`, { reason }),
  engineRuns: () => api.get('/admin/engine/runs'),
};

export const notificationApi = {
  list: () => api.get<{ success: boolean; data: { notifications: Notification[]; unreadCount: number } }>('/notifications'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const heatmapApi = {
  getData: (bounds?: object) => api.get<{ success: boolean; data: HeatmapPoint[] }>('/heatmap'),
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  roles: string[];
  isActive: boolean;
  brokerProfile?: { id: string; status: string };
}

export interface Property {
  id: string;
  title: string;
  description?: string;
  address: string;
  city: string;
  state: string;
  price: number;
  sizeM2: number;
  bedrooms?: number;
  bathrooms?: number;
  propertyType: string;
  listingType: string;
  commitmentLevel: string;
  images: PropertyImage[];
  owner: { firstName: string; lastName: string };
  activeChainsCount?: number;
}

export interface PropertyImage {
  id: string;
  imageUrl: string;
  displayOrder: number;
}

export interface ChainOpportunity {
  id: string;
  chainSize: number;
  cpsScore: number;
  status: string;
  region: string;
  totalValue: number;
  expiresAt: string;
  createdAt: string;
  participants: ChainParticipant[];
  priceBridge: PriceBridgeEntry[];
  assignedBroker?: { user: { firstName: string; lastName: string } };
}

export interface ChainParticipant {
  id: string;
  position: number;
  property: Property;
}

export interface PriceBridgeEntry {
  fromPropertyId: string;
  toPropertyId: string;
  adjustment: number;
  direction: 'pay' | 'receive';
}

export interface AdminMetrics {
  users: { total: number };
  properties: { total: number; active: number };
  graph: { edges: number };
  chains: { total: number; pending: number; approved: number; avgCps: number };
  engine: { recentRuns: EngineRun[] };
  brokers: { pendingApproval: number };
}

export interface BrokerProfile {
  id: string;
  creciNumber: string;
  creciState: string;
  status: string;
  user: { firstName: string; lastName: string; email: string };
  _count: { listings: number; opportunities: number };
}

export interface EngineRun {
  startedAt: string;
  durationMs: number;
  chainsDetected: number;
  status: string;
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  intensity: number;
  propertiesCount: number;
  liquidityScore: number;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  chainId?: string;
  createdAt: string;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
