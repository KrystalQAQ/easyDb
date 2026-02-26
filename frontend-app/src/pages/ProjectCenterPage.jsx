import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { CheckCircleOutlined, CopyOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons'
import { useConsole } from '../context/ConsoleContext'

function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function toCsv(value) {
  if (!Array.isArray(value)) return ''
  return value.join(',')
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseRoleTablesJson(value) {
  const text = String(value || '').trim()
  if (!text) return {}
  const parsed = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('roleTables 必须是 JSON 对象')
  }
  return parsed
}

function prettyRoleTables(value) {
  try {
    return JSON.stringify(value || {}, null, 2)
  } catch {
    return '{}'
  }
}

function pickServerName(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .find(Boolean) || ''
}

function buildDomainBase(serverName) {
  const host = pickServerName(serverName)
  if (!host) return ''

  const protocol = typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'http'
  const browserPort = typeof window !== 'undefined' ? String(window.location.port || '').trim() : ''

  let hostname = host
  if (/^https?:\/\//i.test(host)) {
    try {
      hostname = new URL(host).hostname
    } catch {
      hostname = host.replace(/^https?:\/\//i, '').split('/')[0]
    }
  }
  hostname = String(hostname).split(':')[0]
  return `${protocol}://${hostname}${browserPort ? `:${browserPort}` : ''}`
}

function ProjectCenterPage() {
  const { request, token, projectKey, env, updateGatewayContext } = useConsole()
  const fixedEnv = 'prod'

  const [projectLoading, setProjectLoading] = useState(false)
  const [projects, setProjects] = useState([])
  const [projectDomainMap, setProjectDomainMap] = useState({})
  const [deletingProject, setDeletingProject] = useState('')

  const [envSaving, setEnvSaving] = useState(false)
  const [envMeta, setEnvMeta] = useState(null)

  const [nginxLoading, setNginxLoading] = useState(false)
  const [nginxSaving, setNginxSaving] = useState(false)
  const [nginxReloading, setNginxReloading] = useState(false)
  const [nginxSource, setNginxSource] = useState('generated')
  const [nginxPath, setNginxPath] = useState('')
  const [nginxFrontendDir, setNginxFrontendDir] = useState('')
  const [nginxConfText, setNginxConfText] = useState('')
  const [currentDomainBase, setCurrentDomainBase] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState(null)
  const [wizardStep, setWizardStep] = useState(0)
  const [dbMode, setDbMode] = useState('auto')
  const [testingConn, setTestingConn] = useState(false)
  const [connTestResult, setConnTestResult] = useState(null) // null | { ok, error, latencyMs }
  const [dbForm] = Form.useForm()

  const [createForm] = Form.useForm()
  const [envForm] = Form.useForm()

  const loadProjectDomains = useCallback(
    async (projectList) => {
      if (!projectList.length) {
        setProjectDomainMap({})
        return
      }

      const pairs = await Promise.all(
        projectList.map(async (projectItem) => {
          try {
            const envPayload = await request(`/api/platform/projects/${encodeURIComponent(projectItem.projectKey)}/envs`)
            const envList = Array.isArray(envPayload.items) ? envPayload.items : []
            const targetEnv = envList.find((item) => item.env === 'prod')?.env || envList[0]?.env
            if (!targetEnv) return null
            const nginxPayload = await request(
              `/api/platform/projects/${encodeURIComponent(projectItem.projectKey)}/envs/${encodeURIComponent(targetEnv)}/nginx`,
            )
            const settings = nginxPayload.item?.settings || {}
            const domainBase = buildDomainBase(settings.serverName)
            if (!domainBase) return null
            return [
              projectItem.projectKey,
              {
                domainBase,
                env: targetEnv,
              },
            ]
          } catch {
            return null
          }
        }),
      )

      const nextMap = Object.fromEntries(pairs.filter(Boolean))
      setProjectDomainMap(nextMap)
    },
    [request],
  )

  const loadProjects = useCallback(async () => {
    setProjectLoading(true)
    try {
      const payload = await request('/api/platform/projects')
      const list = Array.isArray(payload.items) ? payload.items : []
      const visibleList = list.filter((item) => item.projectKey !== 'default')
      setProjects(visibleList)
      void loadProjectDomains(visibleList)
      return visibleList
    } catch (err) {
      message.error(err.message)
      setProjectDomainMap({})
      return []
    } finally {
      setProjectLoading(false)
    }
  }, [loadProjectDomains, request])

  const loadEnvDetail = useCallback(
    async (targetProject, targetEnv) => {
      if (!targetProject || !targetEnv) {
        setEnvMeta(null)
        envForm.resetFields()
        return
      }

      try {
        const payload = await request(
          `/api/platform/projects/${encodeURIComponent(targetProject)}/envs/${encodeURIComponent(targetEnv)}`,
        )
        const item = payload.item || {}
        setEnvMeta(item)
        envForm.setFieldsValue({
          status: item.status || 'active',
          host: item.db?.host || '',
          port: item.db?.port || 3306,
          user: item.db?.user || '',
          database: item.db?.database || '',
          password: '',
          requestEncryptionPassword: '',
          allowedSqlTypes: toCsv(item.policy?.allowedSqlTypes),
          allowedTables: toCsv(item.policy?.allowedTables),
          roleTablesJson: prettyRoleTables(item.policy?.roleTables),
          requireSelectLimit:
            item.policy?.requireSelectLimit === undefined ? true : Boolean(item.policy?.requireSelectLimit),
          maxSelectLimit: Number(item.policy?.maxSelectLimit || 500),
          publicAccess: Boolean(item.policy?.publicAccess),
        })
      } catch (err) {
        setEnvMeta(null)
        message.error(err.message)
      }
    },
    [envForm, request],
  )

  const loadNginx = useCallback(
    async (targetProject, targetEnv) => {
      if (!targetProject || !targetEnv) {
        setNginxSource('generated')
        setNginxPath('')
        setNginxFrontendDir('')
        setNginxConfText('')
        setCurrentDomainBase('')
        return
      }

      setNginxLoading(true)
      setCurrentDomainBase('')
      try {
        const payload = await request(
          `/api/platform/projects/${encodeURIComponent(targetProject)}/envs/${encodeURIComponent(targetEnv)}/nginx`,
        )
        const item = payload.item || {}
        setNginxSource(item.source || 'generated')
        setNginxPath(item.path || '')
        setNginxFrontendDir(item.settings?.frontendDir || '')
        setNginxConfText(item.configText || '')
        setCurrentDomainBase(buildDomainBase(item.settings?.serverName))
      } catch (err) {
        setCurrentDomainBase('')
        message.error(err.message)
      } finally {
        setNginxLoading(false)
      }
    },
    [request],
  )

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  useEffect(() => {
    if (!projectKey) return

    if (env !== fixedEnv) {
      updateGatewayContext({ projectKey, env: fixedEnv })
    }

    void loadEnvDetail(projectKey, fixedEnv)
    void loadNginx(projectKey, fixedEnv)
  }, [env, fixedEnv, loadEnvDetail, loadNginx, projectKey, updateGatewayContext])

  const onWizardClose = () => {
    setCreateOpen(false)
    setWizardStep(0)
    setDbMode('auto')
    setConnTestResult(null)
    createForm.resetFields()
  }

  const onTestConnection = async () => {
    const db = dbForm.getFieldsValue()
    if (!db?.host || !db?.user || !db?.database) {
      message.error('请填写 Host、User、Database 后再测试')
      return
    }
    setTestingConn(true)
    setConnTestResult(null)
    try {
      const result = await request('/api/platform/test-db-connection', {
        method: 'POST',
        body: {
          host: db.host,
          port: Number(db.port || 3306),
          user: db.user,
          password: db.password || '',
          database: db.database,
        },
      })
      setConnTestResult(result)
    } catch (err) {
      setConnTestResult({ ok: false, error: err.message })
    } finally {
      setTestingConn(false)
    }
  }

  const onCreateProject = async () => {
    try {
      const values = createForm.getFieldsValue()
      if (!values.projectKey) {
        message.error('项目标识不能为空')
        return
      }
      let manualDb = null
      if (dbMode === 'manual') {
        const db = dbForm.getFieldsValue()
        if (!connTestResult?.ok) {
          message.error('请先测试数据库连接并确保连接成功')
          return
        }
        manualDb = {
          host: db.host,
          port: Number(db.port || 3306),
          user: db.user,
          password: db.password || '',
          database: db.database,
        }
      }

      setCreating(true)
      const payload = await request('/api/platform/projects', {
        method: 'POST',
        body: {
          projectKey: values.projectKey.trim().toLowerCase(),
          name: values.name?.trim() || values.projectKey.trim().toLowerCase(),
          status: values.status,
          dbMode,
          ...(manualDb ? { db: manualDb } : {}),
        },
      })

      setCreateResult(payload.defaultEnv || null)
      const nextProject = payload.item?.projectKey || values.projectKey.trim().toLowerCase()
      updateGatewayContext({ projectKey: nextProject, env: fixedEnv })
      onWizardClose()

      await loadProjects()
      await loadEnvDetail(nextProject, fixedEnv)
      await loadNginx(nextProject, fixedEnv)

      message.success('项目已开通。')
    } catch (err) {
      if (err?.errorFields) return
      message.error(err.message)
    } finally {
      setCreating(false)
    }
  }

  const onDeleteProject = useCallback(
    (targetProject) => {
      Modal.confirm({
        title: `删除项目 ${targetProject}`,
        content: '将删除该项目的平台配置，不会自动删除 MySQL 物理数据库。',
        okText: '确认删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          setDeletingProject(targetProject)
          try {
            await request(`/api/platform/projects/${encodeURIComponent(targetProject)}`, {
              method: 'DELETE',
            })

            const nextProjects = await loadProjects()
            if (projectKey === targetProject) {
              const fallbackProject = nextProjects[0]?.projectKey || 'default'
              updateGatewayContext({ projectKey: fallbackProject, env: fixedEnv })
              await loadEnvDetail(fallbackProject, fixedEnv)
              await loadNginx(fallbackProject, fixedEnv)
            } else {
              await loadEnvDetail(projectKey, fixedEnv)
              await loadNginx(projectKey, fixedEnv)
            }

            message.success(`项目 ${targetProject} 已删除。`)
          } catch (err) {
            message.error(err.message)
          } finally {
            setDeletingProject('')
          }
        },
      })
    },
    [fixedEnv, loadEnvDetail, loadNginx, loadProjects, projectKey, request, updateGatewayContext],
  )

  const onSaveEnv = async () => {
    if (!projectKey) {
      message.error('请先选择项目。')
      return
    }

    try {
      const values = await envForm.validateFields()
      const policy = {
        allowedSqlTypes: parseCsv(values.allowedSqlTypes),
        allowedTables: parseCsv(values.allowedTables),
        roleTables: parseRoleTablesJson(values.roleTablesJson),
        requireSelectLimit: Boolean(values.requireSelectLimit),
        maxSelectLimit: Number(values.maxSelectLimit || 500),
        publicAccess: Boolean(values.publicAccess),
      }

      setEnvSaving(true)
      await request(`/api/platform/projects/${encodeURIComponent(projectKey)}/envs/${encodeURIComponent(fixedEnv)}`, {
        method: 'PUT',
        body: {
          status: values.status,
          db: {
            host: values.host,
            port: Number(values.port),
            user: values.user,
            database: values.database,
            password: values.password ? values.password : undefined,
          },
          policy,
          requestEncryptionPassword: values.requestEncryptionPassword ? values.requestEncryptionPassword : undefined,
        },
      })

      await loadEnvDetail(projectKey, fixedEnv)
      message.success('环境参数已保存。')
    } catch (err) {
      if (err?.errorFields) return
      message.error(err.message)
    } finally {
      setEnvSaving(false)
    }
  }

  const onSaveNginx = async () => {
    if (!projectKey) {
      message.error('请先选择项目。')
      return
    }
    if (!String(nginxConfText || '').trim()) {
      message.error('Nginx 配置内容不能为空。')
      return
    }

    try {
      setNginxSaving(true)
      await request(
        `/api/platform/projects/${encodeURIComponent(projectKey)}/envs/${encodeURIComponent(fixedEnv)}/nginx`,
        {
        method: 'PUT',
        body: {
          confText: nginxConfText,
        },
      },
      )
      await loadNginx(projectKey, fixedEnv)
      message.success('Nginx 配置已保存。')
    } catch (err) {
      message.error(err.message)
    } finally {
      setNginxSaving(false)
    }
  }

  const onReloadNginx = async () => {
    if (!projectKey) {
      message.error('请先选择项目。')
      return
    }

    try {
      setNginxReloading(true)
      const payload = await request(
        `/api/platform/projects/${encodeURIComponent(projectKey)}/envs/${encodeURIComponent(fixedEnv)}/nginx/reload`,
        {
          method: 'POST',
          body: {},
        },
      )

      const stdout = payload.result?.stdout || ''
      const stderr = payload.result?.stderr || ''
      if (stderr) {
        message.warning(`Nginx 已执行重载，stderr: ${stderr}`)
      } else if (stdout) {
        message.success(`Nginx 重载成功：${stdout}`)
      } else {
        message.success('Nginx 重载成功。')
      }
    } catch (err) {
      message.error(err.message)
    } finally {
      setNginxReloading(false)
    }
  }

  const projectColumns = useMemo(
    () => [
      { title: '项目标识', dataIndex: 'projectKey', width: 180 },
      { title: '名称', dataIndex: 'name', ellipsis: true },
      {
        title: '状态',
        dataIndex: 'status',
        width: 120,
        render: (value) => <Tag color={value === 'active' ? 'green' : 'red'}>{value}</Tag>,
      },
      {
        title: '访问域名',
        render: (_, row) => {
          const domainItem = projectDomainMap[row.projectKey]
          if (!domainItem?.domainBase) return '-'
          return (
            <a href={domainItem.domainBase} target="_blank" rel="noreferrer">
              {domainItem.domainBase}
            </a>
          )
        },
      },
      { title: '更新时间', dataIndex: 'updatedAt', width: 180, render: formatTime },
      {
        title: '操作',
        width: 120,
        render: (_, row) => (
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            loading={deletingProject === row.projectKey}
            onClick={() => onDeleteProject(row.projectKey)}
          >
            删除
          </Button>
        ),
      },
    ],
    [deletingProject, onDeleteProject, projectDomainMap],
  )

  const projectApiInfo = useMemo(() => {
    const base = String(currentDomainBase || '').replace(/\/+$/, '')
    if (!base) {
      return {
        domainBase: '-',
        gatewayBase: '-',
        login: '-',
        me: '-',
        sql: '-',
        health: '-',
      }
    }
    return {
      domainBase: base,
      gatewayBase: `${base}/api`,
      login: `${base}/api/auth/login`,
      me: `${base}/api/auth/me`,
      sql: `${base}/api/sql`,
      health: `${base}/api/health`,
    }
  }, [currentDomainBase])

  const copyText = useCallback(async (text, label) => {
    if (!text || text === '-') {
      message.error('当前没有可复制的地址。')
      return
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        message.success(`${label} 已复制。`)
        return
      }
    } catch {
      // ignore clipboard api failure and fallback below
    }
    try {
      const input = document.createElement('input')
      input.value = text
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      message.success(`${label} 已复制。`)
    } catch {
      message.error('复制失败，请手动复制。')
    }
  }, [])

  return (
    <Space direction="vertical" size={16} style={{ width: '100%', minHeight: '100%' }}>
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Typography.Title level={4} className="page-title">
              项目配置中心
            </Typography.Title>
            <Typography.Text type="secondary" className="page-subtitle">
              项目切换已放到右上角，本页展示当前所选项目和环境的配置。
            </Typography.Text>
          </div>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void loadProjects()} loading={projectLoading}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              创建项目
            </Button>
          </Space>
        </div>

        <Table
          className="mt-4"
          rowKey="projectKey"
          loading={projectLoading}
          columns={projectColumns}
          dataSource={projects}
          pagination={{ pageSize: 6 }}
        />
      </Card>

      {createResult ? (
        <Card>
          <Alert
            showIcon
            type="success"
            message="最近一次开通结果"
            description={`默认环境 ${createResult.env} 已创建；数据库 ${createResult.db?.database}; Nginx配置：${createResult.nginxConfPath || '未生成'}; 前端目录：${createResult.frontendDir || '未创建'}`}
          />
        </Card>
      ) : null}

      <Card>
        <Typography.Title level={5}>环境参数编辑</Typography.Title>
        {/* <Typography.Text type="secondary">
          当前编辑：{projectKey || '-'} / {fixedEnv}
        </Typography.Text> */}

        <Descriptions size="small" bordered column={2} className="mt-3">
          <Descriptions.Item label="加密请求口令">
            {envMeta?.requestEncryptionPasswordEnabled ? (
              <Tag color="green">已配置</Tag>
            ) : (
              <Tag color="default">未配置</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="SQL 类型限制">
            {(envMeta?.policy?.allowedSqlTypes || []).join(', ') || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="白名单表">
            {(envMeta?.policy?.allowedTables || []).join(', ') || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="SELECT 限制">
            {envMeta?.policy?.requireSelectLimit ? '必须 LIMIT' : '可不带 LIMIT'}
          </Descriptions.Item>
        </Descriptions>

        <Form form={envForm} layout="vertical" className="mt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Form.Item name="status" label="环境状态" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'active', value: 'active' },
                  { label: 'disabled', value: 'disabled' },
                ]}
              />
            </Form.Item>
            <Form.Item name="host" label="DB Host" rules={[{ required: true, message: '请输入 DB Host' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="port" label="DB Port" rules={[{ required: true, message: '请输入 DB Port' }]}>
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="user" label="DB User" rules={[{ required: true, message: '请输入 DB User' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="database" label="DB Name" rules={[{ required: true, message: '请输入 DB Name' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="password" label="DB Password（留空不修改）">
              <Input.Password />
            </Form.Item>
            <Form.Item name="requestEncryptionPassword" label="环境请求加密密码（留空不修改）">
              <Input.Password />
            </Form.Item>
            <Form.Item name="allowedSqlTypes" label="allowedSqlTypes（逗号分隔）">
              <Input placeholder="select,insert,update,delete" />
            </Form.Item>
            <Form.Item name="allowedTables" label="allowedTables（逗号分隔）">
              <Input placeholder="users,orders,products" />
            </Form.Item>
            <Form.Item name="maxSelectLimit" label="maxSelectLimit">
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="requireSelectLimit" valuePropName="checked" initialValue>
              <Checkbox>SELECT 必须带 LIMIT</Checkbox>
            </Form.Item>
            <Form.Item name="publicAccess" valuePropName="checked" initialValue={false}>
              <Checkbox>公开访问（无需登录，仅允许 SELECT）</Checkbox>
            </Form.Item>
          </div>

          <Form.Item name="roleTablesJson" label="roleTables（JSON）">
            <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} />
          </Form.Item>

          <Button type="primary" icon={<SaveOutlined />} loading={envSaving} onClick={onSaveEnv}>
            保存环境参数
          </Button>
        </Form>
      </Card>

      <Card>
        <Typography.Title level={5} className="!mb-1">
          前端部署
        </Typography.Title>
        <Typography.Text type="secondary">
          上传前端构建产物 .zip 压缩包，自动解压到项目环境目录（覆盖旧文件）。
        </Typography.Text>
        <div className="mt-4">
          <Upload
            accept=".zip"
            maxCount={1}
            showUploadList={false}
            customRequest={async ({ file, onSuccess, onError }) => {
              const formData = new FormData()
              formData.append('file', file)
              try {
                const res = await fetch(
                  `/api/platform/projects/${encodeURIComponent(projectKey)}/envs/${encodeURIComponent(fixedEnv)}/deploy`,
                  { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData }
                )
                const data = await res.json()
                if (!data.ok) throw new Error(data.error || '部署失败')
                message.success(`部署成功：${data.targetDir}`)
                onSuccess(data)
              } catch (err) {
                message.error(err.message)
                onError(err)
              }
            }}
          >
            <Button icon={<UploadOutlined />}>选择 zip 文件并部署</Button>
          </Upload>
        </div>
      </Card>

      <Card>
        <Typography.Title level={5} className="!mb-1">
          项目 API 信息（给前端联调）
        </Typography.Title>
        <Typography.Text type="secondary">
          以下地址按当前项目环境对应域名生成，业务前端只调用固定接口：/api/auth/login、/api/auth/me、/api/sql、/api/health。
        </Typography.Text>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Form layout="vertical">
            <Form.Item label="项目域名">
              <Input
                readOnly
                value={projectApiInfo.domainBase}
                addonAfter={
                  <Button
                    size="small"
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() => void copyText(projectApiInfo.domainBase, '项目域名')}
                  >
                    复制
                  </Button>
                }
              />
            </Form.Item>
            <Form.Item label="前端连接地址（固定 API 前缀）">
              <Input
                readOnly
                value={projectApiInfo.gatewayBase}
                addonAfter={
                  <Button
                    size="small"
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() => void copyText(projectApiInfo.gatewayBase, '网关基础地址')}
                  >
                    复制
                  </Button>
                }
              />
            </Form.Item>
            <Form.Item label="登录地址（全局）">
              <Input
                readOnly
                value={projectApiInfo.login}
                addonAfter={
                  <Button
                    size="small"
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() => void copyText(projectApiInfo.login, '登录地址')}
                  >
                    复制
                  </Button>
                }
              />
            </Form.Item>
          </Form>

          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="当前会话 me">{projectApiInfo.me}</Descriptions.Item>
            <Descriptions.Item label="SQL 执行">{projectApiInfo.sql}</Descriptions.Item>
            <Descriptions.Item label="健康检查">{projectApiInfo.health}</Descriptions.Item>
          </Descriptions>
        </div>

        <Form layout="vertical" className="mt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Tag color={nginxSource === 'file' ? 'green' : 'gold'}>
              配置来源：{nginxSource === 'file' ? '已落盘' : '默认模板'}
            </Tag>
            {nginxPath ? <Tag>文件：{nginxPath}</Tag> : null}
            {nginxFrontendDir ? <Tag color="blue">前端目录：{nginxFrontendDir}</Tag> : null}
          </div>
          <Form.Item label="Nginx 配置（可编辑，保存后可一键重载）">
            <Input.TextArea
              value={nginxConfText}
              onChange={(event) => setNginxConfText(event.target.value)}
              autoSize={{ minRows: 18, maxRows: 30 }}
              placeholder="请选择项目后加载 Nginx 配置"
            />
          </Form.Item>
          <Space wrap>
            <Button icon={<ReloadOutlined />} loading={nginxLoading} onClick={() => void loadNginx(projectKey, fixedEnv)}>
              重新加载配置
            </Button>
            <Button type="primary" icon={<SaveOutlined />} loading={nginxSaving} onClick={onSaveNginx}>
              保存 Nginx 配置
            </Button>
            <Button danger loading={nginxReloading} onClick={onReloadNginx}>
              保存后重载 Nginx
            </Button>
            <Button icon={<CopyOutlined />} onClick={() => void copyText(nginxConfText, 'Nginx 配置')}>
              复制 Nginx 配置
            </Button>
          </Space>
        </Form>
      </Card>

 
      <Modal
        title="创建项目"
        open={createOpen}
        onCancel={onWizardClose}
        footer={
          <Space>
            <Button onClick={onWizardClose}>取消</Button>
            {wizardStep === 1 && (
              <Button onClick={() => setWizardStep(0)}>上一步</Button>
            )}
            {wizardStep === 0 && (
              <Button
                type="primary"
                onClick={async () => {
                  try {
                    await createForm.validateFields(['projectKey', 'name', 'status'])
                    setWizardStep(1)
                  } catch {
                    // validation failed, stay on step 0
                  }
                }}
              >
                下一步
              </Button>
            )}
            {wizardStep === 1 && (
              <Button
                type="primary"
                loading={creating}
                disabled={dbMode === 'manual' && !connTestResult?.ok}
                onClick={onCreateProject}
              >
                立即开通
              </Button>
            )}
          </Space>
        }
        width={560}
      >
        <Steps
          current={wizardStep}
          size="small"
          className="mb-5 mt-2"
          items={[{ title: '项目信息' }, { title: '数据库配置' }]}
        />

        <div style={{ display: wizardStep === 0 ? undefined : 'none' }}>
          <Form form={createForm} layout="vertical" initialValues={{ status: 'active' }}>
            <Form.Item
              name="projectKey"
              label="项目标识"
              rules={[
                { required: true, message: '请输入项目标识' },
                { pattern: /^[a-z][a-z0-9_-]{1,31}$/, message: '仅支持小写字母、数字、_、-' },
              ]}
            >
              <Input placeholder="例如 crm" />
            </Form.Item>
            <Form.Item name="name" label="项目名称">
              <Input placeholder="例如 CRM 系统" />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select
                options={[
                  { label: 'active', value: 'active' },
                  { label: 'disabled', value: 'disabled' },
                ]}
              />
            </Form.Item>
          </Form>
        </div>

        <div style={{ display: wizardStep === 1 ? undefined : 'none' }}>
          <Radio.Group
            value={dbMode}
            onChange={(e) => {
              setDbMode(e.target.value)
              setConnTestResult(null)
            }}
            className="mb-4"
          >
            <Radio value="auto">自动创建（使用平台默认配置）</Radio>
            <Radio value="manual">手动填写数据库连接</Radio>
          </Radio.Group>

          {dbMode === 'auto' && (
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="默认环境">prod</Descriptions.Item>
              <Descriptions.Item label="建库方式">CREATE DATABASE IF NOT EXISTS</Descriptions.Item>
            </Descriptions>
          )}

          {dbMode === 'manual' && (
            <Form form={dbForm} layout="vertical" initialValues={{ port: 3306 }}>
              <div className="grid grid-cols-2 gap-x-3">
                <Form.Item name="host" label="Host" rules={[{ required: true, message: '请输入 Host' }]}>
                  <Input placeholder="127.0.0.1" onChange={() => setConnTestResult(null)} />
                </Form.Item>
                <Form.Item name="port" label="Port">
                  <InputNumber min={1} max={65535} style={{ width: '100%' }} onChange={() => setConnTestResult(null)} />
                </Form.Item>
                <Form.Item name="user" label="User" rules={[{ required: true, message: '请输入 User' }]}>
                  <Input onChange={() => setConnTestResult(null)} />
                </Form.Item>
                <Form.Item name="database" label="Database" rules={[{ required: true, message: '请输入数据库名' }]}>
                  <Input onChange={() => setConnTestResult(null)} />
                </Form.Item>
              </div>
              <Form.Item name="password" label="Password">
                <Input.Password onChange={() => setConnTestResult(null)} />
              </Form.Item>

              <div className="flex items-center gap-3">
                <Button loading={testingConn} onClick={onTestConnection}>
                  测试连接
                </Button>
                {connTestResult?.ok && (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircleOutlined />
                    连接成功（{connTestResult.latencyMs}ms）
                  </span>
                )}
                {connTestResult && !connTestResult.ok && (
                  <span className="text-red-500">连接失败：{connTestResult.error}</span>
                )}
              </div>

              {!connTestResult?.ok && (
                <Alert
                  className="mt-3"
                  type="warning"
                  showIcon
                  message="请先测试连接成功后才能创建项目"
                />
              )}
            </Form>
          )}
        </div>
      </Modal>
    </Space>
  )
}

export default ProjectCenterPage
