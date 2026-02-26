import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  ApiOutlined,
  BugOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useConsole } from '../context/ConsoleContext'

const METHOD_COLORS = { GET: 'green', POST: 'blue', PUT: 'orange', DELETE: 'red' }
const SQL_TYPES = ['select', 'insert', 'update', 'delete']
const PARAM_TYPES = ['string', 'integer', 'number', 'boolean', 'datetime']

function MethodTag({ method }) {
  return <Tag color={METHOD_COLORS[method] || 'default'}>{method}</Tag>
}

// ─── 参数定义编辑器 ────────────────────────────────────────────────────────────
function ParamsSchemaEditor({ value = [], onChange }) {
  const add = () =>
    onChange([...value, { name: '', type: 'string', required: false, default: undefined }])

  const update = (idx, field, val) => {
    const next = value.map((p, i) => (i === idx ? { ...p, [field]: val } : p))
    onChange(next)
  }

  const remove = (idx) => onChange(value.filter((_, i) => i !== idx))

  return (
    <div>
      {value.map((param, idx) => (
        <div key={idx} className="mb-2 flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2">
          <Input
            placeholder="参数名"
            value={param.name}
            onChange={(e) => update(idx, 'name', e.target.value)}
            style={{ width: 120 }}
          />
          <Select
            value={param.type}
            onChange={(v) => update(idx, 'type', v)}
            options={PARAM_TYPES.map((t) => ({ label: t, value: t }))}
            style={{ width: 100 }}
          />
          <Tooltip title="必填">
            <Switch
              size="small"
              checked={param.required}
              onChange={(v) => update(idx, 'required', v)}
            />
            <span className="ml-1 text-xs text-slate-500">必填</span>
          </Tooltip>
          <Input
            placeholder="默认值"
            value={param.default ?? ''}
            onChange={(e) => update(idx, 'default', e.target.value || undefined)}
            style={{ width: 100 }}
          />
          <Input
            placeholder="描述"
            value={param.description ?? ''}
            onChange={(e) => update(idx, 'description', e.target.value || undefined)}
            style={{ width: 140 }}
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => remove(idx)}
          />
        </div>
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={add}>
        添加参数
      </Button>
    </div>
  )
}

// ─── 接口编辑抽屉 ──────────────────────────────────────────────────────────────
function ApiEditorDrawer({ open, onClose, onSaved, editingApi, groups, projectKey, env, request }) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [paramsSchema, setParamsSchema] = useState([])

  useEffect(() => {
    if (open) {
      if (editingApi) {
        form.setFieldsValue({
          apiKey: editingApi.apiKey,
          name: editingApi.name,
          description: editingApi.description || '',
          groupKey: editingApi.groupKey || undefined,
          method: editingApi.method || 'POST',
          path: editingApi.path || '',
          sqlTemplate: editingApi.sqlTemplate,
          sqlType: editingApi.sqlType,
          cacheTTL: editingApi.cacheTTL ?? 0,
          authMode: editingApi.authMode || 'token',
          status: editingApi.status || 'active',
        })
        setParamsSchema(editingApi.paramsSchema || [])
      } else {
        form.resetFields()
        form.setFieldsValue({ method: 'POST', sqlType: 'select', cacheTTL: 0, authMode: 'token', status: 'active' })
        setParamsSchema([])
      }
    }
  }, [open, editingApi, form])

  const handleSave = async () => {
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      const body = {
        apiKey: values.apiKey,
        name: values.name,
        description: values.description || '',
        groupKey: values.groupKey || null,
        method: values.method,
        path: values.path || '',
        sqlTemplate: values.sqlTemplate,
        sqlType: values.sqlType,
        paramsSchema,
        cacheTTL: values.cacheTTL ?? 0,
        authMode: values.authMode,
        status: values.status,
      }
      if (editingApi) {
        await request(`/api/platform/projects/${projectKey}/envs/${env}/apis/${editingApi.apiKey}`, {
          method: 'PUT',
          body,
        })
        message.success('接口已更新')
      } else {
        await request(`/api/platform/projects/${projectKey}/envs/${env}/apis`, {
          method: 'POST',
          body,
        })
        message.success('接口已创建')
      }
      onSaved()
      onClose()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      title={editingApi ? `编辑接口：${editingApi.apiKey}` : '新建接口'}
      open={open}
      onClose={onClose}
      width={680}
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item label="接口标识 (apiKey)" name="apiKey" rules={[{ required: true, message: '必填' }]}>
              <Input placeholder="getUserOrders" disabled={!!editingApi} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="接口名称" name="name" rules={[{ required: true, message: '必填' }]}>
              <Input placeholder="查询用户订单" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item label="所属分组" name="groupKey">
              <Select
                allowClear
                placeholder="不分组"
                options={groups.map((g) => ({ label: g.name, value: g.groupKey }))}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="HTTP 方法" name="method">
              <Select options={['GET', 'POST', 'PUT', 'DELETE'].map((m) => ({ label: m, value: m }))} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="SQL 类型" name="sqlType" rules={[{ required: true }]}>
              <Select options={SQL_TYPES.map((t) => ({ label: t, value: t }))} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="自定义路径" name="path">
          <Input placeholder="/orders（可选）" />
        </Form.Item>

        <Form.Item label="SQL 模板" name="sqlTemplate" rules={[{ required: true, message: '必填' }]}>
          <Input.TextArea
            rows={5}
            placeholder="SELECT * FROM orders WHERE user_id = :userId LIMIT :limit"
            style={{ fontFamily: 'monospace', fontSize: 13 }}
          />
        </Form.Item>

        <Form.Item label="参数定义">
          <ParamsSchemaEditor value={paramsSchema} onChange={setParamsSchema} />
        </Form.Item>

        <Row gutter={12}>
          <Col span={8}>
            <Form.Item label="鉴权模式" name="authMode">
              <Select
                options={[
                  { label: 'token（需登录）', value: 'token' },
                  { label: 'public（公开）', value: 'public' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="缓存 TTL（秒）" name="cacheTTL">
              <InputNumber min={0} max={86400} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="状态" name="status">
              <Select
                options={[
                  { label: '启用', value: 'active' },
                  { label: '禁用', value: 'disabled' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="描述" name="description">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

// ─── 在线调试面板 ──────────────────────────────────────────────────────────────
function ApiDebugPanel({ api, projectKey, env, request }) {
  const [paramsText, setParamsText] = useState('{}')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (api?.paramsSchema?.length) {
      const defaults = {}
      for (const p of api.paramsSchema) {
        defaults[p.name] = p.default ?? (p.type === 'integer' || p.type === 'number' ? 0 : '')
      }
      setParamsText(JSON.stringify(defaults, null, 2))
    } else {
      setParamsText('{}')
    }
    setResult(null)
  }, [api])

  const run = async () => {
    let params
    try {
      params = JSON.parse(paramsText)
    } catch {
      message.error('参数 JSON 格式错误')
      return
    }
    setRunning(true)
    try {
      const data = await request(
        `/api/platform/projects/${projectKey}/envs/${env}/apis/${api.apiKey}/test`,
        { method: 'POST', body: { params } },
      )
      setResult(data)
    } catch (err) {
      setResult({ ok: false, error: err.message })
    } finally {
      setRunning(false)
    }
  }

  if (!api) return <Typography.Text type="secondary">请先选择一个接口</Typography.Text>

  return (
    <div>
      <Typography.Text strong>测试参数（JSON）</Typography.Text>
      <Input.TextArea
        rows={5}
        value={paramsText}
        onChange={(e) => setParamsText(e.target.value)}
        style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 8 }}
      />
      <Button
        type="primary"
        icon={<BugOutlined />}
        loading={running}
        onClick={run}
        style={{ marginTop: 8 }}
      >
        执行
      </Button>
      {result && (
        <div className="mt-3">
          <Divider orientation="left" plain>
            <Tag color={result.ok ? 'green' : 'red'}>{result.ok ? '成功' : '失败'}</Tag>
          </Divider>
          <pre
            style={{
              background: '#f6f8fa',
              padding: 12,
              borderRadius: 6,
              fontSize: 12,
              maxHeight: 300,
              overflow: 'auto',
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── 分组管理 Modal ────────────────────────────────────────────────────────────
function GroupModal({ open, onClose, onSaved, editingGroup, projectKey, env, request }) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (editingGroup) {
        form.setFieldsValue({
          groupKey: editingGroup.groupKey,
          name: editingGroup.name,
          basePath: editingGroup.basePath || '',
          description: editingGroup.description || '',
        })
      } else {
        form.resetFields()
      }
    }
  }, [open, editingGroup, form])

  const handleSave = async () => {
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      const body = {
        groupKey: values.groupKey,
        name: values.name,
        basePath: values.basePath || '',
        description: values.description || '',
      }
      if (editingGroup) {
        await request(
          `/api/platform/projects/${projectKey}/envs/${env}/api-groups/${editingGroup.groupKey}`,
          { method: 'PUT', body },
        )
        message.success('分组已更新')
      } else {
        await request(`/api/platform/projects/${projectKey}/envs/${env}/api-groups`, {
          method: 'POST',
          body,
        })
        message.success('分组已创建')
      }
      onSaved()
      onClose()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editingGroup ? '编辑分组' : '新建分组'}
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item label="分组标识 (groupKey)" name="groupKey" rules={[{ required: true }]}>
          <Input placeholder="order-service" disabled={!!editingGroup} />
        </Form.Item>
        <Form.Item label="分组名称" name="name" rules={[{ required: true }]}>
          <Input placeholder="订单服务" />
        </Form.Item>
        <Form.Item label="路径前缀" name="basePath">
          <Input placeholder="/order（可选）" />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

// ─── 主页面 ────────────────────────────────────────────────────────────────────
function ApiCenterPage() {
  const { request, projectKey, env } = useConsole()

  const [groups, setGroups] = useState([])
  const [selectedGroupKey, setSelectedGroupKey] = useState(null)
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)

  const [apis, setApis] = useState([])
  const [apisLoading, setApisLoading] = useState(false)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingApi, setEditingApi] = useState(null)

  const [debugApi, setDebugApi] = useState(null)
  const [debugOpen, setDebugOpen] = useState(false)

  const loadGroups = useCallback(async () => {
    try {
      const data = await request(`/api/platform/projects/${projectKey}/envs/${env}/api-groups`)
      setGroups(Array.isArray(data.items) ? data.items : [])
    } catch (err) {
      message.error('加载分组失败：' + err.message)
    }
  }, [request, projectKey, env])

  const loadApis = useCallback(async () => {
    setApisLoading(true)
    try {
      const qs = selectedGroupKey ? `?groupKey=${selectedGroupKey}` : ''
      const data = await request(`/api/platform/projects/${projectKey}/envs/${env}/apis${qs}`)
      setApis(Array.isArray(data.items) ? data.items : [])
    } catch (err) {
      message.error('加载接口失败：' + err.message)
    } finally {
      setApisLoading(false)
    }
  }, [request, projectKey, env, selectedGroupKey])

  useEffect(() => { void loadGroups() }, [loadGroups])
  useEffect(() => { void loadApis() }, [loadApis])

  const handleDeleteApi = async (apiKey) => {
    try {
      await request(`/api/platform/projects/${projectKey}/envs/${env}/apis/${apiKey}`, { method: 'DELETE' })
      message.success('接口已删除')
      void loadApis()
    } catch (err) {
      message.error(err.message)
    }
  }

  const handleDeleteGroup = async (groupKey) => {
    try {
      await request(`/api/platform/projects/${projectKey}/envs/${env}/api-groups/${groupKey}`, { method: 'DELETE' })
      message.success('分组已删除')
      if (selectedGroupKey === groupKey) setSelectedGroupKey(null)
      void loadGroups()
      void loadApis()
    } catch (err) {
      message.error(err.message)
    }
  }

  const columns = useMemo(() => [
    { title: '方法', dataIndex: 'method', width: 80, render: (v) => <MethodTag method={v} /> },
    { title: '接口标识', dataIndex: 'apiKey', width: 180, render: (v) => <Typography.Text code>{v}</Typography.Text> },
    { title: '名称', dataIndex: 'name', ellipsis: true },
    { title: 'SQL 类型', dataIndex: 'sqlType', width: 90, render: (v) => <Tag>{v}</Tag> },
    { title: '鉴权', dataIndex: 'authMode', width: 90, render: (v) => <Tag color={v === 'public' ? 'orange' : 'blue'}>{v}</Tag> },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v) => <Badge status={v === 'active' ? 'success' : 'default'} text={v === 'active' ? '启用' : '禁用'} />,
    },
    {
      title: '操作', width: 160,
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" icon={<BugOutlined />} onClick={() => { setDebugApi(row); setDebugOpen(true) }}>调试</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingApi(row); setEditorOpen(true) }} />
          <Popconfirm title="确认删除此接口？" onConfirm={() => void handleDeleteApi(row.apiKey)} okText="删除" cancelText="取消">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [projectKey, env])

  const sideItems = useMemo(() => [
    { key: '__all__', label: `全部 (${apis.length})`, group: null },
    ...groups.map((g) => ({ key: g.groupKey, label: g.name, group: g })),
  ], [groups, apis.length])

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <div className="mb-4 flex items-center justify-end">
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => { void loadGroups(); void loadApis() }}>刷新</Button>
            <Button icon={<PlusOutlined />} onClick={() => { setEditingGroup(null); setGroupModalOpen(true) }}>新建分组</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingApi(null); setEditorOpen(true) }}>新建接口</Button>
          </Space>
        </div>

        <Row gutter={16}>
          <Col xs={24} md={5}>
            <div className="rounded border border-slate-200 p-1">
              {sideItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`w-full cursor-pointer rounded px-3 py-2 text-left text-sm transition-colors ${(selectedGroupKey ?? '__all__') === item.key ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-50'}`}
                  onClick={() => setSelectedGroupKey(item.key === '__all__' ? null : item.key)}
                >
                  <div className="flex items-center justify-between">
                    <span>{item.label}</span>
                    {item.group && (
                      <Space size={2} onClick={(e) => e.stopPropagation()}>
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingGroup(item.group); setGroupModalOpen(true) }} />
                        <Popconfirm title="确认删除此分组？" onConfirm={() => void handleDeleteGroup(item.group.groupKey)} okText="删除" cancelText="取消">
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </Space>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </Col>

          <Col xs={24} md={19}>
            <Table
              rowKey="apiKey"
              loading={apisLoading}
              dataSource={apis}
              columns={columns}
              pagination={{ pageSize: 15, showSizeChanger: false }}
              size="small"
            />
          </Col>
        </Row>
      </div>

      <ApiEditorDrawer
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={() => void loadApis()}
        editingApi={editingApi}
        groups={groups}
        projectKey={projectKey}
        env={env}
        request={request}
      />

      <GroupModal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onSaved={() => void loadGroups()}
        editingGroup={editingGroup}
        projectKey={projectKey}
        env={env}
        request={request}
      />

      <Drawer
        title={debugApi ? `调试：${debugApi.apiKey}` : '调试'}
        open={debugOpen}
        onClose={() => setDebugOpen(false)}
        width={520}
      >
        <ApiDebugPanel api={debugApi} projectKey={projectKey} env={env} request={request} />
      </Drawer>
    </Space>
  )
}

// ─── API Key 管理面板 ──────────────────────────────────────────────────────────
function ApiKeyPanel({ projectKey, env, request }) {
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newKeyResult, setNewKeyResult] = useState(null) // 创建成功后展示原始 key

  const loadKeys = useCallback(async () => {
    setLoading(true)
    try {
      const data = await request(`/api/platform/projects/${projectKey}/envs/${env}/api-keys`)
      setKeys(Array.isArray(data.keys) ? data.keys : [])
    } catch (err) {
      message.error('加载 API Key 失败：' + err.message)
    } finally {
      setLoading(false)
    }
  }, [request, projectKey, env])

  useEffect(() => { void loadKeys() }, [loadKeys])

  const handleCreate = async () => {
    if (!newKeyName.trim()) { message.warning('请输入 Key 名称'); return }
    setCreating(true)
    try {
      const data = await request(`/api/platform/projects/${projectKey}/envs/${env}/api-keys`, {
        method: 'POST',
        body: { name: newKeyName.trim() },
      })
      setNewKeyResult(data)
      setCreateOpen(false)
      setNewKeyName('')
      void loadKeys()
    } catch (err) {
      message.error(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id) => {
    try {
      await request(`/api/platform/projects/${projectKey}/envs/${env}/api-keys/${id}/revoke`, { method: 'PUT' })
      message.success('已吊销')
      void loadKeys()
    } catch (err) {
      message.error(err.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await request(`/api/platform/projects/${projectKey}/envs/${env}/api-keys/${id}`, { method: 'DELETE' })
      message.success('已删除')
      void loadKeys()
    } catch (err) {
      message.error(err.message)
    }
  }

  const columns = [
    { title: '名称', dataIndex: 'name', ellipsis: true },
    { title: 'Key 前缀', dataIndex: 'keyPrefix', render: (v) => <Typography.Text code>{v}...</Typography.Text> },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v) => <Badge status={v === 'active' ? 'success' : 'error'} text={v === 'active' ? '有效' : '已吊销'} />,
    },
    { title: '创建人', dataIndex: 'createdBy', width: 120 },
    {
      title: '最后使用', dataIndex: 'lastUsedAt', width: 160,
      render: (v) => v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : '从未',
    },
    {
      title: '操作', width: 140,
      render: (_, row) => (
        <Space size={4}>
          {row.status === 'active' && (
            <Popconfirm title="确认吊销此 Key？吊销后无法恢复。" onConfirm={() => void handleRevoke(row.id)} okText="吊销" cancelText="取消">
              <Button size="small" icon={<StopOutlined />} danger>吊销</Button>
            </Popconfirm>
          )}
          <Popconfirm title="确认删除？" onConfirm={() => void handleDelete(row.id)} okText="删除" cancelText="取消">
            <Button size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Text type="secondary">
          API Key 用于 MCP 工具认证，绑定到当前项目环境（{projectKey} / {env}）。
        </Typography.Text>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadKeys()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建 Key</Button>
        </Space>
      </div>

      <Table rowKey="id" loading={loading} dataSource={keys} columns={columns} size="small" pagination={false} />

      {/* 新建 Key Modal */}
      <Modal
        title="新建 API Key"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
      >
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="Key 名称" required>
            <Input
              placeholder="例如：Cursor MCP - 张三"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            创建后原始 Key 只显示一次，请立即保存。
          </Typography.Text>
        </Form>
      </Modal>

      {/* 创建成功展示原始 Key */}
      <Modal
        title={<Space><KeyOutlined />API Key 创建成功</Space>}
        open={!!newKeyResult}
        onCancel={() => setNewKeyResult(null)}
        footer={<Button type="primary" onClick={() => setNewKeyResult(null)}>我已保存，关闭</Button>}
      >
        <Alert
          type="warning"
          showIcon
          message="请立即复制并保存，此 Key 不会再次显示"
          style={{ marginBottom: 16 }}
        />
        <Typography.Paragraph copyable style={{ fontFamily: 'monospace', background: '#f6f8fa', padding: 12, borderRadius: 6 }}>
          {newKeyResult?.rawKey}
        </Typography.Paragraph>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          在 MCP 配置中设置：<code>EASYDB_API_KEY={newKeyResult?.rawKey}</code>
        </Typography.Text>
      </Modal>
    </div>
  )
}

// ─── 顶层页面（Tabs） ──────────────────────────────────────────────────────────
const _ApiCenterPage = ApiCenterPage
function ApiCenterPageWithTabs() {
  const { projectKey, env } = useConsole()
  const tabItems = useMemo(() => [
    { key: 'apis', label: <Space><ApiOutlined />接口管理</Space>, children: <_ApiCenterPage /> },
    { key: 'keys', label: <Space><KeyOutlined />API Keys</Space>, children: <ApiKeyPanelWrapper /> },
  ], [])
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <Typography.Title level={4} className="page-title !mb-0"><ApiOutlined className="mr-1" />接口中心</Typography.Title>
        <Tag color="geekblue">{projectKey}</Tag>
        <Tag color="cyan">{env}</Tag>
      </div>
      <Tabs items={tabItems} />
    </Card>
  )
}

function ApiKeyPanelWrapper() {
  const { request, projectKey, env } = useConsole()
  return <ApiKeyPanel projectKey={projectKey} env={env} request={request} />
}

export default ApiCenterPageWithTabs
