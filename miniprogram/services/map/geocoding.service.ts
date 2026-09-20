import type { CandidateCoordinate } from '../../models/index'
import type { MapProvider } from './map-provider'

export interface GeocodingService {
  getCandidates(keyword: string): Promise<readonly CandidateCoordinate[]>
}

function isValidCandidate(candidate: CandidateCoordinate): boolean {
  const { latitude, longitude } = candidate.coordinate
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    candidate.source.trim().length > 0 &&
    Number.isFinite(candidate.confidence) &&
    candidate.confidence >= 0 &&
    candidate.confidence <= 1 &&
    candidate.verified === false
  )
}

export function createGeocodingService(
  provider: MapProvider,
): GeocodingService {
  return {
    async getCandidates(keyword) {
      const normalizedKeyword = keyword.trim()
      if (normalizedKeyword.length === 0) {
        throw new Error('地理编码关键词不能为空')
      }

      const candidates = await provider.geocode(normalizedKeyword)
      return candidates.map((candidate) => {
        if (!isValidCandidate(candidate)) {
          throw new Error('地图服务返回了无效的候选坐标')
        }

        return {
          coordinate: { ...candidate.coordinate },
          source: candidate.source,
          confidence: candidate.confidence,
          verified: false,
        }
      })
    },
  }
}
