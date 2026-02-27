import { useEffect, useMemo, useState } from 'react'
import { Alert, Card, Spin, Typography } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { detectDefaultApiBase, requestJson } from '../lib/http'

const STORAGE_KEY = 'easydb_console_vite_state_v1'

function sanitizeNextPath(rawNext) {
  const next = String(rawNext || '').trim()
  if (!next.startsWith('/')) return '/app/projects'
  if (next.startsWith('//')) return '/app/projects'
  return next
}

function AuthCallbackPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const query = useMemo(() => new URLSearchParams(location.search), [location.search])

  useEffect(() => {
    let cancelled = false

    async function run() {
      const code = String(query.get('code') || '').trim()
      const client = String(query.get('client') || '').trim()
      const nextPath = sanitizeNextPath(query.get('next'))
      if (!code) {
        setError('缺少授权码 code')
        return
      }

      try {
        const payload = await requestJson({
          apiBase: detectDefaultApiBase(),
          token: '',
          path: '/api/auth/token',
          method: 'POST',
          body: { code, client },
          auth: false,
        })

        if (cancelled) return
        let prev = {}
        try {
          const prevRaw = window.localStorage.getItem(STORAGE_KEY)
          prev = prevRaw ? JSON.parse(prevRaw) : {}
        } catch (_err) {
          prev = {}
        }
        const next = {
          ...prev,
          token: String(payload.token || ''),
          user: payload.user || null,
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        navigate(nextPath, { replace: true })
      } catch (err) {
        if (cancelled) return
        setError(err?.message || '授权码兑换失败')
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [navigate, query])

  return (
    <div className="auth-unified-page min-h-screen px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-lg">
        <Card className="auth-unified-right rounded-3xl">
          <Typography.Title level={4} className="!mb-2">
            登录回调处理中
          </Typography.Title>
          {!error ? (
            <div className="flex items-center gap-3 text-slate-600">
              <Spin size="small" /> 正在兑换 Token，请稍候...
            </div>
          ) : (
            <Alert type="error" showIcon message={error} />
          )}
        </Card>
      </div>
    </div>
  )
}

export default AuthCallbackPage
