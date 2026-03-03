import { useState, useEffect } from 'react'
import { Download, ChevronDown, ChevronUp, AlertTriangle, X } from 'lucide-react'
import axios from 'axios'
import API_URL from '@/config'
import { useApp } from '@/contexts/AppContext'
axios.defaults.baseURL = API_URL

const MARKETS = [
  { code: 'FR', label: 'France', flag: '🇫🇷' },
  { code: 'IT', label: 'Italy',  flag: '🇮🇹' },
  { code: 'ES', label: 'Spain',  flag: '🇪🇸' },
]

// --- Step indicator ---
function StepIndicator({ step }) {
  const steps = ['Upload Data', 'Select Market', 'Generate']
  return (
    <div className="flex items-center mb-8">
      {steps.map((label, i) => {
        const num = i + 1
        const done = step > num
        const active = step === num
        return (
          <div key={num} className="flex items-center">
            <div className="flex items-center space-x-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>
                {done ? '✓' : num}
              </div>
              <span className={`text-sm font-medium ${active ? 'text-blue-700' : done ? 'text-green-700' : 'text-gray-400 dark:text-gray-500'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-4 h-0.5 w-12 ${step > num ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// --- Confirmation modal ---
function ConfirmModal({ onConfirm, onCancel, errorCount }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Blocking errors detected</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
          There are <span className="font-semibold text-red-700 dark:text-red-400">{errorCount} blocking error(s)</span> in your data.
          Are you sure you want to include rows with incomplete data in your final document? We recommend completing the missing fields and re-uploading.
        </p>
        <div className="flex space-x-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancel & fix data
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium">
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Validation report helpers ---
const groupByIssue = (items) => {
  const groups = {}
  items.forEach(({ issue, row }) => {
    if (!groups[issue]) groups[issue] = []
    groups[issue].push(row)
  })
  return Object.entries(groups).map(([issue, rows]) => ({ issue, rows }))
}

const renderGroup = (groups, colorClass) =>
  groups.map(({ issue, rows }, idx) => (
    <div key={idx} className={`text-xs ${colorClass}`}>
      <span className="font-medium">{issue}</span>
      {rows.length === 1
        ? <span className="text-gray-500 dark:text-gray-400 ml-1">— Row {rows[0]}</span>
        : <span className="text-gray-500 dark:text-gray-400 ml-1">
            — {rows.length} rows ({rows.slice(0, 6).join(', ')}{rows.length > 6 ? `, +${rows.length - 6} more` : ''})
          </span>
      }
    </div>
  ))


function Tooltip({ text }) {
  return (
    <span className="relative group inline-flex items-center ml-1 cursor-help">
      <span className="w-3.5 h-3.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 text-[10px] flex items-center justify-center font-bold">?</span>
      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-60 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg text-center leading-snug">
        {text}
      </span>
    </span>
  )
}

let _suppressBeforeUnload = false

export default function ExcelShipment() {
  const [sessionId] = useState(() => Math.random().toString(36).slice(2, 11))
  const [availableMarkets, setAvailableMarkets] = useState([])
  const [selectedMarket, setSelectedMarket] = useState('')
  const [suggestedMarket, setSuggestedMarket] = useState('')
  const [clientData, setClientData] = useState(null)
  const [validationReports, setValidationReports] = useState({})
  const [marketCounts, setMarketCounts] = useState({})
  const [dataPreview, setDataPreview] = useState(null)
  const [columnMapping, setColumnMapping] = useState({})
  const [loading, setLoading] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const STEPS = ['Lecture du fichier…', 'Analyse des données…', 'Application du template…', 'Génération du fichier…']
  const [error, setError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showMapping, setShowMapping] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [generationSuccess, setGenerationSuccess] = useState(null) // { filename, market }

  const hasData = clientData !== null
  const { setPageGuardActive } = useApp()

  useEffect(() => { document.title = 'Excel Shipment — LBG AI' }, [])

  // Cycle step messages while generating
  useEffect(() => {
    if (!loading) { setStepIdx(0); return }
    const t = setInterval(() => setStepIdx(i => Math.min(i + 1, STEPS.length - 1)), 1800)
    return () => clearInterval(t)
  }, [loading])

  // Register navigation guard when data is loaded
  useEffect(() => {
    setPageGuardActive(hasData)
    return () => setPageGuardActive(false)
  }, [hasData, setPageGuardActive])

  // Block browser refresh/close when data is loaded
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasData && !_suppressBeforeUnload) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasData])

  const clearAll = () => {
    setClientData(null)
    setUploadedFileName(null)
    setSelectedMarket('')
    setSuggestedMarket('')
    setValidationReports({})
    setMarketCounts({})
    setDataPreview(null)
    setColumnMapping({})
    setGenerationSuccess(null)
    setError(null)
    setShowPreview(false)
    setShowMapping(false)
  }

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
    setMarketCounts({})
    setDataPreview(null)
    setColumnMapping({})
    setSelectedMarket('')
    setSuggestedMarket('')
    setGenerationSuccess(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('session_id', sessionId)

    try {
      const response = await axios.post('/api/excel/upload-client-data', formData)
      const data = response.data

      setClientData(data)
      if (data.available_markets) setAvailableMarkets(data.available_markets)
      if (data.validation_reports) setValidationReports(data.validation_reports)
      if (data.market_counts) setMarketCounts(data.market_counts)
      if (data.data_preview) setDataPreview(data.data_preview)
      if (data.column_mapping) setColumnMapping(data.column_mapping)

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

  const handleGenerateClick = () => {
    if (hasBlockingErrors) {
      setShowConfirm(true)
    } else {
      doGenerate()
    }
  }

  const doGenerate = async () => {
    setShowConfirm(false)
    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('session_id', sessionId)
    formData.append('market', selectedMarket)

    try {
      const response = await axios.post('/api/excel/generate', formData)
      const marketLabel = MARKETS.find(m => m.code === selectedMarket)?.label || selectedMarket
      setGenerationSuccess({ jobId: response.data.job_id, market: marketLabel })
      _suppressBeforeUnload = true
      const a = document.createElement('a')
      a.href = `${API_URL}/api/excel/download/${response.data.job_id}`
      a.download = ''
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => { _suppressBeforeUnload = false }, 500)
    } catch (err) {
      setError('Error generating file: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  // Derived state
  const report = selectedMarket ? validationReports[selectedMarket] : null
  const hasBlockingErrors = report?.blocking_errors?.length > 0
  const hasWarnings = report?.warnings?.length > 0
  const hasValidations = report?.validations?.length > 0
  const hasAnyIssue = hasBlockingErrors || hasWarnings || hasValidations
  const currentMapping = selectedMarket ? columnMapping[selectedMarket] : null
  const currentStep = !clientData ? 1 : generationSuccess ? 3 : 2

  return (
    <>
      <div className="max-w-5xl mx-auto pb-28">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">ES</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Excel Shipment Generator</h1>
              <p className="text-gray-600 dark:text-gray-300">Generate market-ready shipment files from your client data</p>
            </div>
          </div>
          {hasData && (
            <button
              onClick={clearAll}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
            >
              <X size={14} />
              <span>Clear</span>
            </button>
          )}
        </div>

        <StepIndicator step={currentStep} />

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-6 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
              <button onClick={() => setError(null)} className="mt-1 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300">Dismiss</button>
            </div>
          </div>
        )}

        {/* Success banner */}
        {generationSuccess && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4 mb-6 flex items-center space-x-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-sm font-semibold text-green-800 dark:text-green-400">
                {generationSuccess.market} shipment file generated successfully!
              </p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                Your download should start automatically.{' '}
                <a
                  href={`${API_URL}/api/excel/download/${generationSuccess.jobId}`}
                  className="underline font-medium"
                >
                  Click here if it didn't start.
                </a>
              </p>
            </div>
          </div>
        )}

        {/* Step 1: Upload */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">1. Upload Client Data</h2>
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
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
              <svg className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                {isDragging ? 'Drop file here' : 'Drag & drop Excel file here'}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">or click to browse (.xlsx)</span>
            </label>
          </div>

          {clientData && (
            <div className="mt-3 flex items-center justify-between text-sm">
              {uploadedFileName && (
                <p className="text-gray-600 dark:text-gray-300 flex items-center">
                  <svg className="w-4 h-4 mr-1 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V6.414A2 2 0 0016.414 5L14 2.586A2 2 0 0012.586 2H9z" />
                    <path d="M3 8a2 2 0 012-2v10h8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                  </svg>
                  <span className="font-medium">{uploadedFileName}</span>
                </p>
              )}
              <p className="text-green-600 dark:text-green-400 font-medium">✓ {clientData.total_records} records loaded</p>
            </div>
          )}
        </div>

        {/* Data preview (collapsible) */}
        {dataPreview && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 overflow-hidden">
            <button
              onClick={() => setShowPreview(v => !v)}
              className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Data Preview</span>
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                  first {dataPreview.rows.length} rows of {clientData?.total_records}
                </span>
              </div>
              {showPreview ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
            </button>
            {showPreview && (
              <div className="overflow-x-auto border-t border-gray-100 dark:border-gray-700">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      {dataPreview.columns.map(col => (
                        <th key={col} className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 font-semibold whitespace-nowrap border-r border-gray-100 dark:border-gray-700 last:border-0">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataPreview.rows.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}>
                        {dataPreview.columns.map(col => (
                          <td key={col} className="px-3 py-2 text-gray-700 dark:text-gray-200 border-r border-gray-100 dark:border-gray-700 last:border-0 max-w-[160px] truncate">
                            {row[col] ?? <span className="text-gray-300 dark:text-gray-600 italic">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Market selection */}
        {clientData && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">2. Select Market</h2>
            <div className="flex gap-3">
              {MARKETS.map(({ code, label, flag }) => {
                const isAvailable = availableMarkets.length === 0 || availableMarkets.includes(code)
                const isSelected = selectedMarket === code
                const isAutoDetected = code === suggestedMarket
                const count = marketCounts[code]

                return (
                  <button
                    key={code}
                    onClick={() => isAvailable && setSelectedMarket(code)}
                    disabled={!isAvailable}
                    className={`flex-1 py-4 px-4 rounded-xl border-2 font-medium text-sm transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                        : isAvailable
                        ? 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                        : 'border-gray-100 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-2xl block mb-1">{flag}</span>
                    <span className="block font-semibold">{label}</span>
                    {count > 0 && (
                      <span className="block text-xs font-normal mt-1 text-blue-600">{count} rows detected</span>
                    )}
                    {isAutoDetected && (
                      <span className="block text-xs font-normal mt-0.5 text-green-600 dark:text-green-400">Auto-detected</span>
                    )}
                    {!isAvailable && (
                      <span className="block text-xs font-normal mt-0.5 text-gray-400 dark:text-gray-500">No template</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Column mapping (collapsible) */}
            {currentMapping && (
              <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowMapping(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Column Mapping <Tooltip text="Shows how your file's columns are matched to the template's required fields." /></span>
                    <span className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                      {Math.round(currentMapping.coverage * 100)}% coverage <Tooltip text="Percentage of template columns matched to your file's columns. 100% means all required fields were found." />
                    </span>
                    {currentMapping.unmapped_client_cols?.length > 0 && (
                      <span className="text-xs text-orange-600 dark:text-orange-400">
                        · {currentMapping.unmapped_client_cols.length} unused column(s)
                      </span>
                    )}
                  </div>
                  {showMapping ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
                </button>
                {showMapping && (
                  <div className="p-4 grid grid-cols-2 gap-2">
                    {currentMapping.mapped.map(({ template, source, found }, i) => (
                      <div key={i} className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${found ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                        <span className={`font-mono font-semibold ${found ? 'text-green-800 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                          {template}
                        </span>
                        <span className={`${found ? 'text-green-600 dark:text-green-400' : 'text-red-400 dark:text-red-500 italic'}`}>
                          {found ? `← ${source}` : 'not found'}
                        </span>
                      </div>
                    ))}
                    {currentMapping.unmapped_client_cols?.length > 0 && (
                      <div className="col-span-2 mt-2 text-xs text-gray-400 dark:text-gray-500">
                        <span className="font-medium">Unused columns: </span>
                        {currentMapping.unmapped_client_cols.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}


        {/* Validation Report */}
        {report && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
              <span className="mr-2">📋</span>
              Data Validation Report <Tooltip text="Blocking errors = missing required fields, rows will be included with empty values. Warnings = data quality issues. Suspicious = flagged for review but won't block generation." />
            </h2>

            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className={`px-4 py-3 flex items-center justify-between ${
                hasBlockingErrors ? 'bg-red-50 dark:bg-red-900/20' : hasWarnings ? 'bg-orange-50 dark:bg-orange-900/20' : 'bg-green-50 dark:bg-green-900/20'
              }`}>
                <div className="flex items-center space-x-3">
                  <span className="font-semibold text-gray-800 dark:text-gray-100">
                    {MARKETS.find(m => m.code === selectedMarket)?.flag}{' '}
                    {MARKETS.find(m => m.code === selectedMarket)?.label}
                  </span>
                  <div className="flex space-x-2">
                    {hasBlockingErrors && (
                      <span className="text-xs bg-red-200 dark:bg-red-800/50 text-red-800 dark:text-red-300 px-2 py-0.5 rounded font-medium">
                        ❌ {report.blocking_errors.length} blocking
                      </span>
                    )}
                    {hasWarnings && (
                      <span className="text-xs bg-orange-200 dark:bg-orange-800/50 text-orange-800 dark:text-orange-300 px-2 py-0.5 rounded font-medium">
                        ⚠️ {report.warnings.length} warnings
                      </span>
                    )}
                    {hasValidations && (
                      <span className="text-xs bg-yellow-200 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-300 px-2 py-0.5 rounded font-medium">
                        🔎 {report.validations.length} suspicious
                      </span>
                    )}
                    {!hasAnyIssue && (
                      <span className="text-xs bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-300 px-2 py-0.5 rounded font-medium">
                        ✅ All valid
                      </span>
                    )}
                  </div>
                </div>
                <span className={`text-sm font-semibold ${
                  report.total_rows > 0 && (report.valid_rows / report.total_rows) >= 0.9 ? 'text-green-600 dark:text-green-400'
                  : report.total_rows > 0 && (report.valid_rows / report.total_rows) >= 0.7 ? 'text-orange-600 dark:text-orange-400'
                  : 'text-red-600 dark:text-red-400'
                }`}>
                  {report.valid_rows}/{report.total_rows} valid
                </span>
              </div>

              {hasAnyIssue && (
                <div className="p-4 space-y-3">
                  {hasBlockingErrors && (
                    <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-3">
                      <p className="font-semibold text-red-900 dark:text-red-300 text-sm mb-2">❌ Blocking Errors</p>
                      <div className="space-y-1">{renderGroup(groupByIssue(report.blocking_errors), 'text-red-800 dark:text-red-400')}</div>
                    </div>
                  )}
                  {hasWarnings && (
                    <div className="bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 p-3">
                      <p className="font-semibold text-orange-900 dark:text-orange-300 text-sm mb-2">⚠️ Warnings</p>
                      <div className="space-y-1">{renderGroup(groupByIssue(report.warnings), 'text-orange-800 dark:text-orange-400')}</div>
                    </div>
                  )}
                  {hasValidations && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-3">
                      <p className="font-semibold text-yellow-900 dark:text-yellow-300 text-sm mb-2">🔎 Suspicious Data</p>
                      <div className="space-y-1">{renderGroup(groupByIssue(report.validations), 'text-yellow-800 dark:text-yellow-400')}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <ConfirmModal
          errorCount={report?.blocking_errors?.length || 0}
          onConfirm={doGenerate}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* Sticky action bar */}
      {clientData && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t-2 border-gray-200 dark:border-gray-700 shadow-xl">
          <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between gap-4">

            {/* Left: context summary */}
            <div className="text-base text-gray-600 dark:text-gray-300 flex items-center gap-4 min-w-0">
              {generationSuccess ? (
                <span className="font-semibold text-green-700 dark:text-green-400">✓ File generated successfully</span>
              ) : selectedMarket ? (
                <>
                  <span className="font-semibold text-gray-800 dark:text-gray-100">
                    {MARKETS.find(m => m.code === selectedMarket)?.flag}{' '}
                    {MARKETS.find(m => m.code === selectedMarket)?.label}
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <span>{clientData.total_records} rows</span>
                  {hasBlockingErrors && (
                    <span className="text-red-600 dark:text-red-400 font-medium flex-shrink-0">⚠️ {report.blocking_errors.length} blocking error{report.blocking_errors.length > 1 ? 's' : ''}</span>
                  )}
                </>
              ) : (
                <span className="text-gray-400 dark:text-gray-500">Select a market to generate</span>
              )}
            </div>

            {/* Right: action button */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {selectedMarket && !generationSuccess && (
                <button
                  onClick={handleGenerateClick}
                  disabled={loading}
                  className={`flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    hasBlockingErrors
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  <Download size={19} />
                  <span>{loading ? STEPS[stepIdx] : 'Generate & Download'}</span>
                </button>
              )}
              {generationSuccess && (
                <a
                  href={`${API_URL}/api/excel/download/${generationSuccess.jobId}`}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-base bg-green-600 hover:bg-green-700 text-white transition-all"
                >
                  <Download size={19} />
                  Re-download
                </a>
              )}
            </div>
          </div>
        </div>
      )}

    </>
  )
}
