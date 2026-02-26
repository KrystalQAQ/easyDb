import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  Layout,
  Menu,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  ApiOutlined,
  AuditOutlined,
  DatabaseOutlined,
  LogoutOutlined,
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
  const {
    token,
    user,
    apiBase,
    projectKey,
    env,
    logout,
    verifyMe,
    updateApiBase,
  } = useConsole()

  const [settingOpen, setSettingOpen] = useState(false)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [form] = Form.useForm()

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

  const onVerify = async () => {
    setVerifyLoading(true)
    try {
      const payload = await verifyMe()
      message.success(`身份校验成功：${payload.user?.username || '-'} / ${payload.user?.role || '-'}`)
    } catch (err) {
      message.error(err.message)
    } finally {
      setVerifyLoading(false)
    }
  }

  const openSettings = () => {
    form.setFieldsValue({ apiBase })
    setSettingOpen(true)
  }

  const submitSettings = async () => {
    try {
      const values = await form.validateFields()
      updateApiBase(values.apiBase)
      setSettingOpen(false)
      message.success('API 地址已更新。')
    } catch {
      // handled by antd form
    }
  }

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
              <Tag color="green">当前项目：{projectKey || '-'}</Tag>
              <Tag color="lime">当前环境：{env || '-'}</Tag>
            </div>

            <Space wrap>
              {/* <Button onClick={onVerify} loading={verifyLoading}>
                校验登录
              </Button> */}
              {/* <Button onClick={openSettings}>API 设置</Button> */}
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

      <Drawer
        title="网关 API 设置"
        open={settingOpen}
        width={420}
        onClose={() => setSettingOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setSettingOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitSettings}>
              保存
            </Button>
          </Space>
        }
      >
        <Form layout="vertical" form={form} initialValues={{ apiBase }}>
          <Form.Item
            label="API 基础地址"
            name="apiBase"
            rules={[{ required: true, message: '请输入 API 地址' }]}
          >
            <Input placeholder="http://localhost:3000" />
          </Form.Item>
          <Typography.Paragraph type="secondary" className="!mb-0">
            若你通过后端托管访问本页面，通常保持默认即可。
          </Typography.Paragraph>
        </Form>
      </Drawer>
    </Layout>
  )
}

export default ConsoleLayout
