import { createContext, useContext, useState, useEffect, useRef } from 'react'
import axios from 'axios'
import API_URL from '@/config'
axios.defaults.baseURL = API_URL

const AppContext = createContext()

export function AppProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminToken, setAdminToken] = useState(localStorage.getItem('adminToken'))
  const [sessionExpired, setSessionExpired] = useState(false)
  const [pageGuardActive, setPageGuardActive] = useState(false)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark')
  const [backendDown, setBackendDown] = useState(false)
  const backendDownRef = useRef(false)

  useEffect(() => {
    if (adminToken) {
      setIsAdmin(true)
    }
  }, [adminToken])

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [darkMode])

  const toggleDarkMode = () => setDarkMode(d => !d)

  const login = async (password) => {
    try {
      const response = await axios.post('/api/admin/login', { password })
      const { token } = response.data
      localStorage.setItem('adminToken', token)
      setAdminToken(token)
      setIsAdmin(true)
      setSessionExpired(false)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Login failed'
      }
    }
  }

  const logout = () => {
    localStorage.removeItem('adminToken')
    setAdminToken(null)
    setIsAdmin(false)
    setSessionExpired(false)
  }

  const getAuthHeader = () => {
    return adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
  }

  // Auto-logout on 401 (expired session)
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 401 && adminToken) {
          logout()
          setSessionExpired(true)
        }
        return Promise.reject(error)
      }
    )
    return () => axios.interceptors.response.eject(interceptor)
  }, [adminToken])

  // Backend down detection (network errors = no error.response)
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => {
        if (backendDownRef.current) {
          backendDownRef.current = false
          setBackendDown(false)
        }
        return response
      },
      error => {
        if (!error.response) {
          backendDownRef.current = true
          setBackendDown(true)
        }
        return Promise.reject(error)
      }
    )
    return () => axios.interceptors.response.eject(interceptor)
  }, [])

  return (
    <AppContext.Provider value={{
      isAdmin,
      adminToken,
      sessionExpired,
      login,
      logout,
      getAuthHeader,
      pageGuardActive,
      setPageGuardActive,
      darkMode,
      toggleDarkMode,
      backendDown,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within AppProvider')
  }
  return context
}
