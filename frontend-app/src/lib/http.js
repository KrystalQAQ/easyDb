function sanitizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function detectDefaultApiBase() {
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, port, origin } = window.location
    if ((protocol === 'http:' || protocol === 'https:') && hostname && origin) {
      // 本地前端开发服务器（如 Vite 5173）默认代理到 3000。
      if (port === '5173' || port === '4173') {
        return `${protocol}//${hostname}:3000`
      }
      // 生产或其它端口部署时默认走同源，避免强制写死 3000。
      return origin
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
    const error = new Error(`${payload.error || response.statusText || '请求失败'}${requestId}`)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export { detectDefaultApiBase, requestJson, sanitizeBaseUrl }
