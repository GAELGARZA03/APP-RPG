import { Capacitor, CapacitorHttp } from '@capacitor/core'

export interface HttpResponse {
  status: number
  data: unknown
}

export type HttpRequest = (request: {
  method: 'GET' | 'POST'
  url: string
  headers: Record<string, string>
  body?: unknown
  timeoutMs: number
}) => Promise<HttpResponse>

/**
 * En Android usa la red nativa (sin restricciones CORS de la WebView).
 * En el navegador usa fetch. Lanza `TypeError` si no hay conexión.
 */
export const httpRequest: HttpRequest = async ({ method, url, headers, body, timeoutMs }) => {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      method,
      url,
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: body,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    })
    return { status: response.status, data: response.data }
  }

  const response = await fetch(url, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {
    // Respuesta que no es JSON: se devuelve como texto.
  }
  return { status: response.status, data }
}
