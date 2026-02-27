/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { detectDefaultApiBase, requestJson, sanitizeBaseUrl } from '../lib/http'

const STORAGE_KEY = 'easydb_console_vite_state_v1'

const defaultState = {
  apiBase: detectDefaultApiBase(),
  token: '',
  user: null,
  projectKey: 'default',
  env: 'prod',
}

function restoreState() {
  if (typeof window === 'undefined') {
    return defaultState
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return defaultState

    return {
      apiBase: sanitizeBaseUrl(parsed.apiBase || defaultState.apiBase),
      token: String(parsed.token || ''),
      user: parsed.user || null,
      projectKey: String(parsed.projectKey || defaultState.projectKey).toLowerCase(),
      env: String(parsed.env || defaultState.env).toLowerCase(),
    }
  } catch {
    return defaultState
  }
}

const ConsoleContext = createContext(null)

function ConsoleProvider({ children }) {
  const [state, setState] = useState(() => restoreState())

  const persist = useCallback((nextOrUpdater) => {
    setState((previous) => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(previous) : nextOrUpdater
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      }
      return next
    })
  }, [])

  const request = useCallback(
    async (path, options = {}) => {
      const authEnabled = options.auth !== false
      try {
        return await requestJson({
          apiBase: state.apiBase,
          token: state.token,
          path,
          method: options.method,
          body: options.body,
          auth: authEnabled,
        })
      } catch (error) {
        if (authEnabled && error?.status === 401 && state.token) {
          persist((previous) => ({
            ...previous,
            token: '',
            user: null,
          }))
        }
        throw error
      }
    },
    [persist, state.apiBase, state.token],
  )

  const login = useCallback(
    async ({ username, password }) => {
      const payload = await request('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: { username, password },
      })

      if (payload.user?.role !== 'admin') {
        throw new Error('当前账号不是管理员，不能进入控制台。')
      }

      const next = {
        ...state,
        token: String(payload.token || ''),
        user: payload.user || null,
      }
      persist(next)
      return payload
    },
    [persist, request, state],
  )

  const verifyMe = useCallback(async () => {
    const payload = await request('/api/auth/me')
    const next = {
      ...state,
      user: payload.user || state.user,
    }
    persist(next)
    return payload
  }, [persist, request, state])

  const uploadAvatar = useCallback(async (dataUrl) => {
    await request('/api/auth/me/avatar', {
      method: 'PUT',
      body: { avatar: dataUrl },
    })
    persist((prev) => ({
      ...prev,
      user: prev.user ? { ...prev.user, avatar: dataUrl } : prev.user,
    }))
  }, [persist, request])

  const logout = useCallback(() => {
    const next = {
      ...state,
      token: '',
      user: null,
    }
    persist(next)
  }, [persist, state])

  const updateApiBase = useCallback(
    (apiBase) => {
      const next = {
        ...state,
        apiBase: sanitizeBaseUrl(apiBase) || detectDefaultApiBase(),
      }
      persist(next)
    },
    [persist, state],
  )

  const updateGatewayContext = useCallback(
    ({ projectKey, env }) => {
      const next = {
        ...state,
        projectKey: String(projectKey || '').trim().toLowerCase() || state.projectKey,
        env: String(env || '').trim().toLowerCase() || state.env,
      }
      persist(next)
    },
    [persist, state],
  )

  const value = useMemo(
    () => ({
      ...state,
      request,
      login,
      verifyMe,
      uploadAvatar,
      logout,
      updateApiBase,
      updateGatewayContext,
    }),
    [state, request, login, verifyMe, logout, updateApiBase, updateGatewayContext],
  )

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
}

function useConsole() {
  const context = useContext(ConsoleContext)
  if (!context) {
    throw new Error('useConsole must be used inside ConsoleProvider')
  }
  return context
}

export { ConsoleProvider, useConsole }
