import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Space, Typography, message } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useConsole } from '../context/ConsoleContext'

function LoginPage() {
  const { login, apiBase } = useConsole()
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)

  const from = location.state?.from?.pathname || '/app/projects'

  const onFinish = async (values) => {
    setLoading(true)
    try {
      await login(values)
      message.success('登录成功，欢迎进入平台控制台。')
      navigate(from, { replace: true })
    } catch (err) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-grid px-4 py-10 md:px-8">
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1.2fr_1fr]">
        <section className="rounded-3xl border border-teal-200/70 bg-white/90 p-8 shadow-xl shadow-teal-900/10 backdrop-blur">
          <Typography.Title level={2} className="!mb-2 !text-slate-800">
            EasyDB 网关控制台
          </Typography.Title>
          <Typography.Paragraph className="!mb-0 !text-slate-600">
            管理员登录后，即可开通项目、自动建库建表、执行项目 SQL 和审计查询。
          </Typography.Paragraph>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Card size="small" className="card-soft">
              <Typography.Text strong>统一登录</Typography.Text>
              <p className="mt-2 text-sm text-slate-500">只登录一次，不再区分作用域 token。</p>
            </Card>
            <Card size="small" className="card-soft">
              <Typography.Text strong>自动开通</Typography.Text>
              <p className="mt-2 text-sm text-slate-500">创建项目自动生成默认环境并初始化业务表。</p>
            </Card>
            <Card size="small" className="card-soft">
              <Typography.Text strong>项目隔离</Typography.Text>
              <p className="mt-2 text-sm text-slate-500">SQL 仍按 project/env 路由隔离访问。</p>
            </Card>
            <Card size="small" className="card-soft">
              <Typography.Text strong>审计可追踪</Typography.Text>
              <p className="mt-2 text-sm text-slate-500">所有关键动作落盘，可按条件检索。</p>
            </Card>
          </div>
        </section>

        <Card className="rounded-3xl border border-teal-300/70 bg-white/95 shadow-xl shadow-teal-900/15">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Typography.Title level={4} className="!mb-1">
                管理员登录
              </Typography.Title>
              <Typography.Text type="secondary">当前 API: {apiBase}</Typography.Text>
            </div>

            <Alert
              type="info"
              showIcon
              message="默认管理员"
              description="初始化后可用 admin / admin123，首次登录后建议立即修改密码。"
            />

            <Form layout="vertical" initialValues={{ username: 'admin', password: 'admin123' }} onFinish={onFinish}>
              <Form.Item
                label="网关用户名"
                name="username"
                rules={[{ required: true, message: '请输入用户名' }]}
              >
                <Input prefix={<UserOutlined />} placeholder="admin" autoComplete="username" />
              </Form.Item>

              <Form.Item
                label="网关密码"
                name="password"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
              </Form.Item>

              <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                登录并进入
              </Button>
            </Form>
          </Space>
        </Card>
      </div>
    </div>
  )
}

export default LoginPage
