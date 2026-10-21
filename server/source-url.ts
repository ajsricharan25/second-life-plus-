export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
      /\.(?:localhost|local|internal|test|example|invalid)$/.test(host) ||
      host === 'localhost'
    )
      return null
    return url.href
  } catch {
    return null
  }
}
