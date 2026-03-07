import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Form, Input, InputNumber, Space, Typography, message } from 'antd'
import { DatabaseOutlined, SettingOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { buildApiUrl, buildAppUrl } from '../lib/http'

function normalizeError(payload, fallback) {
  if (payload && typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim()
  return fallback
}

function BootstrapSetupPage() {
  const navigate = useNavigate()
  const [statusLoading, setStatusLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState(null)
  const [initReport, setInitReport] = useState(null)
  const [form] = Form.useForm()

  const fetchStatus = async () => {
    setStatusLoading(true)
    try {
      const response = await fetch(buildApiUrl('/api/system/bootstrap/status'))
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.ok === false) {
        throw new Error(normalizeError(payload, '读取初始化状态失败'))
      }
      const nextStatus = payload.status || null
      setStatus(nextStatus)
      setInitReport(payload.initReport || null)
      if (nextStatus?.initialized) {
        navigate('/login', { replace: true })
      }
    } catch (err) {
      message.error(err?.message || '读取初始化状态失败')
    } finally {
      setStatusLoading(false)
    }
  }

  useEffect(() => {
    void fetchStatus()
  }, [])

  const onSubmit = async (values) => {
    setSubmitting(true)
    try {
      const response = await fetch(buildApiUrl('/api/system/bootstrap/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.ok === false) {
        throw new Error(normalizeError(payload, '数据库初始化失败'))
      }
      setInitReport(payload.initReport || null)
      if (payload.initReport?.initializedTables) {
        message.success(payload.message || `数据库初始化成功，已自动初始化 ${payload.initReport.createdTables.length} 张系统表`)
      } else {
        message.success(payload.message || '数据库初始化成功，系统表已就绪')
      }
      if (payload.restartRequired) {
        message.info('服务正在重启，请稍候...')
        setTimeout(() => {
          window.location.href = buildAppUrl('/login')
        }, 1800)
        return
      }
      navigate('/login', { replace: true })
    } catch (err) {
      message.error(err?.message || '数据库初始化失败')
      await fetchStatus()
    } finally {
      setSubmitting(false)
    }
  }

  const sourceText = useMemo(() => {
    if (!status?.source) return '未配置'
    return status.source === 'env' ? '环境变量' : '本地配置文件'
  }, [status])

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#f1f5f9' }}>
      <Card style={{ width: '100%', maxWidth: 620, borderRadius: 14 }}>
        <Space direction="vertical" size={18} style={{ width: '100%' }}>
          <Space align="center" size={12}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
              }}
            >
              <DatabaseOutlined />
            </div>
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                初始化平台数据库
              </Typography.Title>
              <Typography.Text type="secondary">
                当前未检测到可用数据库配置，请先填写连接信息
              </Typography.Text>
            </div>
          </Space>

          <Alert
            type={status?.initialized ? 'success' : 'info'}
            showIcon
            icon={<SettingOutlined />}
            message={status?.initialized ? '数据库已初始化' : '数据库尚未初始化'}
            description={
              <div>
                <div>配置来源：{sourceText}</div>
                {status?.lastError ? <div style={{ marginTop: 4 }}>最近错误：{status.lastError}</div> : null}
                {initReport?.initializedTables ? (
                  <div style={{ marginTop: 4 }}>
                    已自动初始化系统表：{Array.isArray(initReport.createdTables) ? initReport.createdTables.join(', ') : '-'}
                  </div>
                ) : null}
              </div>
            }
          />

          <Form
            form={form}
            layout="vertical"
            onFinish={onSubmit}
            initialValues={{
              host: '',
              port: 3306,
              user: '',
              password: '',
              database: '',
            }}
          >
            <Form.Item label="DB_HOST" name="host" rules={[{ required: true, message: '请输入数据库主机地址' }]}>
              <Input placeholder="例如：127.0.0.1 或 mysql" disabled={statusLoading || submitting} />
            </Form.Item>
            <Form.Item label="DB_PORT" name="port" rules={[{ required: true, message: '请输入数据库端口' }]}>
              <InputNumber min={1} max={65535} style={{ width: '100%' }} disabled={statusLoading || submitting} />
            </Form.Item>
            <Form.Item label="DB_USER" name="user" rules={[{ required: true, message: '请输入数据库账号' }]}>
              <Input placeholder="例如：root" disabled={statusLoading || submitting} />
            </Form.Item>
            <Form.Item label="DB_PASSWORD" name="password">
              <Input.Password placeholder="可留空" disabled={statusLoading || submitting} />
            </Form.Item>
            <Form.Item label="DB_NAME" name="database" rules={[{ required: true, message: '请输入数据库名称' }]}>
              <Input placeholder="例如：easydb_platform" disabled={statusLoading || submitting} />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              disabled={statusLoading}
              block
              size="large"
            >
              保存并初始化
            </Button>
          </Form>
        </Space>
      </Card>
    </div>
  )
}

export default BootstrapSetupPage
