import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Layout, Menu, Modal, Select, Tag, Tooltip, Typography, message } from 'antd'
import {
  ApiOutlined,
  AuditOutlined,
  DatabaseOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useConsole } from '../context/ConsoleContext'
import AvatarUploader from '../components/AvatarUploader'
import { buildApiUrl, buildAppUrl } from '../lib/http'

const { Header, Sider, Content } = Layout

const menuItems = [
  { key: '/app/projects', icon: <SettingOutlined />, label: '项目开通' },
  { key: '/app/sql', icon: <DatabaseOutlined />, label: 'SQL 工作台' },
  { key: '/app/apis', icon: <ApiOutlined />, label: '接口管理' },
  { key: '/app/users', icon: <TeamOutlined />, label: '平台用户' },
  { key: '/app/audit', icon: <AuditOutlined />, label: '审计日志' },
]

function ConsoleLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { token, user, request, projectKey, env, logout, updateGatewayContext, verifyMe, uploadAvatar } = useConsole()
  const fixedEnv = 'prod'
  const [collapsed, setCollapsed] = useState(false)
  const [projectLoading, setProjectLoading] = useState(false)
  const [projects, setProjects] = useState([])

  const selectedMenu = useMemo(() => {
    if (location.pathname.startsWith('/app/sql')) return '/app/sql'
    if (location.pathname.startsWith('/app/apis')) return '/app/apis'
    if (location.pathname.startsWith('/app/users')) return '/app/users'
    if (location.pathname.startsWith('/app/audit')) return '/app/audit'
    return '/app/projects'
  }, [location.pathname])

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  const loadProjects = useCallback(async () => {
    setProjectLoading(true)
    try {
      const payload = await request('/api/v2/projects')
      const list = Array.isArray(payload.items) ? payload.items : []
      const visibleList = list.filter((item) => item.projectKey !== 'default')
      setProjects(visibleList)
      return visibleList
    } catch (err) {
      message.error(err.message)
      return []
    } finally {
      setProjectLoading(false)
    }
  }, [request])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  useEffect(() => {
    if (token) void verifyMe().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (env !== fixedEnv) {
      updateGatewayContext({ projectKey, env: fixedEnv })
    }
  }, [env, fixedEnv, projectKey, updateGatewayContext])

  useEffect(() => {
    if (!projects.length) return
    const exists = projects.some((item) => item.projectKey === projectKey)
    if (!exists) {
      updateGatewayContext({ projectKey: projects[0].projectKey, env: fixedEnv })
    }
  }, [fixedEnv, projectKey, projects, updateGatewayContext])

  const projectOptions = useMemo(
    () => projects.map((item) => ({ label: `${item.projectKey} (${item.name})`, value: item.projectKey })),
    [projects],
  )

  const onSwitchProject = useCallback(
    (nextProject) => {
      updateGatewayContext({ projectKey: nextProject, env: fixedEnv })
    },
    [fixedEnv, updateGatewayContext],
  )

  const currentMeta = useMemo(() => {
    const map = {
      '/app/projects': { title: '项目配置中心', desc: '开通项目、管理环境参数与部署配置' },
      '/app/sql': { title: 'SQL 工作台', desc: '面向当前项目环境执行 SQL 与调试参数' },
      '/app/apis': { title: '接口管理中心', desc: '管理 API 分组、接口模板与认证密钥' },
      '/app/users': { title: '平台用户管理', desc: '维护网关账号、角色权限与密码重置' },
      '/app/audit': { title: '审计日志中心', desc: '检索操作轨迹、错误状态和请求上下文' },
    }
    return map[selectedMenu] || map['/app/projects']
  }, [selectedMenu])

  const onSystemReset = useCallback(() => {
    Modal.confirm({
      title: '确认系统重置',
      content: '该操作会删除当前 bootstrap 数据库配置并回到初始化向导，确认继续？',
      okText: '确认重置',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const response = await fetch(buildApiUrl('/api/system/bootstrap/reset'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: 'RESET' }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || '系统重置失败')
        }
        message.success(payload.message || '系统已重置')
        logout()
        setTimeout(() => {
          window.location.href = buildAppUrl('/setup')
        }, 350)
      },
    })
  }, [logout])

  return (
    <Layout className="console-shell console-v2 bg-grid" style={{ minHeight: '100dvh', height: '100dvh' }}>
      <Sider width={232} collapsedWidth={76} collapsed={collapsed} className="!bg-white">
        <div className="border-b border-blue-100 px-4 py-4">
          {!collapsed ? (
            <>
              <Typography.Title level={5} className="!mb-0 !text-slate-900">
                EasyDB Console
              </Typography.Title>
              <Typography.Text className="!text-xs !text-slate-500">统一数据网关控制台</Typography.Text>
            </>
          ) : (
            <Typography.Text strong>EDB</Typography.Text>
          )}
        </div>

        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[selectedMenu]}
          onClick={({ key }) => navigate(key)}
          items={menuItems}
          style={{ borderInlineEnd: 'none', marginTop: 8 }}
        />
      </Sider>

      <Layout style={{ minHeight: 0 }}>
        <Header className="console-topbar !h-auto !bg-white !px-5 !py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                type="text"
                aria-label="切换导航栏"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed((value) => !value)}
              />
              <Tag color="blue">环境：{fixedEnv}</Tag>
            </div>

            <div className="flex items-center gap-2">
              <Select
                placeholder="选择项目"
                value={projectKey || undefined}
                options={projectOptions}
                style={{ width: 220 }}
                loading={projectLoading}
                onChange={onSwitchProject}
              />
              <Button icon={<ReloadOutlined />} loading={projectLoading} onClick={() => void loadProjects()}>
                同步项目
              </Button>
              <Tooltip title={`${user?.username || '-'} · ${user?.role || '-'}`} placement="bottom">
                <div style={{ cursor: 'default' }}>
                  <AvatarUploader
                    current={user?.avatar || null}
                    username={user?.username || '?'}
                    size={34}
                    onSave={uploadAvatar}
                  />
                </div>
              </Tooltip>
              <span className="text-sm text-slate-600 font-medium">{user?.username || '-'}</span>
              <Button danger onClick={onSystemReset}>
                系统重置
              </Button>
              <Button danger icon={<LogoutOutlined />} onClick={logout}>
                退出
              </Button>
            </div>
          </div>
        </Header>

        <div className="console-page-head">
          <Typography.Title level={4} className="!mb-1 !text-slate-900">
            {currentMeta.title}
          </Typography.Title>
          <Typography.Text className="!text-slate-600">{currentMeta.desc}</Typography.Text>
        </div>

        <Content className="console-main flex flex-1 min-h-0 flex-col px-4 pb-4">
          <div className="console-main-panel flex-1 min-h-0 overflow-auto">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default ConsoleLayout
