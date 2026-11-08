/**
 * 业务规则与下拉选项设置（/api/rules），权限 system.rules。
 * 规则读取给所有登录用户用的是 GET /api/common/dicts（含 rules），这里只负责管理。
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parse } from '../../lib/http'
import { audit } from '../../lib/audit'
import { listEditableDicts, resetDict, resetRules, saveDict, saveRules } from '../../lib/rules'
import { DEFAULT_RULES, RULES } from '../../dict'
import { perm } from '../../plugins/auth'

export default async function (app: FastifyInstance) {
  const guard = { preHandler: perm('system.rules') }

  app.get('/', guard, async () => ({ rules: RULES, defaults: DEFAULT_RULES }))

  app.put('/', guard, async (req) => {
    const rules = await saveRules(req.body)
    await audit(req, 'update', 'Rules', 'rules', req.body)
    return { rules, defaults: DEFAULT_RULES }
  })

  app.post('/reset', guard, async (req) => {
    const rules = await resetRules()
    await audit(req, 'reset', 'Rules', 'rules')
    return { rules, defaults: DEFAULT_RULES }
  })

  app.get('/dicts', guard, async () => listEditableDicts())

  app.put('/dicts/:key', guard, async (req) => {
    const { key } = parse(z.object({ key: z.string() }), req.params)
    await saveDict(key, req.body)
    await audit(req, 'update', 'Dict', key, req.body)
    return listEditableDicts()
  })

  app.post('/dicts/:key/reset', guard, async (req) => {
    const { key } = parse(z.object({ key: z.string() }), req.params)
    await resetDict(key)
    await audit(req, 'reset', 'Dict', key)
    return listEditableDicts()
  })
}
