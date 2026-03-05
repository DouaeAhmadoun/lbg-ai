import { useState, useEffect } from 'react'
import { Download, FileText, Table, ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import axios from 'axios'
import API_URL from '@/config'
import { useApp } from '@/contexts/AppContext'
axios.defaults.baseURL = API_URL

function Tooltip({ text, direction = 'up' }) {
  return (
    <span className="relative group inline-flex items-center ml-1 cursor-help">
      <span className="w-3.5 h-3.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 text-[10px] flex items-center justify-center font-bold">?</span>
      <span className={`absolute left-1/2 -translate-x-1/2 w-60 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg text-center leading-snug ${direction === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}>
        {text}
      </span>
    </span>
  )
}

const PAGE_SIZE = 10

export default function History() {
  useEffect(() => { document.title = 'Historique — LBG AI' }, [])

  const { isAdmin, login, sessionExpired } = useApp()
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    const result = await login(password)
    if (!result.success) setLoginError(result.error)
    else setLoginError(null)
  }

  const [pptJobs, setPptJobs] = useState([])
  const [excelJobs, setExcelJobs] = useState([])
  const [activeTab, setActiveTab] = useState('ppt')
  const [pptPage, setPptPage] = useState(0)
  const [excelPage, setExcelPage] = useState(0)

  useEffect(() => {
    if (isAdmin) loadHistory()
  }, [isAdmin])

  const loadHistory = async () => {
    try {
      const [pptResponse, excelResponse] = await Promise.all([
        axios.get('/api/ppt/history'),
        axios.get('/api/excel/history')
      ])
      setPptJobs(pptResponse.data.jobs)
      setExcelJobs(excelResponse.data.jobs)
    } catch (error) {
      console.error('Error loading history:', error)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const handleDownload = (jobId, type) => {
    window.location.href = `${API_URL}/api/${type}/download/${jobId}`
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    // Reset page on tab switch
    if (tab === 'ppt') setPptPage(0)
    else setExcelPage(0)
  }

  const jobs = activeTab === 'ppt' ? pptJobs : excelJobs
  const page = activeTab === 'ppt' ? pptPage : excelPage
  const setPage = activeTab === 'ppt' ? setPptPage : setExcelPage
  const totalPages = Math.ceil(jobs.length / PAGE_SIZE)
  const pageJobs = jobs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
          <div className="flex justify-center mb-6">
            <Lock className="w-12 h-12 text-gray-400 dark:text-gray-500" />
          </div>
          <h2 className="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-gray-100">Login to view history</h2>
          {sessionExpired && (
            <div className="mb-4 px-4 py-3 rounded bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-sm text-center">
              Session expired — please log in again.
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
            {loginError && <p className="text-sm text-red-600 mb-4">{loginError}</p>}
            <button type="submit" className="w-full bg-primary-600 text-white py-2 rounded hover:bg-primary-700">
              Login
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 flex items-center space-x-4">
        <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-xl">H</span>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Job History</h1>
          <p className="text-gray-600 dark:text-gray-300">All past PPT and Excel jobs</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 mb-6">
        <button
          onClick={() => handleTabChange('ppt')}
          className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium ${
            activeTab === 'ppt'
              ? 'bg-primary-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          <FileText size={20} />
          <span>PPT Translations</span>
          {pptJobs.length > 0 && (
            <span className="ml-1 text-xs opacity-70">({pptJobs.length})</span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('excel')}
          className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium ${
            activeTab === 'excel'
              ? 'bg-primary-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          <Table size={20} />
          <span>Excel Shipments</span>
          {excelJobs.length > 0 && (
            <span className="ml-1 text-xs opacity-70">({excelJobs.length})</span>
          )}
        </button>
      </div>

      {/* Job List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">File</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status <Tooltip direction="down" text="'completed' = file ready to download. 'failed' = an error occurred during processing. 'processing' = job still running." /></th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Provider <Tooltip direction="down" text="'claude' = Claude Haiku or Sonnet. 'openrouter' = OCR Free mode. Empty for Excel jobs (no AI provider used)." /></th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {pageJobs.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  No jobs yet
                </td>
              </tr>
            ) : (
              pageJobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 text-sm text-gray-800 dark:text-gray-200 max-w-xs truncate">
                    {job.input_filename}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      job.status === 'completed'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : job.status === 'failed'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {job.provider || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {formatDate(job.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    {job.status === 'completed' && (
                      <button
                        onClick={() => handleDownload(job.id, activeTab)}
                        className="flex items-center space-x-1 text-primary-600 hover:text-primary-700 dark:text-primary-400"
                      >
                        <Download size={16} />
                        <span className="text-sm">Download</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} /> Précédent
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Page {page + 1} / {totalPages}
              <span className="ml-2 text-gray-400 dark:text-gray-500">({jobs.length} jobs)</span>
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Suivant <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
