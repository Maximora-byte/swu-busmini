import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CampusMapPlace } from '../miniprogram/services/navigation/campus-place-search.service'
import { wgs84ToGcj02 } from './wgs84-to-gcj02'

interface PlaceSource {
  id: string; name: string; aliases: string[]; coordinateSystem: string
  coordinate: { latitude: number; longitude: number }; coordinateKind: 'mapped-node' | 'area-center'
  accessNotes?: string
}
interface GuideSource { id: string; name: string; aliases: string[]; anchorId: string | null; details: string }
interface CampusPlaceSource { schemaVersion: number; places: PlaceSource[]; guides: GuideSource[] }

function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 200 }
function aliases(value: unknown): value is string[] { return Array.isArray(value) && value.every(text) }

/** One forward conversion from attributed OSM source, never from an already converted mirror. */
export function buildCampusMapPlaces(input: unknown): CampusMapPlace[] {
  const source = input as CampusPlaceSource
  if (source?.schemaVersion !== 1 || !Array.isArray(source.places) || !Array.isArray(source.guides)) throw new Error('Invalid campus place source')
  const ids = new Set<string>()
  const output: CampusMapPlace[] = source.places.map((place) => {
    if (!text(place.id) || !place.id.startsWith('osm:') || ids.has(place.id) || !text(place.name) || !aliases(place.aliases) ||
      place.coordinateSystem !== 'WGS84' || !['mapped-node', 'area-center'].includes(place.coordinateKind) ||
      (place.accessNotes !== undefined && !text(place.accessNotes)) || !Number.isFinite(place.coordinate?.latitude) || !Number.isFinite(place.coordinate?.longitude) ||
      place.coordinate.latitude < 29.80 || place.coordinate.latitude > 29.85 || place.coordinate.longitude < 106.39 || place.coordinate.longitude > 106.45) {
      throw new Error('Invalid, duplicate, mixed-system or out-of-area campus place')
    }
    ids.add(place.id)
    return { id: place.id, name: place.name, aliases: [...place.aliases], coordinate: wgs84ToGcj02(place.coordinate),
      coordinateKind: place.coordinateKind, sourceLabel: 'OpenStreetMap',
      details: `${place.coordinateKind === 'area-center' ? '建筑范围中心参考点，具体入口请在现场核对。' : '地图标注参考点，具体通行条件请在现场核对。'}${place.accessNotes ?? ''}` }
  })
  for (const guide of source.guides) {
    if (!text(guide.id) || ids.has(guide.id) || !text(guide.name) || !aliases(guide.aliases) || typeof guide.details !== 'string' || guide.details.length > 2000) {
      throw new Error('Invalid or duplicate campus guide')
    }
    ids.add(guide.id)
    if (guide.anchorId !== null) {
      const anchor = output.find(({ id }) => id === guide.anchorId && id.startsWith('osm:'))
      if (!anchor) throw new Error('Unresolved campus guide anchor')
      anchor.aliases = [...new Set([...anchor.aliases, guide.name, ...guide.aliases])]
      anchor.sourceLabel = 'OpenStreetMap · 校内资料'
      anchor.details = `${anchor.details} ${guide.details}`.trim()
    } else {
      output.push({ id: guide.id, name: guide.name, aliases: [...guide.aliases], coordinate: null,
        coordinateKind: 'unlocated-guide', sourceLabel: '校内资料', details: guide.details })
    }
  }
  return output
}

export async function syncCampusPlaceData(directory: string, checkOnly = false): Promise<void> {
  const source: unknown = JSON.parse(await readFile(join(directory, 'campus-map-places-source.json'), 'utf8'))
  const places = buildCampusMapPlaces(source)
  const content = `import type { CampusMapPlace } from '../services/navigation/campus-place-search.service'\n\n/** OSM-derived place database: ODbL-1.0, © OpenStreetMap contributors. See campus-map-places-source.json and legal/osm-data-NOTICE.txt. Approximate GCJ-02 reference points, not verified entrances or bus stops. */\nexport const campusMapPlaces: CampusMapPlace[] = ${JSON.stringify(places, null, 2)}\n`
  const target = join(directory, 'campus-map-places.ts')
  let previous: string | undefined
  try { previous = await readFile(target, 'utf8') } catch (error: unknown) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
  }
  if (previous?.replace(/\r\n/g, '\n') === content) return
  if (checkOnly) throw new Error('Campus place data not in sync; run npm run sync:data')
  await writeFile(target, content, 'utf8')
}
