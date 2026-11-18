import { all, count, get, insertRow, run } from '../db/client.js';
import { newId, newOpaqueToken } from '../lib/crypto.js';
import { forbidden, notFound } from '../lib/errors.js';
import type { Share, SharePublic } from '@lumen/ir-schema';
import { requireProject } from './project.service.js';

export interface ShareRow {
  shareId: string;
  token: string;
  tenantId: string;
  projectId: string;
  createdBy: string;
  expiresAt: number;
  revoked: number;
  viewCount: number;
  createdAt: number;
}

function toShare(row: ShareRow): Share {
  return {
    shareId: row.shareId,
    token: row.token,
    tenantId: row.tenantId,
    projectId: row.projectId,
    createdBy: row.createdBy,
    expiresAt: row.expiresAt,
    revoked: row.revoked === 1,
    viewCount: row.viewCount,
    createdAt: row.createdAt,
  };
}

/** 创建分享链接。token 为不透明随机串，带过期时间与租户边界（PRD §5.7）。 */
export function createShare(
  projectId: string,
  tenantId: string,
  userId: string,
  ttlMs = 0,
): Share {
  requireProject(projectId, tenantId);
  const shareId = newId('shr');
  insertRow('shares', {
    shareId,
    token: newOpaqueToken(24),
    tenantId,
    projectId,
    createdBy: userId,
    expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
    revoked: 0,
    viewCount: 0,
    createdAt: Date.now(),
  });
  return toShare(get<ShareRow>('SELECT * FROM shares WHERE shareId = ?', shareId)!);
}

export function listShares(projectId: string, tenantId: string): Share[] {
  requireProject(projectId, tenantId);
  return all<ShareRow>('SELECT * FROM shares WHERE projectId = ? ORDER BY createdAt DESC', projectId).map(toShare);
}

export function revokeShare(shareId: string, tenantId: string): void {
  const row = get<ShareRow>('SELECT * FROM shares WHERE shareId = ?', shareId);
  if (!row) throw notFound('分享链接不存在');
  if (row.tenantId !== tenantId) throw forbidden('无权操作该分享链接');
  run('UPDATE shares SET revoked = 1 WHERE shareId = ?', shareId);
}

/**
 * 解析公开访问的分享 token。
 * 已撤销、已过期、租户不匹配都按「不存在」处理，不泄露更多信息。
 */
export function resolveShare(token: string): ShareRow {
  const row = get<ShareRow>('SELECT * FROM shares WHERE token = ?', token);
  if (!row) throw notFound('分享链接无效或已失效');
  if (row.revoked === 1) throw notFound('分享链接已撤销');
  if (row.expiresAt > 0 && row.expiresAt <= Date.now()) throw notFound('分享链接已过期');
  return row;
}

export function incrementView(token: string): void {
  run('UPDATE shares SET viewCount = viewCount + 1 WHERE token = ?', token);
}

export function sharePublicInfo(token: string, title: string, pageCount: number): SharePublic {
  const row = resolveShare(token);
  return { token, title, pageCount, expiresAt: row.expiresAt };
}

export function shareCount(projectId: string): number {
  return count('SELECT COUNT(*) AS n FROM shares WHERE projectId = ? AND revoked = 0', projectId);
}
