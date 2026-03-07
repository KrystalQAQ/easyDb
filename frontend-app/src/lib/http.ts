const PATH_ROUTING_PREFIX = '/p'

function sanitizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function normalizeRequestPath(path) {
  const text = String(path || '').trim()
  if (!text) return '/'
  if (/^https?:\/\//i.test(text)) return text
  return text.startsWith('/') ? text : `/${text}`
}

function isPrivateIpv4(hostname) {
  const match = String(hostname || '').match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return false
  const first = Number(match[1])
  const second = Number(match[2])
  if (first === 10 || first === 127) return true
  if (first === 192 && second === 168) return true
  if (first === 172 && second >= 16 && second <= 31) return true
  return false
}

function isLikelyIntranetHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase()
  if (!host) return false
  if (host === 'localhost' || host === '::1' || host === '[::1]') return true
  if (isPrivateIpv4(host)) return true
  return ['.local', '.lan', '.internal', '.corp', '.home', '.localdomain'].some((suffix) => host.endsWith(suffix))
}

function detectRuntimeAccess() {
  if (typeof window === 'undefined') {
    return {
      mode: 'host',
      appBase: '',
      apiBase: '',
      projectKey: '',
      env: '',
      preferPathAccess: false,
      currentHostIsIntranet: false,
    }
  }

  const pathname = String(window.location.pathname || '/').trim()
  const hostname = String(window.location.hostname || '').trim().toLowerCase()
  const currentHostIsIntranet = isLikelyIntranetHost(hostname)
  const pattern = new RegExp(`^${PATH_ROUTING_PREFIX}/([^/]+)/([^/]+)(?=/|$)`, 'i')
  const match = pathname.match(pattern)
  if (!match) {
    return {
      mode: 'host',
      appBase: '',
      apiBase: '',
      projectKey: '',
      env: '',
      preferPathAccess: currentHostIsIntranet,
      currentHostIsIntranet,
    }
  }

  const projectKey = decodeURIComponent(match[1])
  const env = decodeURIComponent(match[2])
  const prefix = `${PATH_ROUTING_PREFIX}/${encodeURIComponent(projectKey)}/${encodeURIComponent(env)}`

  return {
    mode: 'path',
    appBase: prefix,
    apiBase: prefix,
    projectKey,
    env,
    preferPathAccess: true,
    currentHostIsIntranet,
  }
}

function detectDefaultApiBase() {
  return detectRuntimeAccess().apiBase
}

function detectAppBase() {
  return detectRuntimeAccess().appBase
}

function buildAppUrl(path) {
  const normalizedPath = normalizeRequestPath(path)
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath
  return `${detectAppBase()}${normalizedPath}`
}

function buildApiUrl(path, apiBase = detectDefaultApiBase()) {
  const normalizedPath = normalizeRequestPath(path)
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath
  const baseUrl = sanitizeBaseUrl(apiBase)
  return `${baseUrl}${normalizedPath}`
}

async function parseJsonSafe(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

async function requestJson({ apiBase, token, path, method = 'GET', body, auth = true }) {
  const requestUrl = buildApiUrl(path, sanitizeBaseUrl(apiBase) || detectDefaultApiBase())
  const headers: Record<string, string> = {
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
    const error = new Error(
      `${payload.error || response.statusText || '请求失败'}${requestId}`,
    ) as Error & { status?: number; payload?: unknown }
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export { buildApiUrl, buildAppUrl, detectAppBase, detectDefaultApiBase, detectRuntimeAccess, requestJson, sanitizeBaseUrl }
