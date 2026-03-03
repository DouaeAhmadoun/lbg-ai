import { useState, useEffect } from 'react'
import { Download, FileText, Table } from 'lucide-react'
import axios from 'axios'
import API_URL from '@/config'
axios.defaults.baseURL = API_URL

export default function History() {
  const [pptJobs, setPptJobs] = useState([])
  const [excelJobs, setExcelJobs] = useState([])
  const [activeTab, setActiveTab] = useState('ppt')

  useEffect(() => {
    loadHistory()
  }, [])

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
    return new Date(dateString).toLocaleString()
  }

  const handleDownload = (jobId, type) => {
    window.location.href = `/api/${type}/download/${jobId}`
  }

  const jobs = activeTab === 'ppt' ? pptJobs : excelJobs

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
          onClick={() => setActiveTab('ppt')}
          className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium ${
            activeTab === 'ppt'
              ? 'bg-primary-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          <FileText size={20} />
          <span>PPT Translations</span>
        </button>

        <button
          onClick={() => setActiveTab('excel')}
          className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium ${
            activeTab === 'excel'
              ? 'bg-primary-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          <Table size={20} />
          <span>Excel Shipments</span>
        </button>
      </div>

      {/* Job List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                File
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Provider
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {jobs.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  No jobs yet
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 text-sm">
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
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
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
      </div>
    </div>
  )
}
