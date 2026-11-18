import { Router } from 'express';
import { z } from 'zod';
import { ok, requirePasswordChanged } from '@lumen/server-core';
import { requireAuth } from '@lumen/server-core';
import { requireTenant, tenantOf, userIdOf } from '@lumen/server-core';
import { clientIp, parseBody, parseParams, parseQuery } from '@lumen/server-core';
import { recordAudit } from '@lumen/server-core';
import { createExport, exportNote, getExportJob, listExports } from '@lumen/server-core';
import { ExportFormat } from '@lumen/ir-schema';

export const exportsRouter = Router();
exportsRouter.use(requireAuth, requirePasswordChanged, requireTenant);

const FormatEnum = z.enum(['pdf', 'pptx', 'pptx-editable', 'html', 'mp4']);

/** 导出格式说明，前端面板直接展示（PRD §5.8 明确提示） */
exportsRouter.get('/notes', (_req, res) => {
  ok(res, {
    notes: {
      pdf: exportNote('pdf'),
      pptx: exportNote('pptx'),
      'pptx-editable': exportNote('pptx-editable'),
      html: exportNote('html'),
      mp4: exportNote('mp4'),
    },
  });
});

exportsRouter.get('/', (req, res) => {
  const { projectId } = parseQuery(z.object({ projectId: z.string().min(1) }), req);
  ok(res, listExports(projectId, tenantOf(req)));
});

exportsRouter.post('/', (req, res) => {
  const body = parseBody(z.object({
    projectId: z.string().min(1),
    format: FormatEnum,
  }), req);
  const job = createExport(body.projectId, tenantOf(req), body.format as ExportFormat);
  recordAudit({
    tenantId: tenantOf(req), userId: userIdOf(req), action: 'export',
    target: `${body.projectId}:${body.format}`, ip: clientIp(req),
  });
  ok(res, job, 202);
});

exportsRouter.get('/job/:exportId', (req, res) => {
  const { exportId } = parseParams(z.object({ exportId: z.string() }), req);
  ok(res, getExportJob(exportId, tenantOf(req)));
});
