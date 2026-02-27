import { useMemo, useState } from 'react'
import { Alert, Button, Form, Input, Tag, Typography, message } from 'antd'
import {
  ApiOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useConsole } from '../context/ConsoleContext'
import AvatarUploader from '../components/AvatarUploader'

// 根据字符串哈希出固定颜色渐变
const AVATAR_GRADIENTS = [
  ['#6366f1', '#8b5cf6'], // indigo → violet
  ['#3b82f6', '#6366f1'], // blue → indigo
  ['#06b6d4', '#3b82f6'], // cyan → blue
  ['#10b981', '#06b6d4'], // emerald → cyan
  ['#f59e0b', '#ef4444'], // amber → red
  ['#ec4899', '#8b5cf6'], // pink → violet
  ['#14b8a6', '#6366f1'], // teal → indigo
  ['#f97316', '#ec4899'], // orange → pink
]

function getUserAvatarGradient(username) {
  let hash = 0
  for (let i = 0; i < (username || '').length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

function UserAvatar({ username, size = 40 }) {
  const letter = (username || '?')[0].toUpperCase()
  const [from, to] = getUserAvatarGradient(username)
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.42,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '-0.01em',
        flexShrink: 0,
        boxShadow: `0 4px 14px ${from}55`,
      }}
    >
      {letter}
    </div>
  )
}

function parseRedirectTarget(rawRedirect) {
  const text = String(rawRedirect || '').trim()
  if (!text) return { mode: 'internal', target: '/app/projects' }
  if (text.startsWith('/') && !text.startsWith('//')) return { mode: 'internal', target: text }
  try {
    const url = new URL(text)
    if (!['http:', 'https:'].includes(url.protocol)) return { mode: 'invalid', target: '/app/projects' }
    return { mode: 'external', target: url.toString() }
  } catch {
    return { mode: 'invalid', target: '/app/projects' }
  }
}

function sanitizeState(rawState) {
  return String(rawState || '').trim().slice(0, 120)
}

const trustedApps = [
  { icon: <CloudServerOutlined />, title: '管理控制台', desc: '项目、环境与网关配置' },
  { icon: <ApiOutlined />, title: '业务 API 平台', desc: '统一接口调用与密钥授权' },
  { icon: <AuditOutlined />, title: '审计中心', desc: '操作轨迹与风险追踪' },
]

const policies = [
  { icon: <DatabaseOutlined />, title: '策略统一', desc: '统一校验 JWT 签发方与受众，避免跨系统误用票据。' },
  { icon: <SafetyCertificateOutlined />, title: '鉴权可追溯', desc: '所有关键操作通过统一账号标识进行审计关联。' },
  { icon: <CloudServerOutlined />, title: '系统可扩展', desc: '后续新增业务系统可直接复用当前认证入口与 Token 体系。' },
]

// 授权页面展示的权限项
const oauthScopes = [
  { icon: <UserOutlined />, label: '读取你的账号信息（用户名、角色）' },
  { icon: <ApiOutlined />, label: '以你的身份调用业务 API' },
  { icon: <CheckCircleOutlined />, label: '获取一次性授权码用于 Token 兑换' },
]

