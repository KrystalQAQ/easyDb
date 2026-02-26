import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Space, Tag, Typography, message } from 'antd'
import { CloudServerOutlined, DatabaseOutlined, LockOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useConsole } from '../context/ConsoleContext'

function LoginPage() {
  const { login } = useConsole()
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
    <div className="min-h-screen bg-grid px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-blue-100 bg-white p-7 md:p-9">
          <Tag color="blue">EASYDB CONTROL PLANE</Tag>
          <Typography.Title level={2} className="!mb-2 !mt-4 !text-slate-900">
            统一网关管理平台
          </Typography.Title>
          <Typography.Paragraph className="!mb-0 !text-slate-600 !leading-relaxed">
            覆盖项目开通、SQL 执行、接口治理、用户权限与审计追踪。面向平台运维和数据管理员，提供统一入口与可追溯操作链路。
          </Typography.Paragraph>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Card size="small" className="card-soft">
              <Typography.Text strong>多项目隔离</Typography.Text>
              <div className="mt-1 text-sm text-slate-500">Project / Env 粒度路由控制</div>
            </Card>
            <Card size="small" className="card-soft">
              <Typography.Text strong>接口治理</Typography.Text>
              <div className="mt-1 text-sm text-slate-500">模板化 API + Key 授权</div>
            </Card>
            <Card size="small" className="card-soft">
              <Typography.Text strong>全链路审计</Typography.Text>
              <div className="mt-1 text-sm text-slate-500">日志检索与责任可追踪</div>
            </Card>
          </div>

          <div className="mt-7 grid gap-3">
            <div className="flex items-start gap-3 rounded-xl border border-blue-100 px-4 py-3">
              <DatabaseOutlined className="mt-1 text-blue-700" />
              <div>
                <Typography.Text strong>数据操作控制</Typography.Text>
                <div className="text-sm text-slate-500">支持 SQL 类型限制、表白名单、LIMIT 策略控制。</div>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-blue-100 px-4 py-3">
              <CloudServerOutlined className="mt-1 text-blue-700" />
              <div>
                <Typography.Text strong>部署与网关配置</Typography.Text>
                <div className="text-sm text-slate-500">项目环境绑定 Nginx 与前端发布目录，一站式运维。</div>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-blue-100 px-4 py-3">
              <SafetyCertificateOutlined className="mt-1 text-blue-700" />
              <div>
                <Typography.Text strong>安全认证体系</Typography.Text>
                <div className="text-sm text-slate-500">统一账号登录、角色隔离与接口级访问控制。</div>
              </div>
            </div>
          </div>
        </section>

        <Card className="rounded-3xl border border-blue-200 bg-white">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Typography.Title level={4} className="!mb-1 !text-slate-900">
                管理员登录
              </Typography.Title>
              <Typography.Text type="secondary">请输入网关账号密码登录控制台。</Typography.Text>
            </div>
            <Alert showIcon type="info" message="登录后将进入统一控制台首页并保持会话。" />

            <Form layout="vertical" onFinish={onFinish} className="mt-1">
              <Form.Item
                label="网关用户名"
                name="username"
                rules={[{ required: true, message: '请输入用户名' }]}
              >
                <Input size="large" prefix={<UserOutlined />} placeholder="admin" autoComplete="username" />
              </Form.Item>

              <Form.Item
                label="网关密码"
                name="password"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password size="large" prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
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
