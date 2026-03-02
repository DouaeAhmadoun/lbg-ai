import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'
import axios from 'axios'
import API_URL from '@/config'
axios.defaults.baseURL = API_URL

const MARKETS = [
  { code: 'FR', label: 'France' },
  { code: 'IT', label: 'Italy' },
  { code: 'ES', label: 'Spain' },
]

export default function ExcelShipment() {
  const [sessionId] = useState(() => Math.random().toString(36).slice(2, 11))
  const [availableMarkets, setAvailableMarkets] = useState([])
  const [selectedMarket, setSelectedMarket] = useState('')
  const [suggestedMarket, setSuggestedMarket] = useState('')
  const [clientData, setClientData] = useState(null)
  const [validationReports, setValidationReports] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState(null)

  useEffect(() => {
    axios.get('/api/excel/available-markets')
      .then(res => setAvailableMarkets(res.data.markets || []))
      .catch(() => {})
  }, [])

  const uploadFile = async (file) => {
    if (!file.name.endsWith('.xlsx')) {
      setError('Please upload an Excel file (.xlsx)')
      return
    }

    setUploadedFileName(file.name)
    setLoading(true)
    setError(null)
    setClientData(null)
    setValidationReports({})
    setSelectedMarket('')
    setSuggestedMarket('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('session_id', sessionId)

    try {
      const response = await axios.post('/api/excel/upload-client-data', formData)
      const data = response.data

      setClientData(data)
      if (data.available_markets) setAvailableMarkets(data.available_markets)
      if (data.validation_reports) setValidationReports(data.validation_reports)

      // Auto-select the suggested market (or first available if none detected)
      const suggested = data.suggested_market || data.available_markets?.[0] || ''
      setSuggestedMarket(suggested)
      setSelectedMarket(suggested)
    } catch (err) {
      setError('Error uploading file: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  const handleFileInput = (e) => {
    const file = e.target.files[0]
    if (file) uploadFile(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('session_id', sessionId)
    formData.append('market', selectedMarket)

    try {
      const response = await axios.post('/api/excel/generate', formData)
      window.location.href = `${API_URL}/api/excel/download/${response.data.job_id}`
    } catch (err) {
      setError('Error generating file: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  // --- Validation report helpers ---
  const groupByIssue = (items) => {
    const groups = {}
    items.forEach(({ issue, user_id }) => {
      if (!groups[issue]) groups[issue] = []
      groups[issue].push(user_id)
    })
    return Object.entries(groups).map(([issue, userIds]) => ({ issue, userIds }))
  }

  const renderGroup = (groups, colorClass) =>
    groups.map(({ issue, userIds }, idx) => (
      <div key={idx} className={`text-xs ${colorClass}`}>
        <span className="font-medium">{issue}</span>
        {userIds.length === 1
          ? <span className="text-gray-500 ml-1">— User {userIds[0]}</span>
          : <span className="text-gray-500 ml-1">
              — {userIds.length} users ({userIds.slice(0, 6).join(', ')}{userIds.length > 6 ? `, +${userIds.length - 6} more` : ''})
            </span>
        }
      </div>
    ))

  const report = selectedMarket ? validationReports[selectedMarket] : null
  const hasBlockingErrors = report?.blocking_errors?.length > 0
  const hasWarnings = report?.warnings?.length > 0
  const hasValidations = report?.validations?.length > 0
  const hasAnyIssue = hasBlockingErrors || hasWarnings || hasValidations

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Excel Shipment Generator</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-800">{error}</p>
          <button onClick={() => setError(null)} className="mt-2 text-xs text-red-600 hover:text-red-800">Dismiss</button>
        </div>
      )}

      {/* Step 1: Upload */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">1. Upload Client Data</h2>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileInput}
            disabled={loading}
            className="hidden"
            id="file-upload"
          />
          <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
            <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm text-gray-600 mb-1">
              {isDragging ? 'Drop file here' : 'Drag & drop Excel file here'}
            </span>
            <span className="text-xs text-gray-400">or click to browse</span>
          </label>
        </div>

        {clientData && (
          <div className="mt-3 flex items-center justify-between text-sm">
            {uploadedFileName && (
              <p className="text-gray-600 flex items-center">
                <svg className="w-4 h-4 mr-1 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V6.414A2 2 0 0016.414 5L14 2.586A2 2 0 0012.586 2H9z" />
                  <path d="M3 8a2 2 0 012-2v10h8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
                <span className="font-medium">{uploadedFileName}</span>
              </p>
            )}
            <p className="text-green-600 font-medium">✓ {clientData.total_records} records loaded</p>
          </div>
        )}
      </div>

      {/* Step 2: Market selection — only shown after upload */}
      {clientData && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">2. Select Market</h2>
          <div className="flex gap-3">
            {MARKETS.map(({ code, label }) => {
              const isAvailable = availableMarkets.length === 0 || availableMarkets.includes(code)
              const isSelected = selectedMarket === code
              const isAutoDetected = code === suggestedMarket

              return (
                <button
                  key={code}
                  onClick={() => isAvailable && setSelectedMarket(code)}
                  disabled={!isAvailable}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium text-sm transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : isAvailable
                      ? 'border-gray-200 hover:border-gray-300 text-gray-700'
                      : 'border-gray-100 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  {label}
                  {isAutoDetected && (
                    <span className="block text-xs font-normal mt-0.5 text-green-600">Auto-detected</span>
                  )}
                  {!isAvailable && (
                    <span className="block text-xs font-normal mt-0.5 text-gray-400">No template</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Validation Report — updates when market changes */}
      {report && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <span className="mr-2">📋</span>
            Data Validation Report
          </h2>

          <div className="border border-gray-200 rounded overflow-hidden">
            <div className={`px-4 py-3 flex items-center justify-between ${hasBlockingErrors ? 'bg-red-50' : hasWarnings ? 'bg-orange-50' : 'bg-green-50'}`}>
              <div className="flex items-center space-x-3">
                <span className="font-semibold">{MARKETS.find(m => m.code === selectedMarket)?.label}</span>
                <div className="flex space-x-2">
                  {hasBlockingErrors && <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded font-medium">❌ {report.blocking_errors.length} blocking</span>}
                  {hasWarnings && <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded font-medium">⚠️ {report.warnings.length} warnings</span>}
                  {hasValidations && <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded font-medium">🔎 {report.validations.length} suspicious</span>}
                  {!hasAnyIssue && <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded font-medium">✅ All valid</span>}
                </div>
              </div>
              <span className={`text-sm font-semibold ${
                report.total_rows > 0 && (report.valid_rows / report.total_rows) >= 0.9 ? 'text-green-600'
                : report.total_rows > 0 && (report.valid_rows / report.total_rows) >= 0.7 ? 'text-orange-600'
                : 'text-red-600'
              }`}>
                {report.valid_rows}/{report.total_rows} valid
              </span>
            </div>

            {hasAnyIssue && (
              <div className="p-4 space-y-3">
                {hasBlockingErrors && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-3">
                    <p className="font-semibold text-red-900 text-sm mb-2">❌ Blocking Errors</p>
                    <div className="space-y-1">{renderGroup(groupByIssue(report.blocking_errors), 'text-red-800')}</div>
                  </div>
                )}
                {hasWarnings && (
                  <div className="bg-orange-50 border-l-4 border-orange-500 p-3">
                    <p className="font-semibold text-orange-900 text-sm mb-2">⚠️ Warnings</p>
                    <div className="space-y-1">{renderGroup(groupByIssue(report.warnings), 'text-orange-800')}</div>
                  </div>
                )}
                {hasValidations && (
                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3">
                    <p className="font-semibold text-yellow-900 text-sm mb-2">🔎 Suspicious Data</p>
                    <div className="space-y-1">{renderGroup(groupByIssue(report.validations), 'text-yellow-800')}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Generate Button */}
      {clientData && (
        <div className="flex justify-center">
          <button
            onClick={handleGenerate}
            disabled={!selectedMarket || loading}
            className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Download size={20} />
            <span>{loading ? 'Generating...' : 'Generate & Download'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
