function sanitizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function detectDefaultApiBase() {
  // 默认走相对路径，让开发环境统一命中 Vite 代理、生产环境统一同源。
  return ''
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
  const requestUrl = `${baseUrl}${path}`
  const headers = {
    'Content-Type': 'application/json',
  }
  if (auth && token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(requestUrl, {
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
