import { operatorRoutes } from '../../data/operator-routes'
import type { OperatorRouteObservation } from '../../models/index'

export interface OperatorRouteCatalogRepository {
  getAll(): OperatorRouteObservation[]
  getById(id: string): OperatorRouteObservation | undefined
}

function clone(record: OperatorRouteObservation): OperatorRouteObservation {
  return { ...record, referencePointNames: [...record.referencePointNames] }
}

function nonEmptyString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`operator-routes: ${field} must be a non-empty string`)
  }
  return value
}

/** 独立观察目录只接受标签集合，不向正式导航仓库注入站序或坐标。 */
export function createOperatorRouteCatalogRepository(data: unknown): OperatorRouteCatalogRepository {
  if (!Array.isArray(data)) throw new Error('operator-routes must be an array')
  const ids = new Set<string>()
  const records = data.map((item): OperatorRouteObservation => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('operator-routes contains an invalid record')
    }
    const record = item as Record<string, unknown>
    const id = nonEmptyString(record, 'id')
    if (ids.has(id.trim())) throw new Error(`operator-routes contains duplicate id: ${id}`)
    ids.add(id.trim())
    const name = nonEmptyString(record, 'name')
    const source = nonEmptyString(record, 'source')
    const observedAt = nonEmptyString(record, 'observedAt')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observedAt) ||
      !Number.isFinite(Date.parse(observedAt)) ||
      new Date(observedAt).toISOString().slice(0, 10) !== observedAt) {
      throw new Error('operator-routes observedAt must be a valid ISO calendar date')
    }
    const confirmation = nonEmptyString(record, 'confirmation')
    const labels = record.referencePointNames
    if (!Array.isArray(labels) || labels.length === 0 ||
      !labels.every((label): label is string => typeof label === 'string' && label.trim().length > 0) ||
      new Set(labels.map((label) => label.trim())).size !== labels.length) {
      throw new Error('operator-routes referencePointNames must contain unique, non-empty reference labels')
    }
    return { id, name, source, observedAt, confirmation, referencePointNames: [...labels] }
  })
  const byId = new Map(records.map((record) => [record.id, record]))
  return {
    getAll: () => records.map(clone),
    getById(id) {
      const record = byId.get(id)
      return record ? clone(record) : undefined
    },
  }
}

export const operatorRouteCatalogRepository = createOperatorRouteCatalogRepository(operatorRoutes)
