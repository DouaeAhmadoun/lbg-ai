import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'
import API_URL from '@/config'
axios.defaults.baseURL = API_URL

const AppContext = createContext()

export function AppProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminToken, setAdminToken] = useState(localStorage.getItem('adminToken'))
  const [pageGuardActive, setPageGuardActive] = useState(false)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark')

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
  }

  const getAuthHeader = () => {
    return adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
  }

  return (
    <AppContext.Provider value={{
      isAdmin,
      adminToken,
      login,
      logout,
      getAuthHeader,
      pageGuardActive,
      setPageGuardActive,
      darkMode,
      toggleDarkMode,
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
