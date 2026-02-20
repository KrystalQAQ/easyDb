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
        token: {
          colorPrimary: '#0f766e',
          borderRadius: 10,
          fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
      }}
    >
      <AntdApp>
        <ConsoleProvider>
          <BrowserRouter basename="/demo">
            <App />
          </BrowserRouter>
        </ConsoleProvider>
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)
