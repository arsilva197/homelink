import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, authApi } from '@/lib/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  isAdmin: () => boolean;
  isBroker: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,

      setUser: (user) => set({ user }),
      setToken: (token) => {
        set({ token });
        if (token) {
          localStorage.setItem('homelink_token', token);
        } else {
          localStorage.removeItem('homelink_token');
        }
      },

      logout: async () => {
        try { await authApi.logout(); } catch {}
        set({ user: null, token: null });
        localStorage.removeItem('homelink_token');
        window.location.href = '/auth/login';
      },

      fetchMe: async () => {
        set({ isLoading: true });
        try {
          const res = await authApi.me();
          set({ user: res.data });
        } catch {
          set({ user: null, token: null });
        } finally {
          set({ isLoading: false });
        }
      },

      isAdmin: () => {
        const { user } = get();
        return !!user?.roles.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r));
      },

      isBroker: () => {
        const { user } = get();
        return !!user?.roles.some((r) => ['BROKER', 'AGENCY'].includes(r));
      },
    }),
    {
      name: 'homelink-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
);
