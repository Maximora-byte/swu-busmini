export type SheetSnap = 'peek' | 'half' | 'full'
export interface SheetLayout { width: number; height: number; footerGap: number; headerHeight: number; expanded: number; half: number; peek: number }
export interface SheetGeometry extends SheetLayout { snap: SheetSnap; y: number; scrollHeight: number; epoch: number; toolY: number; toolOpacity: number; height: number; windowHeight: number; keyboardHeight: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const dimension = (value: number | undefined, fallback: number) => Number.isFinite(value) && value! > 160 && value! <= 2400 ? value! : fallback
export function createSheetLayout(info: { windowWidth?: number; windowHeight?: number; screenHeight?: number; safeArea?: { bottom: number } } = {}): SheetLayout {
  const width = dimension(info.windowWidth, 375), height = dimension(info.windowHeight, 667)
  const safe = Number.isFinite(info.screenHeight) && Number.isFinite(info.safeArea?.bottom) ?
    clamp(info.screenHeight! - info.safeArea!.bottom, 0, Math.min(80, height * .15)) : 0
  const footerGap = safe + 28
  const expanded = Math.min(76, height * .23)
  const peekHeight = height >= 560 ? 184 : Math.min(140, Math.max(110, height * .4))
  const peek = Math.max(expanded, height - footerGap - peekHeight)
  const half = peek - expanded >= 88 ? clamp(height * .46, expanded + 44, peek - 44) : (expanded + peek) / 2
  return { width, height, footerGap, headerHeight: 60, expanded, half, peek }
}
export function getSheetGeometry(layout: SheetLayout, snap: SheetSnap, epoch: number, keyboardHeight = 0): SheetGeometry {
  const y = snap === 'full' ? layout.expanded : snap === 'half' ? layout.half : layout.peek
  const height = Math.max(0, layout.height - layout.footerGap - y)
  const keyboard = Number.isFinite(keyboardHeight) ? clamp(keyboardHeight, 0, layout.height * .65) : 0
  return { ...layout, snap, y, windowHeight: layout.height, height, epoch, keyboardHeight: keyboard,
    scrollHeight: Math.max(0, height - layout.headerHeight - keyboard), toolY: Math.max(108, y - 160), toolOpacity: snap === 'full' ? 0 : 1 }
}
export function getOverlayMapPadding(width: number, height: number, layout: SheetLayout, geometry: SheetGeometry, calloutInset = 80): [number, number, number, number] | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || geometry.snap === 'full') return null
  const sx = width / layout.width, sy = height / layout.height
  const top = 140 * sy, bottom = (layout.height - geometry.y + 18) * sy
  if (top + bottom >= height - 120 * sy) return null
  const side = Math.min(Math.max(80, Number.isFinite(calloutInset) ? calloutInset : 80) * sx, width * .3)
  return [top, side, bottom, side]
}
