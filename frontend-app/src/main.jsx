import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import './index.css'
import App from './App'
import { ConsoleProvider } from './context/ConsoleContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        hashed: false,
        token: {
          colorPrimary: '#1e40af',
          colorInfo: '#3b82f6',
          colorSuccess: '#22c55e',
          colorBgLayout: '#eff6ff',
          colorText: '#0f172a',
          borderRadius: 10,
          fontFamily: '"Plus Jakarta Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
        components: {
          Layout: {
            siderBg: '#ffffff',
            triggerBg: '#ffffff',
          },
          Menu: {
            itemBg: '#ffffff',
            itemColor: '#334155',
            itemSelectedBg: '#dbeafe',
            itemSelectedColor: '#1e3a8a',
            itemHoverColor: '#1d4ed8',
            itemHeight: 38,
          },
          Card: {
            colorBorderSecondary: '#dbeafe',
          },
        },
      }}
    >
      <AntdApp>
        <ConsoleProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ConsoleProvider>
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)
