import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { KeyOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useConsole } from '../context/ConsoleContext'

function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function UserCenterPage() {
  const { request } = useConsole()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form] = Form.useForm()

  const [resetTarget, setResetTarget] = useState(null) // username string
  const [resetting, setResetting] = useState(false)
  const [resetForm] = Form.useForm()

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const payload = await request('/api/admin/users?limit=200')
      setItems(Array.isArray(payload.items) ? payload.items : [])
    } catch (err) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const onCreate = async () => {
    try {
      const values = await form.validateFields()
      setCreating(true)
      await request('/api/admin/users', {
        method: 'POST',
        body: {
          username: values.username.trim(),
          password: values.password,
          role: values.role,
          status: values.status,
        },
      })
      message.success('用户创建成功。')
      setCreateOpen(false)
      form.resetFields()
      await loadUsers()
    } catch (err) {
      if (err?.errorFields) return
      message.error(err.message)
    } finally {
      setCreating(false)
    }
  }

  const onResetPassword = async () => {
    try {
      const values = await resetForm.validateFields()
      setResetting(true)
      await request(`/api/admin/users/${encodeURIComponent(resetTarget)}/reset-password`, {
        method: 'POST',
        body: { newPassword: values.newPassword },
      })
      message.success(`用户 ${resetTarget} 密码已修改。`)
      setResetTarget(null)
      resetForm.resetFields()
    } catch (err) {
      if (err?.errorFields) return
      message.error(err.message)
    } finally {
      setResetting(false)
    }
  }

  const columns = useMemo(
    () => [
      { title: '用户名', dataIndex: 'username', width: 180 },
      {
        title: '角色',
        dataIndex: 'role',
        width: 140,
        render: (value) => <Tag color={value === 'admin' ? 'magenta' : 'blue'}>{value}</Tag>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 140,
        render: (value) => <Tag color={value === 'active' ? 'green' : 'orange'}>{value}</Tag>,
      },
      {
        title: '最近登录',
        dataIndex: 'last_login_at',
        render: formatTime,
      },
      {
        title: '操作',
        width: 100,
        render: (_, row) => (
          <Button size="small" icon={<KeyOutlined />} onClick={() => setResetTarget(row.username)}>
            改密
          </Button>
        ),
      },
    ],
    [],
  )

  return (
    <Space direction="vertical" size={16} style={{ width: '100%', minHeight: '100%' }}>
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Typography.Title level={4} className="!mb-1">
              平台用户管理
            </Typography.Title>
            <Typography.Text type="secondary">
              这里管理的是网关账号（gateway_users），不是业务库 users 表。
            </Typography.Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void loadUsers()} loading={loading}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建用户
            </Button>
          </Space>
        </div>

        <Table
          className="mt-4"
          rowKey="username"
          loading={loading}
          dataSource={items}
          columns={columns}
          pagination={{ pageSize: 8 }}
        />
      </Card>

      <Alert
        showIcon
        type="warning"
        message="默认管理员策略"
        description="可以保留默认 admin 用于首次引导，但生产环境必须修改默认口令，并至少保留 2 个管理员以防误锁。"
      />

      <Modal
        title="创建网关用户"
        open={createOpen}
        okText="创建"
        cancelText="取消"
        confirmLoading={creating}
        onCancel={() => setCreateOpen(false)}
        onOk={onCreate}
      >
        <Form form={form} layout="vertical" initialValues={{ role: 'analyst', status: 'active' }}>
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { pattern: /^[a-zA-Z0-9._-]{3,64}$/, message: '3-64 位字母数字 . _ -' },
            ]}
          >
            <Input placeholder="例如 devops_admin" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }, { min: 8, message: '至少 8 位' }]}
          >
            <Input.Password placeholder="至少 8 位" />
          </Form.Item>
          <Form.Item label="角色" name="role">
            <Select
              options={[
                { label: 'admin', value: 'admin' },
                { label: 'analyst', value: 'analyst' },
              ]}
            />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select
              options={[
                { label: 'active', value: 'active' },
                { label: 'disabled', value: 'disabled' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`修改密码：${resetTarget}`}
        open={!!resetTarget}
        okText="确认修改"
        cancelText="取消"
        confirmLoading={resetting}
        onCancel={() => { setResetTarget(null); resetForm.resetFields() }}
        onOk={onResetPassword}
      >
        <Form form={resetForm} layout="vertical">
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[{ required: true, message: '请输入新密码' }, { min: 8, message: '至少 8 位' }]}
          >
            <Input.Password placeholder="至少 8 位" />
          </Form.Item>
          <Form.Item
            label="确认新密码"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve()
                  return Promise.reject(new Error('两次输入的密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}

export default UserCenterPage
