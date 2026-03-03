import { useState, useEffect, useRef } from 'react'
import { useApp } from '../contexts/AppContext'
import { Lock, Key, Trash2, Settings, Upload, FileSpreadsheet, TrendingUp, Wallet, Eye, EyeOff } from 'lucide-react'
import axios from 'axios'
import API_URL from '@/config'
axios.defaults.baseURL = API_URL

const MARKETS = [
  { code: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: 'FR', flag: '🇫🇷', name: 'France' },
]

function Tooltip({ text }) {
  return (
    <span className="relative inline-flex group ml-1 align-middle">
      <span className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 text-xs flex items-center justify-center cursor-help font-semibold leading-none select-none">?</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 bg-gray-800 dark:bg-gray-700 text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg text-left normal-case font-normal whitespace-normal">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800 dark:border-t-gray-700" />
      </span>
    </span>
  )
}

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast) return null
  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-3 max-w-sm ${
      toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
    }`}>
      <span className="flex-1">{toast.type === 'success' ? '✓' : '✗'} {toast.message}</span>
      <button onClick={onDismiss} className="opacity-70 hover:opacity-100 text-lg leading-none">✕</button>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-pulse">
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-3" />
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16" />
    </div>
  )
}

export default function Admin() {
  useEffect(() => { document.title = 'Admin Panel — LBG AI' }, [])

  const { isAdmin, login, adminToken, getAuthHeader, sessionExpired } = useApp()
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const [apiKeys, setApiKeys] = useState([])
  const [stats, setStats] = useState(null)
  const [loadingAdmin, setLoadingAdmin] = useState(true)
  const [newPassword, setNewPassword] = useState({ current: '', new: '' })
  const [passwordMessage, setPasswordMessage] = useState(null)

  // Toast
  const [toast, setToast] = useState(null)

  // API key modal
  const [apiKeyModal, setApiKeyModal] = useState(null) // {provider, value}
  const [apiKeySaving, setApiKeySaving] = useState(false)

  // Revealed API keys
  const [revealedKeys, setRevealedKeys] = useState(new Set())

  // Templates state
  const [templates, setTemplates] = useState({})
  const [templateMarket, setTemplateMarket] = useState('')
  const [templateFile, setTemplateFile] = useState(null)
  const [templateUploading, setTemplateUploading] = useState(false)
  const [templateMessage, setTemplateMessage] = useState(null)
  const templateInputRef = useRef(null)

  // Set-active confirm
  const [confirmSetActive, setConfirmSetActive] = useState(null) // {market, timestamp}

  // Delete template confirm
  const [deletingTemplate, setDeletingTemplate] = useState(null) // {market, timestamp}

  const [ocrModel, setOcrModel] = useState('openrouter/free')
  const [ocrModelSaved, setOcrModelSaved] = useState(false)
  const [modelTestResult, setModelTestResult] = useState(null)
  const [modelTesting, setModelTesting] = useState(false)

  const [usage, setUsage] = useState([])
  const [monthlyBudget, setMonthlyBudget] = useState('')
  const [budgetSaving, setBudgetSaving] = useState(false)
  const [budgetSaved, setBudgetSaved] = useState(false)
  const [autoCleanup, setAutoCleanup] = useState(false)
  const [balance, setBalance] = useState(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [resetInput, setResetInput] = useState('')
  const [resetting, setResetting] = useState(false)

  // Cleanup inline confirm
  const [cleanupConfirm, setCleanupConfirm] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)

  useEffect(() => {
    if (isAdmin) {
      Promise.all([loadApiKeys(), loadStats(), loadOcrModel(), loadTemplates(), loadUsage(), loadBalance()])
        .finally(() => setLoadingAdmin(false))
    }
  }, [isAdmin])

  const handleLogin = async (e) => {
    e.preventDefault()
    const result = await login(password)
    if (!result.success) setLoginError(result.error)
  }

  const loadApiKeys = async () => {
    try {
      const response = await axios.get('/api/admin/api-keys', { headers: getAuthHeader() })
      setApiKeys(response.data.api_keys)
    } catch (error) { console.error('Error loading API keys:', error) }
  }

  const loadStats = async () => {
    try {
      const response = await axios.get('/api/admin/stats', { headers: getAuthHeader() })
      setStats(response.data)
    } catch (error) { console.error('Error loading stats:', error) }
  }

  const loadOcrModel = async () => {
    try {
      const response = await axios.get('/api/admin/settings', { headers: getAuthHeader() })
      if (response.data.ocr_model) setOcrModel(response.data.ocr_model)
      if (response.data.monthly_budget != null) setMonthlyBudget(String(response.data.monthly_budget))
      if (response.data.auto_cleanup_enabled != null) setAutoCleanup(response.data.auto_cleanup_enabled)
    } catch (error) { console.log('OCR model settings not available yet') }
  }

  const handleSaveOcrModel = async () => {
    try {
      await axios.post('/api/admin/settings', { ocr_model: ocrModel }, { headers: getAuthHeader() })
      setOcrModelSaved(true)
      setModelTestResult(null)
      setTimeout(() => setOcrModelSaved(false), 2000)
    } catch (error) {
      setToast({ type: 'error', message: error.response?.data?.detail || error.message })
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
    } finally { setModelTesting(false) }
  }

  const handleSaveApiKey = async () => {
    if (!apiKeyModal?.value?.trim()) return
    setApiKeySaving(true)
    try {
      await axios.post('/api/admin/api-keys', {
        provider: apiKeyModal.provider,
        api_key: apiKeyModal.value.trim(),
        model_name: apiKeyModal.provider === 'claude' ? 'claude-sonnet-4-20250514' : 'google/gemma-3-12b-it:free'
      }, { headers: getAuthHeader() })
      setApiKeyModal(null)
      loadApiKeys()
      setToast({ type: 'success', message: `${apiKeyModal.provider} API key saved.` })
    } catch (error) {
      setToast({ type: 'error', message: error.response?.data?.detail || error.message })
    } finally { setApiKeySaving(false) }
  }

  const toggleRevealKey = (provider) => {
    setRevealedKeys(prev => {
      const next = new Set(prev)
      if (next.has(provider)) next.delete(provider)
      else next.add(provider)
      return next
    })
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordMessage(null)
    try {
      await axios.post('/api/admin/change-password', {
        current_password: newPassword.current,
        new_password: newPassword.new
      }, { headers: getAuthHeader() })
      setPasswordMessage({ type: 'success', text: 'Password changed successfully' })
      setNewPassword({ current: '', new: '' })
    } catch (error) {
      setPasswordMessage({ type: 'error', text: error.response?.data?.detail || error.message })
    }
  }

  const loadTemplates = async () => {
    try {
      const res = await axios.get('/api/admin/excel/templates', { headers: getAuthHeader() })
      setTemplates(res.data.templates || {})
    } catch (error) { console.error('Error loading templates:', error) }
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
    } finally { setTemplateUploading(false) }
  }

  const handleDeleteTemplate = async (market, timestamp) => {
    if (!deletingTemplate || deletingTemplate.market !== market || deletingTemplate.timestamp !== timestamp) {
      setDeletingTemplate({ market, timestamp })
      return
    }
    try {
      await axios.delete(`/api/admin/excel/templates/${market}/${timestamp}`, { headers: getAuthHeader() })
      setDeletingTemplate(null)
      loadTemplates()
      setToast({ type: 'success', message: 'Template deleted.' })
    } catch (error) {
      setToast({ type: 'error', message: error.response?.data?.detail || 'Delete failed' })
    }
  }

  const handleSetActive = async (market, timestamp) => {
    if (!confirmSetActive || confirmSetActive.market !== market || confirmSetActive.timestamp !== timestamp) {
      setConfirmSetActive({ market, timestamp })
      return
    }
    try {
      await axios.post(`/api/admin/excel/templates/${market}/set-active`, {}, {
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        params: { timestamp }
      })
      setConfirmSetActive(null)
      loadTemplates()
      setToast({ type: 'success', message: `Template ${market} set as active.` })
    } catch (error) {
      setToast({ type: 'error', message: error.response?.data?.detail || 'Failed to set active' })
    }
  }

  const handleCleanup = async () => {
    if (!cleanupConfirm) { setCleanupConfirm(true); return }
    setCleaningUp(true)
    setCleanupConfirm(false)
    try {
      const response = await axios.post('/api/admin/cleanup', {}, { headers: getAuthHeader() })
      setToast({ type: 'success', message: response.data.message })
      loadStats()
    } catch (error) {
      setToast({ type: 'error', message: error.response?.data?.detail || error.message })
    } finally { setCleaningUp(false) }
  }

  const loadUsage = async () => {
    try {
      const res = await axios.get('/api/admin/usage', { headers: getAuthHeader() })
      setUsage(res.data.days || [])
    } catch (e) { console.error(e) }
  }

  const loadBalance = async () => {
    setBalanceLoading(true)
    try {
      const res = await axios.get('/api/admin/balance', { headers: getAuthHeader() })
      setBalance(res.data)
    } catch (e) { console.error(e) }
    finally { setBalanceLoading(false) }
  }

  const handleSaveBudget = async () => {
    setBudgetSaving(true)
    try {
      await axios.post('/api/admin/settings', { monthly_budget: parseFloat(monthlyBudget) || null }, { headers: getAuthHeader() })
      setBudgetSaved(true)
      setTimeout(() => setBudgetSaved(false), 2000)
      loadStats()
    } catch (e) {
      setToast({ type: 'error', message: e.response?.data?.detail || e.message })
    } finally { setBudgetSaving(false) }
  }

  const handleReset = async () => {
    setResetting(true)
    try {
      const res = await axios.delete('/api/admin/reset-history', { headers: getAuthHeader() })
      setToast({ type: 'success', message: res.data.message })
      setResetConfirm(false)
      setResetInput('')
      loadStats()
      loadUsage()
    } catch (e) {
      setToast({ type: 'error', message: e.response?.data?.detail || e.message })
    } finally { setResetting(false) }
  }

  const handleToggleAutoCleanup = async (val) => {
    setAutoCleanup(val)
    try {
      await axios.post('/api/admin/settings', { auto_cleanup_enabled: val }, { headers: getAuthHeader() })
    } catch (e) { console.error(e) }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
          <div className="flex justify-center mb-6">
            <Lock className="w-12 h-12 text-gray-400 dark:text-gray-500" />
          </div>

          <h2 className="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-gray-100">Admin Login</h2>

          {sessionExpired && (
            <div className="mb-4 px-4 py-3 rounded bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-sm text-center">
              Session expirée — veuillez vous reconnecter.
            </div>
          )}

          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              className="w-full border border-gray-300 dark:border-gray-600 rounded px-4 py-2 mb-4 dark:bg-gray-700 dark:text-gray-100"
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
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* API Key Modal */}
      {apiKeyModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 capitalize">
              {apiKeyModal.provider} API Key
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {apiKeyModal.provider === 'claude'
                ? 'Obtenez votre clé sur console.anthropic.com'
                : 'Obtenez votre clé sur openrouter.ai'}
            </p>
            <input
              type="password"
              autoFocus
              value={apiKeyModal.value}
              onChange={e => setApiKeyModal(m => ({ ...m, value: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
              placeholder="sk-••••••••••••••••"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 mb-4 font-mono text-sm dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setApiKeyModal(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveApiKey}
                disabled={!apiKeyModal.value?.trim() || apiKeySaving}
                className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {apiKeySaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 flex items-center space-x-4">
        <div className="w-12 h-12 bg-gradient-to-br from-slate-600 to-slate-800 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-xl">AP</span>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Admin Panel</h1>
          <p className="text-gray-600 dark:text-gray-300">System configuration and monitoring</p>
        </div>
      </div>

      {/* Stats */}
      {loadingAdmin ? (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[0,1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : stats && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 dark:text-gray-300">Total Jobs</p>
            <p className="text-3xl font-bold dark:text-gray-100">{stats.total_jobs}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 dark:text-gray-300">Completed</p>
            <p className="text-3xl font-bold text-green-600">{stats.completed_jobs}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 dark:text-gray-300">All-time cost <Tooltip text="Cumulative Claude and OpenRouter costs for PPT translation jobs. Excel jobs are free (no API used)." /></p>
            <p className="text-3xl font-bold dark:text-gray-100">${stats.total_cost}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">PPT API usage only</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 dark:text-gray-300">Storage <Tooltip text="Total size of uploaded and generated files still present on the server." /></p>
            <p className="text-3xl font-bold dark:text-gray-100">{stats.storage.total}</p>
          </div>
        </div>
      )}

      {/* Usage & Budget */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Usage & Budget</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Monthly budget $ <Tooltip text="Monthly alert threshold. A warning is shown when 80% is reached. No automatic blocking." /></span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={monthlyBudget}
              onChange={e => setMonthlyBudget(e.target.value)}
              placeholder="e.g. 20"
              className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
            />
            <button
              onClick={handleSaveBudget}
              disabled={budgetSaving}
              className={`px-3 py-1 text-sm rounded-lg transition-colors disabled:opacity-50 ${
                budgetSaved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {budgetSaving ? '…' : budgetSaved ? '✓ Saved' : 'Set'}
            </button>
          </div>
        </div>

        {stats && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-600 dark:text-gray-400">This month</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                ${stats.month_cost?.toFixed(4) || '0.0000'}
                {stats.monthly_budget ? ` / $${stats.monthly_budget.toFixed(2)}` : ''}
              </span>
            </div>
            {stats.monthly_budget ? (
              (() => {
                const pct = Math.min(100, (stats.month_cost / stats.monthly_budget) * 100)
                const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                return (
                  <>
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                    {pct >= 80 && (
                      <p className={`mt-1 text-xs ${pct >= 90 ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                        {pct >= 90 ? `⚠️ Budget almost exhausted (${pct.toFixed(0)}%)` : `⚡ ${pct.toFixed(0)}% of monthly budget used`}
                      </p>
                    )}
                  </>
                )
              })()
            ) : (
              <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div className="h-full rounded-full bg-blue-400" style={{ width: '100%' }} />
              </div>
            )}
          </div>
        )}

        {usage.length > 0 && (() => {
          const maxJobs = Math.max(...usage.map(d => d.jobs), 1)
          const last14 = usage.slice(-14)
          return (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Jobs per day (last 14 days)</p>
              <div className="flex items-end gap-1 h-16">
                {last14.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                    <div
                      className="w-full rounded-t bg-blue-400 dark:bg-blue-500 hover:bg-blue-500 dark:hover:bg-blue-400 transition-all"
                      style={{ height: `${Math.max(4, (d.jobs / maxJobs) * 56)}px` }}
                    />
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                      {d.date.slice(5)}: {d.jobs} job{d.jobs !== 1 ? 's' : ''}, ${d.cost.toFixed(4)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                <span>{last14[0]?.date.slice(5)}</span>
                <span>{last14[last14.length - 1]?.date.slice(5)}</span>
              </div>
            </div>
          )
        })()}
      </div>

      {/* API Balance */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Wallet className="w-5 h-5 text-violet-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">API Balance</h2>
          </div>
          <button
            onClick={loadBalance}
            disabled={balanceLoading}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
          >
            {balanceLoading ? 'Checking…' : 'Refresh'}
          </button>
        </div>

        {!balance ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Chargement des balances…</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">OpenRouter</p>
                {balance.openrouter?.configured ? (
                  balance.openrouter.error ? (
                    <p className="text-xs text-red-500">{balance.openrouter.error}</p>
                  ) : balance.openrouter.is_free_tier ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">Free tier — no credit limit</p>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Used ${balance.openrouter.usage?.toFixed(4)} / ${balance.openrouter.limit?.toFixed(2)}
                    </p>
                  )
                ) : (
                  <p className="text-xs text-gray-400">Not configured</p>
                )}
              </div>
              {balance.openrouter?.configured && !balance.openrouter.error && !balance.openrouter.is_free_tier && (
                <span className={`text-sm font-semibold ${(balance.openrouter.remaining || 0) < 1 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                  ${balance.openrouter.remaining?.toFixed(2)} left
                </span>
              )}
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Claude (Anthropic)</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">No public balance API available</p>
              </div>
              <a
                href={balance.claude?.console_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                View billing →
              </a>
            </div>
          </div>
        )}
      </div>

      {/* API Keys */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div className="flex items-center space-x-2 mb-4">
          <Key className="w-5 h-5" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">API Keys</h2>
        </div>

        {loadingAdmin ? (
          <div className="space-y-4">
            {[0,1].map(i => (
              <div key={i} className="animate-pulse flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-4">
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-48" />
                </div>
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {['claude', 'openrouter'].map(provider => {
              const key = apiKeys.find(k => k.provider === provider)
              const isRevealed = revealedKeys.has(provider)
              const displayKey = key
                ? (isRevealed ? key.api_key : `••••••••${key.api_key.slice(-6)}`)
                : null
              return (
                <div key={provider} className="flex items-center justify-between border-b border-gray-200 dark:border-gray-600 pb-4">
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="font-medium capitalize text-gray-900 dark:text-gray-100">{provider}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {provider === 'openrouter'
                        ? <span>Used for OCR Free mode <Tooltip text="OpenRouter API key required for OCR Free mode. Get a key at openrouter.ai — a free account is enough." /></span>
                        : <span>Claude Haiku & Sonnet 4 <Tooltip text="Anthropic API key required for Haiku and Sonnet translation modes. Get a key at console.anthropic.com." /></span>
                      }
                    </p>
                    {key ? (
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm text-gray-600 dark:text-gray-300 font-mono truncate">{displayKey}</p>
                        <button
                          onClick={() => toggleRevealKey(provider)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                          title={isRevealed ? 'Hide key' : 'Show key'}
                        >
                          {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Not configured</p>
                    )}
                  </div>
                  <button
                    onClick={() => setApiKeyModal({ provider, value: '' })}
                    className="text-sm bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700 flex-shrink-0"
                  >
                    {key ? 'Update' : 'Add'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* OCR Free Model Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div className="flex items-center space-x-2 mb-4">
          <Settings className="w-5 h-5 text-orange-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">OpenRouter Model Selection for OCR Free Mode</h2>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Model used for the free OCR translation mode. Must be a text model available on{' '}
          <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
            openrouter.ai/models
          </a>
          . Free models are marked with <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">:free</code>.
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            value={ocrModel}
            onChange={(e) => { setOcrModel(e.target.value); setModelTestResult(null) }}
            placeholder="google/gemma-3-12b-it:free"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm dark:bg-gray-700 dark:text-gray-100"
          />
          <button
            onClick={handleTestModel}
            disabled={modelTesting || !ocrModel.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {modelTesting ? 'Testing…' : 'Test'}
          </button>
          <button
            onClick={handleSaveOcrModel}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              ocrModelSaved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {ocrModelSaved ? '✓ Saved' : 'Save'}
          </button>
        </div>

        {modelTestResult && (
          <p className={`mt-2 text-sm ${modelTestResult.valid ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {modelTestResult.valid ? '✓ ' : '✗ '}{modelTestResult.message}
          </p>
        )}

        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p>💡 <strong>Recommended free models (text only, good translation):</strong></p>
          <ul className="ml-4 space-y-1 font-mono">
            {[
              'openrouter/free',
              'google/gemma-3-12b-it:free',
              'meta-llama/llama-3.1-8b-instruct:free',
            ].map(m => (
              <li key={m} className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                onClick={() => { setOcrModel(m); setModelTestResult(null) }}>
                {m}{m === 'openrouter/free' ? ' ← recommended' : ''}
              </li>
            ))}
          </ul>
          <p className="mt-2">⚠️ Click a model name to select it, test it, then Save.</p>
        </div>
      </div>

      {/* Excel Templates */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div className="flex items-center space-x-2 mb-5">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Excel Templates</h2>
        </div>

        {/* Upload zone */}
        <div className="rounded-xl border-2 border-dashed border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 p-5 mb-6">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Upload a new template</p>
          <div className="flex gap-4 items-start flex-wrap">
            {/* Market dropdown */}
            <div className="flex-shrink-0">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Market <Tooltip text="Select the corresponding market. The template will be used for shipment files for that country." />
              </label>
              <select
                value={templateMarket}
                onChange={e => setTemplateMarket(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 bg-white"
              >
                <option value="">Choisir…</option>
                {MARKETS.map(m => (
                  <option key={m.code} value={m.code}>{m.flag} {m.code} — {m.name}</option>
                ))}
              </select>
            </div>

            {/* File drop zone */}
            <div className="flex-1 min-w-56">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Template file (.xlsx)</label>
              <label className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                templateFile
                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600'
                  : 'border-gray-300 dark:border-gray-600 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 dark:hover:border-emerald-700 bg-white dark:bg-gray-700'
              }`}>
                <FileSpreadsheet size={18} className={templateFile ? 'text-emerald-600' : 'text-gray-400 dark:text-gray-500'} />
                <span className={`text-sm truncate ${templateFile ? 'text-emerald-700 dark:text-emerald-300 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                  {templateFile ? templateFile.name : 'Click to select or drag & drop'}
                </span>
                {templateFile && (
                  <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                    {(templateFile.size / 1024).toFixed(0)} KB
                  </span>
                )}
                <input
                  ref={templateInputRef}
                  type="file"
                  accept=".xlsx"
                  onChange={e => setTemplateFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>

            {/* Upload button */}
            <div className="flex-shrink-0 pt-5">
              <button
                onClick={handleTemplateUpload}
                disabled={templateUploading || !templateFile || !templateMarket}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Upload size={15} />
                {templateUploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>

          {templateMessage && (
            <p className={`mt-3 text-sm flex items-center gap-1.5 ${templateMessage.type === 'success' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {templateMessage.type === 'success' ? '✓' : '✗'} {templateMessage.text}
            </p>
          )}
        </div>

        {/* Templates list */}
        {Object.keys(templates).length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No templates uploaded yet.</p>
        ) : (
          <div className="space-y-5">
            {Object.entries(templates).sort(([a], [b]) => a.localeCompare(b)).map(([market, versions]) => {
              const marketInfo = MARKETS.find(m => m.code === market)
              return (
                <div key={market}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{marketInfo?.flag || '🌍'}</span>
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Market {market}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                      {versions.length} version{versions.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    {versions.map((tpl, idx) => {
                      const uploadedAt = tpl.timestamp
                        ? new Date(
                            tpl.timestamp.replace(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3T$4:$5:$6')
                          ).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'
                      const isPendingDelete = deletingTemplate?.market === market && deletingTemplate?.timestamp === tpl.timestamp
                      const isPendingSetActive = confirmSetActive?.market === market && confirmSetActive?.timestamp === tpl.timestamp
                      return (
                        <div key={tpl.timestamp} className={`flex items-center gap-4 px-4 py-3 ${idx === 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-white dark:bg-gray-800'}`}>
                          {idx === 0 ? (
                            <span className="flex-shrink-0 text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full font-medium">Active</span>
                          ) : (
                            <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">v{versions.length - idx}</span>
                          )}

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-mono text-gray-700 dark:text-gray-200 truncate">{tpl.filename}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{uploadedAt} · {tpl.size}</p>
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            <a
                              href={`${API_URL}/api/admin/excel/templates/${market}/${tpl.timestamp}/download?token=${adminToken}`}
                              className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              title="Download"
                            >
                              ↓
                            </a>
                            {idx !== 0 && (
                              isPendingSetActive ? (
                                <>
                                  <button
                                    onClick={() => handleSetActive(market, tpl.timestamp)}
                                    className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded transition-colors"
                                  >
                                    ✓ Confirmer
                                  </button>
                                  <button
                                    onClick={() => setConfirmSetActive(null)}
                                    className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                  >
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleSetActive(market, tpl.timestamp)}
                                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                  Set active
                                </button>
                              )
                            )}
                            {isPendingDelete ? (
                              <>
                                <button
                                  onClick={() => handleDeleteTemplate(market, tpl.timestamp)}
                                  className="text-xs text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded transition-colors"
                                >
                                  ✓ Supprimer
                                </button>
                                <button
                                  onClick={() => setDeletingTemplate(null)}
                                  className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleDeleteTemplate(market, tpl.timestamp)}
                                disabled={versions.length <= 1}
                                className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div className="flex items-center space-x-2 mb-5">
          <Lock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Change Password</h2>
        </div>

        <form onSubmit={handleChangePassword} className="max-w-md space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current password</label>
            <input
              type="password"
              value={newPassword.current}
              onChange={(e) => { setNewPassword(prev => ({ ...prev, current: e.target.value })); setPasswordMessage(null) }}
              placeholder="••••••••"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">New password</label>
            <input
              type="password"
              value={newPassword.new}
              onChange={(e) => { setNewPassword(prev => ({ ...prev, new: e.target.value })); setPasswordMessage(null) }}
              placeholder="••••••••"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
            />
          </div>

          {passwordMessage && (
            <p className={`text-sm ${passwordMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {passwordMessage.type === 'success' ? '✓ ' : '✗ '}{passwordMessage.text}
            </p>
          )}

          <button
            type="submit"
            disabled={!newPassword.current || !newPassword.new}
            className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Update password
          </button>
        </form>
      </div>

      {/* File Cleanup */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              File Cleanup
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Delete uploaded and output files older than 30 days
            </p>
          </div>
          <div className="flex items-center gap-2">
            {cleanupConfirm ? (
              <>
                <button
                  onClick={handleCleanup}
                  disabled={cleaningUp}
                  className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {cleaningUp ? 'Running…' : '✓ Confirmer'}
                </button>
                <button
                  onClick={() => setCleanupConfirm(false)}
                  className="px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Annuler
                </button>
              </>
            ) : (
              <button
                onClick={handleCleanup}
                className="flex items-center space-x-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
              >
                <Trash2 size={18} />
                <span>Run now</span>
              </button>
            )}
          </div>
        </div>
        <label className="flex items-center space-x-2 mt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoCleanup}
            onChange={e => handleToggleAutoCleanup(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">Enable automatic daily cleanup <Tooltip text="Automatically deletes uploaded and generated files older than 30 days every night." /></span>
        </label>
      </div>

      {/* Danger Zone */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow border border-red-200 dark:border-red-900 p-6">
        <div className="flex items-center space-x-2 mb-1">
          <Trash2 className="w-5 h-5 text-red-600" />
          <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">Danger Zone</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Reset all job history, costs, and uploaded/output files. API keys and settings are preserved.
        </p>

        {!resetConfirm ? (
          <button
            onClick={() => setResetConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
          >
            <Trash2 size={15} />
            Reset all history &amp; files…
          </button>
        ) : (
          <div className="space-y-3 max-w-sm">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              Type <span className="font-mono bg-red-100 dark:bg-red-900/30 px-1 rounded">RESET</span> to confirm:
            </p>
            <input
              type="text"
              value={resetInput}
              onChange={e => setResetInput(e.target.value)}
              placeholder="RESET"
              className="w-full border border-red-300 dark:border-red-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
            />
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                disabled={resetInput !== 'RESET' || resetting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 size={14} />
                {resetting ? 'Resetting…' : 'Confirm reset'}
              </button>
              <button
                onClick={() => { setResetConfirm(false); setResetInput('') }}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
