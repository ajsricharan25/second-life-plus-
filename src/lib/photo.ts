import type { ResearchRequest } from './research-types'

export function preparePhotoForAI(image: HTMLImageElement): NonNullable<ResearchRequest['image']> {
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('Unreadable photo')
  const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Photo preparation is unavailable')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  // Re-encoding also leaves EXIF/location metadata out of the uploaded image.
  for (const quality of [0.82, 0.65, 0.45]) {
    const data = canvas.toDataURL('image/jpeg', quality).split(',')[1]
    if (data && data.length <= 1_398_104) return { mimeType: 'image/jpeg', data }
  }
  throw new Error('Choose a smaller photo for AI analysis')
}
