import { create } from 'zustand';
import type { Quota, UserPublic } from '@lumen/ir-schema';
import { api, setAccessToken } from '../api/client.js';

export interface SessionUser extends UserPublic {
  tenantId: string;
}

interface MeResponse {
  user: SessionUser;
  quota: Quota;
  used: { projects: number; images: number; tokens: number };
}

interface AuthResponse {
  user: SessionUser;
  accessToken: string;
  expiresIn: number;
}

interface SessionState {
  user: SessionUser | null;
  quota: Quota | null;
  used: MeResponse['used'] | null;
  /** 首次加载时用于区分「未登录」与「还在确认登录态」 */
  ready: boolean;
  loading: boolean;
  error: string;
  bootstrap: () => Promise<void>;
  login: (login: string, password: string) => Promise<SessionUser>;
  register: (username: string, password: string, email?: string) => Promise<SessionUser>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  clearError: () => void;
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  quota: null,
  used: null,
  ready: false,
  loading: false,
  error: '',

  async bootstrap() {
    try {
      const me = await api.get<MeResponse>('/me');
      set({ user: me.user, quota: me.quota, used: me.used, ready: true });
    } catch {
      // 刷新令牌可能还有效，交给 client 的自动刷新处理；失败即视为未登录
      set({ user: null, quota: null, used: null, ready: true });
    }
  },

  async login(login, password) {
    set({ loading: true, error: '' });
    try {
      const res = await api.post<AuthResponse>('/auth/login', { login, password });
      setAccessToken(res.accessToken);
      set({ user: res.user, loading: false, ready: true });
      await get().reload();
      return res.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败';
      set({ loading: false, error: message });
      throw err;
    }
  },

  async register(username, password, email) {
    set({ loading: true, error: '' });
    try {
      const res = await api.post<AuthResponse>('/auth/register', { username, password, email: email ?? '' });
      setAccessToken(res.accessToken);
      set({ user: res.user, loading: false, ready: true });
      await get().reload();
      return res.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : '注册失败';
      set({ loading: false, error: message });
      throw err;
    }
  },

  async changePassword(oldPassword, newPassword) {
    const res = await api.post<AuthResponse>('/auth/change-password', { oldPassword, newPassword });
    setAccessToken(res.accessToken);
    set({ user: res.user });
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // 登出失败也要清本地状态
    }
    setAccessToken(null);
    set({ user: null, quota: null, used: null });
  },

  async reload() {
    try {
      const me = await api.get<MeResponse>('/me');
      set({ user: me.user, quota: me.quota, used: me.used });
    } catch {
      // 静默失败：配额展示不是关键路径
    }
  },

  clearError: () => set({ error: '' }),
}));
