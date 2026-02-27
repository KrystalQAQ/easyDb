import { useMemo, useState } from 'react'
import { Alert, Button, Card, Form, Input, Space, Tag, Typography, message } from 'antd'
import {
  ApiOutlined,
  AuditOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useConsole } from '../context/ConsoleContext'

function sanitizeRedirectPath(rawPath) {
  const next = String(rawPath || '').trim()
  if (!next.startsWith('/')) return ''
  if (next.startsWith('//')) return ''
  return next
}

function LoginPage() {
  const { login } = useConsole()
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)

  const query = useMemo(() => new URLSearchParams(location.search), [location.search])
  const clientName = useMemo(() => query.get('client') || '', [query])
  const redirectFromQuery = useMemo(() => sanitizeRedirectPath(query.get('redirect')), [query])

  const from = redirectFromQuery || location.state?.from?.pathname || '/app/projects'
  const targetLabel = clientName || 'EasyDB 控制台'

  const trustedApps = [
    { icon: <CloudServerOutlined />, title: '管理控制台', desc: '项目、环境与网关配置管理' },
    { icon: <ApiOutlined />, title: '业务 API 平台', desc: '统一接口调用与密钥授权' },
    { icon: <AuditOutlined />, title: '审计中心', desc: '操作轨迹与风险追踪' },
  ]

  const onFinish = async (values) => {
    setLoading(true)
    try {
      await login(values)
      message.success(`登录成功，正在进入 ${targetLabel}。`)
      navigate(from, { replace: true })
    } catch (err) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-unified-page min-h-screen px-4 py-8 md:px-8 md:py-12">
      <div className="auth-unified-orb auth-unified-orb-a" />
      <div className="auth-unified-orb auth-unified-orb-b" />
      <div className="mx-auto grid max-w-6xl items-stretch gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="auth-unified-left rounded-3xl p-7 md:p-9">
          <Space size={8} wrap>
            <Tag color="blue">UNIFIED AUTH</Tag>
            <Tag color="geekblue">ONE SIGN-IN</Tag>
            <Tag color="cyan">TOKEN SHARED</Tag>
          </Space>
          <Typography.Title level={2} className="!mb-2 !mt-4 !text-slate-900">
            统一认证中心
          </Typography.Title>
          <Typography.Paragraph className="!mb-0 !text-slate-600 !leading-relaxed">
            一个入口登录后，统一访问管理控制台、业务 API 与审计模块。认证票据全局复用，减少重复登录与多套账号维护成本。
          </Typography.Paragraph>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {trustedApps.map((app) => (
              <Card key={app.title} size="small" className="auth-surface-card h-full">
                <div className="text-base text-blue-700">{app.icon}</div>
                <Typography.Text strong className="mt-2 block">
                  {app.title}
                </Typography.Text>
                <div className="mt-1 text-sm text-slate-500">{app.desc}</div>
              </Card>
            ))}
          </div>

          <div className="mt-7 grid gap-3">
            <div className="auth-policy-row">
              <DatabaseOutlined className="mt-1 text-blue-700" />
              <div>
                <Typography.Text strong>策略统一</Typography.Text>
                <div className="text-sm text-slate-500">统一校验 JWT 签发方与受众，避免跨系统误用票据。</div>
              </div>
            </div>
            <div className="auth-policy-row">
              <SafetyCertificateOutlined className="mt-1 text-blue-700" />
              <div>
                <Typography.Text strong>鉴权可追溯</Typography.Text>
                <div className="text-sm text-slate-500">所有关键操作通过统一账号标识进行审计关联。</div>
              </div>
            </div>
            <div className="auth-policy-row">
              <CloudServerOutlined className="mt-1 text-blue-700" />
              <div>
                <Typography.Text strong>系统可扩展</Typography.Text>
                <div className="text-sm text-slate-500">后续新增业务系统可直接复用当前认证入口与 Token 体系。</div>
              </div>
            </div>
          </div>
        </section>

        <Card className="auth-unified-right rounded-3xl">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Typography.Title level={4} className="!mb-1 !text-slate-900">
                账号认证
              </Typography.Title>
              <Typography.Text type="secondary">登录后将进入 {targetLabel}。</Typography.Text>
            </div>
            <Alert showIcon type="info" message={`认证成功后自动跳转至 ${from}`} />

            <Form layout="vertical" onFinish={onFinish} className="mt-1">
              <Form.Item
                label="统一账号"
                name="username"
                rules={[{ required: true, message: '请输入用户名' }]}
              >
                <Input size="large" prefix={<UserOutlined />} autoComplete="username" />
              </Form.Item>

              <Form.Item
                label="登录密码"
                name="password"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password size="large" prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
              </Form.Item>

              <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                认证并继续
              </Button>
            </Form>

            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-slate-600">
              当前接入路径：<span className="font-medium text-slate-800">/api/auth/login</span>
            </div>
          </Space>
        </Card>
      </div>
    </div>
  )
}

export default LoginPage
