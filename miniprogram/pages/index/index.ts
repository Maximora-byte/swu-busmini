const SWU_BEIBEI_CAMPUS = {
  latitude: 29.821737,
  longitude: 106.422968,
} as const

Page({
  data: {
    latitude: SWU_BEIBEI_CAMPUS.latitude,
    longitude: SWU_BEIBEI_CAMPUS.longitude,
    scale: 15,
  },
})

