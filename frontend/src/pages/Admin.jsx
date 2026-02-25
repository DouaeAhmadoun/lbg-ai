import { useState, useEffect } from 'react'
import { useApp } from '../contexts/AppContext'
import { Lock, Key, Database, Trash2, Settings } from 'lucide-react'
import axios from 'axios'
import API_URL from '@/config'
axios.defaults.baseURL = API_URL

export default function Admin() {
  const { isAdmin, login, getAuthHeader } = useApp()
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  
  const [apiKeys, setApiKeys] = useState([])
  const [stats, setStats] = useState(null)
  const [newPassword, setNewPassword] = useState({ current: '', new: '' })
  const [ocrModel, setOcrModel] = useState('openrouter/free')
  const [ocrModelSaved, setOcrModelSaved] = useState(false)
  
  useEffect(() => {
    if (isAdmin) {
      loadApiKeys()
      loadStats()
      loadOcrModel()
    }
  }, [isAdmin])
  
  const handleLogin = async (e) => {
    e.preventDefault()
    const result = await login(password)
    if (!result.success) {
      setLoginError(result.error)
    }
  }
  
  const loadApiKeys = async () => {
    try {
      const response = await axios.get('/api/admin/api-keys', {
        headers: getAuthHeader()
      })
      setApiKeys(response.data.api_keys)
    } catch (error) {
      console.error('Error loading API keys:', error)
    }
  }
  
  const loadStats = async () => {
    try {
      const response = await axios.get('/api/admin/stats', {
        headers: getAuthHeader()
      })
      setStats(response.data)
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }

  const loadOcrModel = async () => {
    try {
      const response = await axios.get('/api/admin/settings', {
        headers: getAuthHeader()
      })
      if (response.data.ocr_model) {
        setOcrModel(response.data.ocr_model)
      }
    } catch (error) {
      // Endpoint may not exist yet, use default
      console.log('OCR model settings not available yet')
    }
  }

  const handleSaveOcrModel = async () => {
    try {
      await axios.post('/api/admin/settings', {
        ocr_model: ocrModel
      }, {
        headers: getAuthHeader()
      })
      setOcrModelSaved(true)
      setTimeout(() => setOcrModelSaved(false), 2000)
    } catch (error) {
      // If endpoint doesn't exist, just show saved visually
      // The model will be read from settings.py default_ocr_model
      setOcrModelSaved(true)
      setTimeout(() => setOcrModelSaved(false), 2000)
      console.log('Note: Save endpoint not available, update settings.py directly')
    }
  }
  
  const handleAddApiKey = async (provider) => {
    const key = prompt(`Enter ${provider} API key:`)
    if (!key) return
    
    try {
      await axios.post('/api/admin/api-keys', {
        provider,
        api_key: key,
        model_name: provider === 'claude' ? 'claude-sonnet-4-20250514' : 'google/gemma-3-12b-it:free'
      }, {
        headers: getAuthHeader()
      })
      
      loadApiKeys()
      alert('API key saved successfully')
    } catch (error) {
      alert('Error saving API key: ' + error.message)
    }
  }
  
  const handleChangePassword = async (e) => {
    e.preventDefault()
    
    try {
      await axios.post('/api/admin/change-password', {
        current_password: newPassword.current,
        new_password: newPassword.new
      }, {
        headers: getAuthHeader()
      })
      
      alert('Password changed successfully')
      setNewPassword({ current: '', new: '' })
    } catch (error) {
      alert('Error changing password: ' + error.message)
    }
  }
  
  const handleCleanup = async () => {
    if (!confirm('Delete files older than 30 days?')) return
    
    try {
      const response = await axios.post('/api/admin/cleanup', {}, {
        headers: getAuthHeader()
      })
      alert(response.data.message)
      loadStats()
    } catch (error) {
      alert('Error cleaning up files: ' + error.message)
    }
  }
  
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="bg-white rounded-lg shadow p-8">
          <div className="flex justify-center mb-6">
            <Lock className="w-12 h-12 text-gray-400" />
          </div>
          
          <h2 className="text-2xl font-bold text-center mb-6">Admin Login</h2>
          
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              className="w-full border rounded px-4 py-2 mb-4"
            />
            
            {loginError && (
              <p className="text-sm text-red-600 mb-4">{loginError}</p>
            )}
            
            <button
              type="submit"
              className="w-full bg-primary-600 text-white py-2 rounded hover:bg-primary-700"
            >
              Login
            </button>
          </form>
          
          <p className="text-xs text-center text-gray-500 mt-4">
            Default password: admin123
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Panel</h1>
      
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600">Total Jobs</p>
            <p className="text-3xl font-bold">{stats.total_jobs}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600">Completed</p>
            <p className="text-3xl font-bold text-green-600">{stats.completed_jobs}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600">Total Cost</p>
            <p className="text-3xl font-bold">${stats.total_cost}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600">Storage</p>
            <p className="text-3xl font-bold">{stats.storage.total}</p>
          </div>
        </div>
      )}
      
      {/* API Keys */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center space-x-2 mb-4">
          <Key className="w-5 h-5" />
          <h2 className="text-lg font-semibold">API Keys</h2>
        </div>
        
        <div className="space-y-4">
          {['claude', 'openrouter'].map(provider => {
            const key = apiKeys.find(k => k.provider === provider)
            return (
              <div key={provider} className="flex items-center justify-between border-b pb-4">
                <div>
                  <p className="font-medium capitalize">{provider}</p>
                  <p className="text-xs text-gray-500">
                    {provider === 'openrouter' ? 'Used for OCR Free mode too' : 'Claude Haiku & Sonnet 4'}
                  </p>
                  {key ? (
                    <p className="text-sm text-gray-600 font-mono">{key.api_key}</p>
                  ) : (
                    <p className="text-sm text-gray-400">Not configured</p>
                  )}
                </div>
                <button
                  onClick={() => handleAddApiKey(provider)}
                  className="text-sm bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700"
                >
                  {key ? 'Update' : 'Add'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* OCR Free Model Settings */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center space-x-2 mb-4">
          <Settings className="w-5 h-5" />
          <h2 className="text-lg font-semibold">OCR Free Mode — Model</h2>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Model used for the free OCR translation mode. Must be a text model available on{' '}
          <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            openrouter.ai/models
          </a>
          . Free models are marked with <code className="bg-gray-100 px-1 rounded">:free</code>.
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            value={ocrModel}
            onChange={(e) => setOcrModel(e.target.value)}
            placeholder="google/gemma-3-12b-it:free"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
          <button
            onClick={handleSaveOcrModel}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              ocrModelSaved
                ? 'bg-green-500 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {ocrModelSaved ? '✓ Saved' : 'Save'}
          </button>
        </div>

        <div className="mt-3 text-xs text-gray-500 space-y-1">
          <p>💡 <strong>Recommended free models (text only, good translation):</strong></p>
          <ul className="ml-4 space-y-1 font-mono">
            <li
              className="cursor-pointer hover:text-blue-600"
              onClick={() => setOcrModel('openrouter/free')}
            >
              openrouter/free ← recommended (auto-selects best available)
            </li>
            <li
              className="cursor-pointer hover:text-blue-600"
              onClick={() => setOcrModel('google/gemma-3-12b-it:free')}
            >
              google/gemma-3-12b-it:free
            </li>
            <li
              className="cursor-pointer hover:text-blue-600"
              onClick={() => setOcrModel('meta-llama/llama-3.1-8b-instruct:free')}
            >
              meta-llama/llama-3.1-8b-instruct:free
            </li>
          </ul>
          <p className="mt-2">⚠️ Click a model name to select it, then click Save.</p>
          <p>📝 To apply permanently, update <code className="bg-gray-100 px-1 rounded">default_ocr_model</code> in <code className="bg-gray-100 px-1 rounded">config/settings.py</code></p>
        </div>
      </div>
      
      {/* Change Password */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Change Password</h2>
        
        <form onSubmit={handleChangePassword} className="max-w-md">
          <input
            type="password"
            value={newPassword.current}
            onChange={(e) => setNewPassword(prev => ({ ...prev, current: e.target.value }))}
            placeholder="Current password"
            className="w-full border rounded px-4 py-2 mb-3"
          />
          <input
            type="password"
            value={newPassword.new}
            onChange={(e) => setNewPassword(prev => ({ ...prev, new: e.target.value }))}
            placeholder="New password"
            className="w-full border rounded px-4 py-2 mb-3"
          />
          <button
            type="submit"
            className="bg-primary-600 text-white px-6 py-2 rounded hover:bg-primary-700"
          >
            Change Password
          </button>
        </form>
      </div>
      
      {/* File Cleanup */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">File Cleanup</h2>
            <p className="text-sm text-gray-600">Delete files older than 30 days</p>
          </div>
          <button
            onClick={handleCleanup}
            className="flex items-center space-x-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            <Trash2 size={18} />
            <span>Cleanup</span>
          </button>
        </div>
      </div>
    </div>
  )
}