function AuthorizeView({ user, clientName, redirectTarget, rawState, onAuthorize, onDeny, loading, onUploadAvatar }) {
  const appName = clientName || '第三方应用'
  const redirectHost = (() => {
    try { return new URL(redirectTarget.target).hostname } catch { return redirectTarget.target }
  })()

  return (
    <div className="auth-unified-page min-h-screen flex items-center justify-center px-4 py-10">
      <div className="auth-unified-orb auth-unified-orb-a" />
      <div className="auth-unified-orb auth-unified-orb-b" />
      <div className="auth-unified-orb auth-unified-orb-c" />

      <div className="relative z-10 w-full max-w-md">
        <div className="auth-unified-right rounded-3xl p-8">

          {/* App identity */}
          <div className="flex flex-col items-center text-center mb-7">
            <div className="flex items-center gap-4 mb-5">
              {/* requesting app icon */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-indigo-200">
                  <ApiOutlined style={{ color: '#fff', fontSize: 24 }} />
                </div>
                <span className="text-xs text-slate-400 max-w-[64px] truncate">{appName}</span>
              </div>

              <div className="auth-oauth-arrow mb-4">
                <svg width="36" height="16" viewBox="0 0 36 16" fill="none">
                  <path d="M0 8h32M26 2l8 6-8 6" stroke="#a5b4fc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>

              {/* EasyDB icon */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-200">
                  <DatabaseOutlined style={{ color: '#fff', fontSize: 24 }} />
                </div>
                <span className="text-xs text-slate-400">EasyDB</span>
              </div>
            </div>

            <Typography.Title level={4} style={{ color: '#1e293b', marginBottom: 4, marginTop: 0 }}>
              授权 {appName}
            </Typography.Title>
            <div className="text-sm text-slate-500">
              <span className="font-medium text-indigo-600">{appName}</span> 请求访问你在 EasyDB 的账号
            </div>
          </div>

          {/* Logged-in user */}
          <div className="auth-oauth-user-row mb-5">
            <AvatarUploader
              current={user?.avatar || null}
              username={user?.username || user?.name || '?'}
              size={40}
              onSave={onUploadAvatar}
            />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-slate-800 leading-tight truncate">
                {user?.username || user?.name || '未知用户'}
              </span>
              <span className="text-xs text-slate-400 leading-tight">{user?.role || 'user'}</span>
            </div>
            <Tag color="green" style={{ marginLeft: 'auto', fontSize: 11, flexShrink: 0 }}>已认证</Tag>
          </div>

          {/* Scopes */}
          <div className="mb-6">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">授权内容</div>
            <div className="grid gap-2">
              {oauthScopes.map((s) => (
                <div key={s.label} className="auth-oauth-scope-row">
                  <CheckCircleOutlined style={{ color: '#6366f1', fontSize: 14, flexShrink: 0 }} />
                  <span className="text-sm text-slate-600">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Redirect hint */}
          <div className="auth-path-badge mb-6 text-xs">
            授权后将回跳至：<span>{redirectHost}</span>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              block
              size="large"
              onClick={onDeny}
              disabled={loading}
              style={{ borderRadius: 10, height: 44 }}
            >
              拒绝
            </Button>
            <Button
              type="primary"
              block
              size="large"
              loading={loading}
              onClick={onAuthorize}
              style={{ borderRadius: 10, height: 44 }}
            >
              授权并继续
            </Button>
          </div>

          <div className="mt-4 text-center text-xs text-slate-400">
            授权后，{appName} 将获得一次性授权码，有效期 5 分钟
          </div>
        </div>
      </div>
    </div>
  )
}

function LoginPage() {
  const { login, request, token, user, uploadAvatar } = useConsole()
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)

  const query = useMemo(() => new URLSearchParams(location.search), [location.search])
  const clientName = useMemo(() => query.get('client') || '', [query])
  const redirectTarget = useMemo(() => parseRedirectTarget(query.get('redirect')), [query])
  const rawState = useMemo(() => sanitizeState(query.get('state')), [query])
  const fallbackPath = location.state?.from?.pathname || '/app/projects'
  const from = redirectTarget.mode === 'internal' ? redirectTarget.target || fallbackPath : fallbackPath
  const targetLabel = clientName || (redirectTarget.mode === 'external' ? '业务系统' : 'EasyDB 控制台')

  // 已登录 + 外部跳转 → 授权页
  const isAuthorizeMode = !!(token && user && redirectTarget.mode === 'external')

  const doAuthorize = async () => {
    setLoading(true)
    try {
      const payload = await request('/api/auth/authorize', {
        method: 'POST',
        body: {
          client: clientName || 'business-web',
          redirect: redirectTarget.target,
          state: rawState,
        },
      })
      if (!payload.redirectTo) throw new Error('授权回跳地址生成失败')
      message.success('授权成功，正在跳转...')
      window.location.href = payload.redirectTo
    } catch (err) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const doDeny = () => {
    try {
      const url = new URL(redirectTarget.target)
      url.searchParams.set('error', 'access_denied')
      if (rawState) url.searchParams.set('state', rawState)
      window.location.href = url.toString()
    } catch {
      navigate('/app/projects', { replace: true })
    }
  }

  const onFinish = async (values) => {
    setLoading(true)
    try {
      if (redirectTarget.mode === 'external') {
        const payload = await request('/api/auth/authorize', {
          method: 'POST',
          auth: false,
          body: {
            username: values.username,
            password: values.password,
            client: clientName || 'business-web',
            redirect: redirectTarget.target,
            state: rawState,
          },
        })
        if (!payload.redirectTo) throw new Error('认证回跳地址生成失败')
        message.success(`登录成功，正在返回 ${targetLabel}。`)
        window.location.href = payload.redirectTo
        return
      }
      await login(values)
      message.success(`登录成功，正在进入 ${targetLabel}。`)
      navigate(from, { replace: true })
    } catch (err) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (isAuthorizeMode) {
    return (
      <AuthorizeView
        user={user}
        clientName={clientName}
        redirectTarget={redirectTarget}
        rawState={rawState}
        onAuthorize={doAuthorize}
        onDeny={doDeny}
        loading={loading}
        onUploadAvatar={uploadAvatar}
      />
    )
  }

  return (
    <div className="auth-unified-page min-h-screen flex items-center px-4 py-10 md:px-8">
      <div className="auth-unified-orb auth-unified-orb-a" />
      <div className="auth-unified-orb auth-unified-orb-b" />
      <div className="auth-unified-orb auth-unified-orb-c" />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-stretch gap-5 lg:grid-cols-[1.2fr_0.8fr]">

        {/* ── Left: Brand & Features ── */}
        <section className="auth-unified-left rounded-3xl p-8 md:p-10 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
              <DatabaseOutlined style={{ color: '#fff', fontSize: 18 }} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800 leading-none">EasyDB</div>
              <div className="text-xs text-slate-400 mt-0.5">Unified Auth Gateway</div>
            </div>
            <div className="ml-auto flex gap-1.5">
              <Tag color="blue" style={{ fontSize: 10, padding: '0 6px', margin: 0 }}>SSO</Tag>
              <Tag color="purple" style={{ fontSize: 10, padding: '0 6px', margin: 0 }}>JWT</Tag>
            </div>
          </div>

          <Typography.Title level={2} style={{ color: '#1e293b', marginBottom: 8, marginTop: 0 }}>
            统一认证中心
          </Typography.Title>
          <Typography.Paragraph style={{ color: '#64748b', lineHeight: 1.7, marginBottom: 0 }}>
            一个入口登录，统一访问管理控制台、业务 API 与审计模块。认证票据全局复用，减少重复登录与多套账号维护成本。
          </Typography.Paragraph>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {trustedApps.map((app) => (
              <div key={app.title} className="auth-surface-card rounded-2xl p-4">
                <div style={{ color: '#6366f1', fontSize: 18 }}>{app.icon}</div>
                <div className="mt-2 text-sm font-semibold text-slate-700">{app.title}</div>
                <div className="mt-1 text-xs text-slate-500">{app.desc}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-2.5 flex-1">
            {policies.map((p) => (
              <div key={p.title} className="auth-policy-row">
                <div style={{ color: '#6366f1', fontSize: 16, marginTop: 1 }}>{p.icon}</div>
                <div>
                  <div className="text-sm font-semibold text-slate-700">{p.title}</div>
                  <div className="text-xs mt-0.5 text-slate-500">{p.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-xs text-slate-400">
            © 2026 EasyDB · 企业级 SQL 网关平台
          </div>
        </section>

        {/* ── Right: Login Form ── */}
        <div className="auth-unified-right rounded-3xl p-8 md:p-10 flex flex-col justify-center">
          <div className="mb-6">
            {/* Avatar area */}
            <div className="flex justify-center mb-5">
              <div className="auth-login-avatar-wrap">
                <div className="auth-login-avatar">
                  <LockOutlined style={{ fontSize: 28, color: '#6366f1' }} />
                </div>
                <div className="auth-login-avatar-ring" />
              </div>
            </div>

            <Typography.Title level={3} style={{ color: '#1e293b', marginBottom: 4, marginTop: 0, textAlign: 'center' }}>
              账号认证
            </Typography.Title>
            <div className="text-sm text-slate-500 text-center">
              登录后将进入 <span className="text-indigo-600 font-medium">{targetLabel}</span>
            </div>
          </div>

          {redirectTarget.mode === 'invalid' && (
            <Alert
              showIcon
              type="warning"
              message="redirect 参数无效，登录后将进入控制台首页"
              style={{ marginBottom: 20, borderRadius: 10 }}
            />
          )}

          <Form layout="vertical" onFinish={onFinish}>
            <Form.Item
              label="统一账号"
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input size="large" prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" style={{ borderRadius: 10 }} />
            </Form.Item>
            <Form.Item
              label="登录密码"
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password size="large" prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" style={{ borderRadius: 10 }} />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading} style={{ borderRadius: 10, height: 44, marginTop: 4 }}>
              认证并继续
            </Button>
          </Form>

          <div className="auth-path-badge mt-5">
            当前接入路径：
            <span>{redirectTarget.mode === 'external' ? '/api/auth/authorize' : '/api/auth/login'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
