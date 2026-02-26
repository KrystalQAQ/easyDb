import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Layout, Menu, Select, Space, Tag, Typography, message } from 'antd'
import {
  ApiOutlined,
  AuditOutlined,
  DatabaseOutlined,
  LogoutOutlined,
  ReloadOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useConsole } from '../context/ConsoleContext'

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
  const { token, user, request, projectKey, env, logout, updateGatewayContext } = useConsole()
  const fixedEnv = 'prod'
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
      const payload = await request('/api/platform/projects')
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

  return (
    <Layout className="bg-grid" style={{ minHeight: '100dvh', height: '100dvh' }}>
      <Sider width={220} className="!bg-slate-900/95">
        <div className="border-b border-slate-700/70 px-5 py-5">
          <Typography.Title level={4} className="!mb-0 !text-white">
            EasyDB
          </Typography.Title>
          <Typography.Text className="!text-slate-300">网关管理员台</Typography.Text>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedMenu]}
          onClick={({ key }) => navigate(key)}
          items={menuItems}
          style={{ borderInlineEnd: 'none', marginTop: 8 }}
        />
      </Sider>

      <Layout style={{ minHeight: '100%', height: '100%' }}>
        <Header className="!h-auto !bg-white/70 !px-6 !py-3 backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color="geekblue">管理员：{user?.username || '-'}</Tag>
              <Tag color="cyan">角色：{user?.role || '-'}</Tag>
            </div>

            <Space wrap>
              <Select
                placeholder="选择项目"
                value={projectKey || undefined}
                options={projectOptions}
                style={{ width: 240 }}
                loading={projectLoading}
                onChange={onSwitchProject}
              />
              <Button icon={<ReloadOutlined />} loading={projectLoading} onClick={() => void loadProjects()}>
                刷新
              </Button>
              <Button danger icon={<LogoutOutlined />} onClick={logout}>
                退出
              </Button>
            </Space>
          </div>
        </Header>

        <Content className="flex flex-1 min-h-0 flex-col p-6">
          <div className="flex-1 min-h-0 overflow-auto">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default ConsoleLayout
