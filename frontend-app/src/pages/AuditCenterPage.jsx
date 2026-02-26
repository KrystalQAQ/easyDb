import { useCallback, useMemo, useState } from 'react'
import { Button, Card, DatePicker, Form, Input, Select, Space, Table, Tag, Typography, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useConsole } from '../context/ConsoleContext'

function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function AuditCenterPage() {
  const { request } = useConsole()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [form] = Form.useForm()

  const loadLogs = useCallback(async () => {
    const values = form.getFieldsValue()
    const params = new URLSearchParams()
    params.set('limit', '120')

    if (values.status) params.set('status', values.status)
    if (values.actor) params.set('actor', values.actor.trim())
    if (values.role) params.set('role', values.role)
    if (values.requestId) params.set('requestId', values.requestId.trim())

    if (values.timeRange?.[0] && values.timeRange?.[1]) {
      params.set('from', values.timeRange[0].toISOString())
      params.set('to', values.timeRange[1].toISOString())
    }

    setLoading(true)
    try {
      const payload = await request(`/api/admin/audit-logs?${params.toString()}`)
      setItems(Array.isArray(payload.items) ? payload.items : [])
    } catch (err) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [form, request])

  const columns = useMemo(
    () => [
      {
        title: '时间',
        dataIndex: 'timestamp',
        width: 190,
        render: formatTime,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 120,
        render: (value) => {
          const color = value === 'ok' ? 'green' : value === 'blocked' ? 'orange' : value === 'error' ? 'red' : 'blue'
          return <Tag color={color}>{value || '-'}</Tag>
        },
      },
      {
        title: '操作者',
        width: 180,
        render: (_, row) => `${row.actor || '-'} / ${row.role || '-'}`,
      },
      {
        title: '请求',
        dataIndex: 'endpoint',
        ellipsis: true,
      },
      {
        title: '项目上下文',
        width: 160,
        render: (_, row) => `${row.projectKey || '-'}/${row.env || '-'}`,
      },
      {
        title: '错误信息',
        dataIndex: 'error',
        ellipsis: true,
      },
    ],
    [],
  )

  return (
    <Space direction="vertical" size={16} style={{ width: '100%', minHeight: '100%' }}>
      <Card>
        <Typography.Title level={4} className="page-title !mb-4">
          审计日志
        </Typography.Title>

        <Form form={form} layout="vertical" onFinish={() => void loadLogs()}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Form.Item name="status" label="状态">
              <Select
                allowClear
                options={[
                  { label: 'ok', value: 'ok' },
                  { label: 'blocked', value: 'blocked' },
                  { label: 'error', value: 'error' },
                  { label: 'rate_limited', value: 'rate_limited' },
                ]}
              />
            </Form.Item>

            <Form.Item name="actor" label="操作者">
              <Input placeholder="例如 admin" />
            </Form.Item>

            <Form.Item name="role" label="角色">
              <Select
                allowClear
                options={[
                  { label: 'admin', value: 'admin' },
                  { label: 'analyst', value: 'analyst' },
                ]}
              />
            </Form.Item>

            <Form.Item name="requestId" label="requestId">
              <Input placeholder="可选" />
            </Form.Item>

            <Form.Item name="timeRange" label="时间区间">
              <DatePicker.RangePicker showTime style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Space>
            <Button type="primary" htmlType="submit">
              查询
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void loadLogs()} loading={loading}>
              刷新
            </Button>
          </Space>
        </Form>

        <Table
          className="mt-4"
          rowKey={(row) => `${row.timestamp}-${row.requestId || Math.random()}`}
          loading={loading}
          dataSource={items}
          columns={columns}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </Space>
  )
}

export default AuditCenterPage
