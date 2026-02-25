import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Space, Typography, message } from 'antd'
import { PlayCircleOutlined } from '@ant-design/icons'
import { useConsole } from '../context/ConsoleContext'

const { TextArea } = Input

function prettyJson(payload) {
  if (!payload) return ''
  return JSON.stringify(payload, null, 2)
}

function SqlWorkbenchPage() {
  const { request, projectKey, env } = useConsole()
  const [sql, setSql] = useState('select id, username from users limit 20')
  const [paramsText, setParamsText] = useState('[]')
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)

  const runSql = async () => {
    let params = []
    try {
      params = JSON.parse(paramsText || '[]')
    } catch {
      message.error('参数必须是合法 JSON。')
      return
    }

    if (!Array.isArray(params)) {
      message.error('params 必须是数组。')
      return
    }

    if (!projectKey || !env) {
      message.error('请先到“项目开通”页面选择项目和环境。')
      return
    }

    setRunning(true)
    try {
      const payload = await request(
        `/api/gw/${encodeURIComponent(projectKey)}/${encodeURIComponent(env)}/sql`,
        {
          method: 'POST',
          body: { sql, params },
        },
      )
      setResult(payload)
      message.success('SQL 执行成功。')
    } catch (err) {
      message.error(err.message)
      setResult({ ok: false, error: err.message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%', minHeight: '100%' }}>
      <Card>
        <Typography.Title level={4} className="!mb-1">
          SQL 工作台
        </Typography.Title>
        <Typography.Text type="secondary">
          当前项目环境：{projectKey}/{env}
        </Typography.Text>

        <Form layout="vertical" className="mt-4">
          <Form.Item label="SQL 语句">
            <TextArea value={sql} onChange={(event) => setSql(event.target.value)} autoSize={{ minRows: 5, maxRows: 12 }} />
          </Form.Item>
          <Form.Item label="参数（JSON 数组）">
            <TextArea
              value={paramsText}
              onChange={(event) => setParamsText(event.target.value)}
              autoSize={{ minRows: 3, maxRows: 8 }}
            />
          </Form.Item>
          <Space>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={runSql} loading={running}>
              执行 SQL
            </Button>
            <Button
              onClick={() => {
                setSql('select id, username, status from users limit 20')
                setParamsText('[]')
              }}
            >
              加载示例
            </Button>
          </Space>
        </Form>
      </Card>


      <Card>
        <Typography.Title level={5}>执行结果</Typography.Title>
        <pre className="json-viewer">{prettyJson(result)}</pre>
      </Card>
    </Space>
  )
}

export default SqlWorkbenchPage
