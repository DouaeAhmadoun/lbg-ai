import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'
import API_URL from '@/config'
axios.defaults.baseURL = API_URL

const AppContext = createContext()

export function AppProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminToken, setAdminToken] = useState(localStorage.getItem('adminToken'))
  
  // Check admin status on mount
  useEffect(() => {
    if (adminToken) {
      setIsAdmin(true)
    }
  }, [adminToken])
  
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
      getAuthHeader
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
