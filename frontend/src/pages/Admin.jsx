import { useState, useEffect, useRef } from 'react'
import { useApp } from '../contexts/AppContext'
import { Lock, Key, Trash2, Settings, Upload, FileSpreadsheet } from 'lucide-react'
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

  // Templates state
  const [templates, setTemplates] = useState({})
  const [templateMarket, setTemplateMarket] = useState('')
  const [templateFile, setTemplateFile] = useState(null)
  const [templateUploading, setTemplateUploading] = useState(false)
  const [templateMessage, setTemplateMessage] = useState(null)
  const templateInputRef = useRef(null)
  const [ocrModel, setOcrModel] = useState('openrouter/free')
  const [ocrModelSaved, setOcrModelSaved] = useState(false)
  const [modelTestResult, setModelTestResult] = useState(null) // { valid, message }
  const [modelTesting, setModelTesting] = useState(false)
  
  useEffect(() => {
    if (isAdmin) {
      loadApiKeys()
      loadStats()
      loadOcrModel()
      loadTemplates()
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
      await axios.post('/api/admin/settings', { ocr_model: ocrModel }, { headers: getAuthHeader() })
      setOcrModelSaved(true)
      setModelTestResult(null)
      setTimeout(() => setOcrModelSaved(false), 2000)
    } catch (error) {
      alert('Error saving: ' + (error.response?.data?.detail || error.message))
    }
  }

  const handleTestModel = async () => {
    setModelTesting(true)
    setModelTestResult(null)
    try {
      const res = await axios.post('/api/admin/test-model', { model: ocrModel }, { headers: getAuthHeader() })
      setModelTestResult(res.data)
    } catch (error) {
      setModelTestResult({ valid: false, message: error.response?.data?.detail || error.message })
    } finally {
      setModelTesting(false)
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
  
  const loadTemplates = async () => {
    try {
      const res = await axios.get('/api/admin/excel/templates', { headers: getAuthHeader() })
      setTemplates(res.data.templates || {})
    } catch (error) {
      console.error('Error loading templates:', error)
    }
  }

  const handleTemplateUpload = async () => {
    if (!templateFile || !templateMarket.trim()) return
    setTemplateUploading(true)
    setTemplateMessage(null)
    try {
      const formData = new FormData()
      formData.append('market', templateMarket.trim().toUpperCase())
      formData.append('file', templateFile)
      await axios.post('/api/admin/excel/templates/upload', formData, {
        headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
      })
      setTemplateMessage({ type: 'success', text: `Template uploaded for market ${templateMarket.toUpperCase()}` })
      setTemplateFile(null)
      setTemplateMarket('')
      if (templateInputRef.current) templateInputRef.current.value = ''
      loadTemplates()
    } catch (error) {
      setTemplateMessage({ type: 'error', text: error.response?.data?.detail || 'Upload failed' })
    } finally {
      setTemplateUploading(false)
    }
  }

  const handleDeleteTemplate = async (market, timestamp) => {
    if (!confirm(`Delete template Shipment_${market}_${timestamp}.xlsx?`)) return
    try {
      await axios.delete(`/api/admin/excel/templates/${market}/${timestamp}`, { headers: getAuthHeader() })
      loadTemplates()
    } catch (error) {
      alert(error.response?.data?.detail || 'Delete failed')
    }
  }

  const handleSetActive = async (market, timestamp) => {
    try {
      await axios.post(`/api/admin/excel/templates/${market}/set-active`, {}, {
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        params: { timestamp }
      })
      loadTemplates()
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to set active')
    }
  }

  const handleCleanup = async () => {
    if (!confirm('Delete files older than 30 days?')) return

    try {
      const response = await axios.post('/api/admin/cleanup', {}, { headers: getAuthHeader() })
      alert(response.data.message)
      loadStats()
    } catch (error) {
      alert('Error cleaning up files: ' + (error.response?.data?.detail || error.message))
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
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 flex items-center space-x-4">
        <div className="w-12 h-12 bg-gradient-to-br from-slate-600 to-slate-800 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-xl">AP</span>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-gray-600">System configuration and monitoring</p>
        </div>
      </div>
      
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
            onChange={(e) => { setOcrModel(e.target.value); setModelTestResult(null) }}
            placeholder="google/gemma-3-12b-it:free"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
          <button
            onClick={handleTestModel}
            disabled={modelTesting || !ocrModel.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {modelTesting ? 'Testing…' : 'Test'}
          </button>
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

        {modelTestResult && (
          <p className={`mt-2 text-sm ${modelTestResult.valid ? 'text-green-700' : 'text-red-600'}`}>
            {modelTestResult.valid ? '✓ ' : '✗ '}{modelTestResult.message}
          </p>
        )}

        <div className="mt-3 text-xs text-gray-500 space-y-1">
          <p>💡 <strong>Recommended free models (text only, good translation):</strong></p>
          <ul className="ml-4 space-y-1 font-mono">
            <li
              className="cursor-pointer hover:text-blue-600"
              onClick={() => { setOcrModel('openrouter/free'); setModelTestResult(null) }}
            >
              openrouter/free ← recommended (auto-selects best available)
            </li>
            <li
              className="cursor-pointer hover:text-blue-600"
              onClick={() => { setOcrModel('google/gemma-3-12b-it:free'); setModelTestResult(null) }}
            >
              google/gemma-3-12b-it:free
            </li>
            <li
              className="cursor-pointer hover:text-blue-600"
              onClick={() => { setOcrModel('meta-llama/llama-3.1-8b-instruct:free'); setModelTestResult(null) }}
            >
              meta-llama/llama-3.1-8b-instruct:free
            </li>
          </ul>
          <p className="mt-2">⚠️ Click a model name to select it, test it, then Save.</p>
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
      
      {/* Excel Templates */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center space-x-2 mb-5">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold">Excel Templates</h2>
        </div>

        {/* Upload form */}
        <div className="border border-dashed border-gray-300 rounded-lg p-4 mb-5">
          <p className="text-sm font-medium text-gray-700 mb-3">Upload a new template</p>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Market code</label>
              <input
                type="text"
                value={templateMarket}
                onChange={e => setTemplateMarket(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="ES"
                maxLength={2}
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono uppercase focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-gray-500 mb-1">Template file (.xlsx)</label>
              <input
                ref={templateInputRef}
                type="file"
                accept=".xlsx"
                onChange={e => setTemplateFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
              />
            </div>
            <button
              onClick={handleTemplateUpload}
              disabled={templateUploading || !templateFile || templateMarket.length !== 2}
              className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Upload size={15} />
              <span>{templateUploading ? 'Uploading…' : 'Upload'}</span>
            </button>
          </div>
          {templateMessage && (
            <p className={`mt-2 text-sm ${templateMessage.type === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>
              {templateMessage.type === 'success' ? '✓ ' : '✗ '}{templateMessage.text}
            </p>
          )}
        </div>

        {/* Templates list */}
        {Object.keys(templates).length === 0 ? (
          <p className="text-sm text-gray-400">No templates found.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(templates).sort(([a], [b]) => a.localeCompare(b)).map(([market, versions]) => (
              <div key={market}>
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  {market} <span className="text-gray-400 font-normal">({versions.length} version{versions.length > 1 ? 's' : ''})</span>
                </p>
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                  {versions.map((tpl, idx) => (
                    <div key={tpl.timestamp} className={`flex items-center justify-between px-4 py-2.5 ${idx === 0 ? 'bg-emerald-50' : 'bg-white'}`}>
                      <div className="flex items-center space-x-3">
                        {idx === 0 && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                        )}
                        <span className="text-sm font-mono text-gray-600">{tpl.filename}</span>
                        <span className="text-xs text-gray-400">{tpl.size}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {idx !== 0 && (
                          <button
                            onClick={() => handleSetActive(market, tpl.timestamp)}
                            className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50"
                          >
                            Set active
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteTemplate(market, tpl.timestamp)}
                          disabled={versions.length <= 1}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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