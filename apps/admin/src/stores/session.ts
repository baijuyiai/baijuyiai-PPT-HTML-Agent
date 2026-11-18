import { create } from 'zustand';
import { api, setAccessToken } from '../api/client.js';
import type { MeResponse, SessionUser } from '../api/types.js';

interface AuthResponse {
  user: SessionUser;
  accessToken: string;
  expiresIn: number;
}

interface SessionState {
  user: SessionUser | null;
  /** 首次加载时用于区分「未登录」与「还在确认登录态」 */
  ready: boolean;
  loading: boolean;
  error: string;
  bootstrap: () => Promise<void>;
  login: (login: string, password: string) => Promise<SessionUser>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  ready: false,
  loading: false,
  error: '',

  async bootstrap() {
    try {
      const me = await api.get<MeResponse>('/me');
      // 非管理员直接视为未登录：后台前端不做半开放，越权由后端 403 兜底
      set({ user: me.user.role === 'admin' ? me.user : null, ready: true });
    } catch {
      set({ user: null, ready: true });
    }
  },

  async login(login, password) {
    set({ loading: true, error: '' });
    try {
      const res = await api.post<AuthResponse>('/auth/login', { login, password });
      if (res.user.role !== 'admin') {
        setAccessToken(null);
        // 已建立的会话要立刻销毁，否则 cookie 还在，刷新后又进得来
        await api.post('/auth/logout').catch(() => undefined);
        throw new Error('该账号没有管理后台权限');
      }
      setAccessToken(res.accessToken);
      set({ user: res.user, loading: false, ready: true });
      return res.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败';
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
    set({ user: null });
  },

  clearError: () => set({ error: '' }),
}));
