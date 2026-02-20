function sanitizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function detectDefaultApiBase() {
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, port, origin } = window.location
    if ((protocol === 'http:' || protocol === 'https:') && hostname) {
      if (port === '3000') {
        return origin
      }
      return `${protocol}//${hostname}:3000`
    }
  }
  return 'http://localhost:3000'
}

async function parseJsonSafe(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

async function requestJson({ apiBase, token, path, method = 'GET', body, auth = true }) {
  const baseUrl = sanitizeBaseUrl(apiBase) || detectDefaultApiBase()
  const headers = {
    'Content-Type': 'application/json',
  }
  if (auth && token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const payload = await parseJsonSafe(response)
  if (!response.ok || payload.ok === false) {
    const requestId = payload.requestId ? ` (requestId: ${payload.requestId})` : ''
    throw new Error(`${payload.error || response.statusText || '请求失败'}${requestId}`)
  }

  return payload
}

export { detectDefaultApiBase, requestJson, sanitizeBaseUrl }
