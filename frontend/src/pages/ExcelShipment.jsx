import { useState } from 'react'
import { Upload, Download } from 'lucide-react'
import axios from 'axios'
import API_URL from '@/config'
axios.defaults.baseURL = API_URL

export default function ExcelShipment() {
  const [sessionId] = useState(() => Math.random().toString(36).substr(2, 9))
  const [clientData, setClientData] = useState(null)
  const [availableMarkets, setAvailableMarkets] = useState([])
  const [selectedMarkets, setSelectedMarkets] = useState([])
  const [detectedMarkets, setDetectedMarkets] = useState({})  // {'IT': 15, 'FR': 8}
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [validationReport, setValidationReport] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState(null)
  
  const handleClientDataUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    setUploadedFileName(file.name)  // Store filename
    
    setLoading(true)
    setError(null)
    
    const formData = new FormData()
    formData.append('file', file)
    formData.append('session_id', sessionId)
    
    try {
      const response = await axios.post('/api/excel/upload-client-data', formData)
      setClientData(response.data)
      
      // Set available markets from backend response
      if (response.data.available_markets) {
        setAvailableMarkets(response.data.available_markets)
        console.log('Available markets:', response.data.available_markets)
      }
      
      // Store detected markets count
      if (response.data.detected_markets) {
        setDetectedMarkets(response.data.detected_markets)
      }
      
      // Store validation report from upload
      if (response.data.validation_reports) {
        setValidationReport(response.data.validation_reports)
      }
      
      // Auto-select suggested markets (markets with detected data)
      if (response.data.suggested_markets && response.data.suggested_markets.length > 0) {
        setSelectedMarkets(response.data.suggested_markets)
        console.log('Auto-selected markets:', response.data.suggested_markets)
      }
    } catch (error) {
      console.error('Error uploading client data:', error)
      setError('Error uploading client data: ' + (error.response?.data?.detail || error.message))
    } finally {
      setLoading(false)
    }
  }
  
  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    setIsDragging(false)
    
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    
    if (!file.name.endsWith('.xlsx')) {
      setError('Please upload an Excel file (.xlsx)')
      return
    }
    
    setUploadedFileName(file.name)  // Store filename
    
    // Reuse the same upload logic
    const formData = new FormData()
    formData.append('file', file)
    formData.append('session_id', sessionId)
    
    setLoading(true)
    setError(null)
    
    try {
      const response = await axios.post('/api/excel/upload-client-data', formData)
      setClientData(response.data)
      
      if (response.data.available_markets) {
        setAvailableMarkets(response.data.available_markets)
      }
      
      if (response.data.detected_markets) {
        setDetectedMarkets(response.data.detected_markets)
      }
      
      if (response.data.validation_reports) {
        setValidationReport(response.data.validation_reports)
      }
      
      if (response.data.suggested_markets && response.data.suggested_markets.length > 0) {
        setSelectedMarkets(response.data.suggested_markets)
      }
    } catch (error) {
      console.error('Error uploading client data:', error)
      setError('Error uploading client data: ' + (error.response?.data?.detail || error.message))
    } finally {
      setLoading(false)
    }
  }
  
  const handleGenerate = async () => {
    if (selectedMarkets.length === 0) {
      alert('Please select at least one market')
      return
    }
    
    setLoading(true)
    setError(null)
    
    const formData = new FormData()
    formData.append('session_id', sessionId)
    formData.append('markets', JSON.stringify(selectedMarkets))
    formData.append('filter_mode', 'auto')
    
    try {
      const response = await axios.post('/api/excel/generate', formData)
      const jobId = response.data.job_id
      const validationReports = response.data.validation_reports
      
      // Store validation report
      if (validationReports) {
        setValidationReport(validationReports)
      }
      
      // Check if there are blocking errors
      const hasBlockingErrors = Object.values(validationReports || {}).some(
        report => report.blocking_errors && report.blocking_errors.length > 0
      )
      
      // Download anyway (or show warning first)
      window.location.href = `${API_URL}/api/excel/download/${jobId}`
    } catch (error) {
      console.error('Error generating files:', error)
      setError('Error generating files: ' + (error.response?.data?.detail || error.message))
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Excel Shipment Generator
      </h1>
      
      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-800">{error}</p>
          <button 
            onClick={() => setError(null)} 
            className="mt-2 text-xs text-red-600 hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}
      
      {/* Upload + Select Markets - 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        
        {/* LEFT: Upload Client Data */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">1. Upload Client Data</h2>
          
          {/* Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <input
              type="file"
              accept=".xlsx"
              onChange={handleClientDataUpload}
              disabled={loading}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center"
            >
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

        {/* RIGHT: Market Selection */}
        {availableMarkets.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">2. Select Markets</h2>
            <div className="flex flex-col space-y-1">
              {availableMarkets.map(market => {
                const marketName = market === 'IT' ? 'Italy' : market === 'FR' ? 'France' : market === 'ES' ? 'Spain' : market
                const detectedCount = detectedMarkets[market] || 0
                const isDetected = detectedCount > 0
                
                return (
                  <label key={market} className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedMarkets.includes(market)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMarkets(prev => [...prev, market])
                          } else {
                            setSelectedMarkets(prev => prev.filter(m => m !== market))
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <span className="font-medium">{marketName}</span>
                    </div>
                    {isDetected ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-medium">
                        ✓ {detectedCount} record{detectedCount > 1 ? 's' : ''} auto-detected
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">
                        No records detected
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </div>
      
      {/* Validation Report - Improved design */}
      {validationReport && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <span className="mr-2">📋</span>
            Data Validation Report
          </h2>
          
          {/* Fixed height container with scroll */}
          <div className="max-h-36 overflow-y-auto border border-gray-200 rounded">
            {Object.entries(validationReport).map(([market, report]) => {
              const hasBlockingErrors = report.blocking_errors && report.blocking_errors.length > 0
              const hasWarnings = report.warnings && report.warnings.length > 0
              const hasValidations = report.validations && report.validations.length > 0
              const marketName = market === 'IT' ? 'Italy' : market === 'FR' ? 'France' : market === 'ES' ? 'Spain' : market
              const validPercentage = ((report.valid_rows / report.total_rows) * 100).toFixed(1)
              
              return (
                <div key={market} className="border-b last:border-b-0">
                  {/* Market Header */}
                  <div className={`p-4 ${hasBlockingErrors ? 'bg-red-100' : hasWarnings ? 'bg-orange-100' : 'bg-green-100'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <h3 className="font-semibold text-lg">{marketName}</h3>
                        
                        {/* Quick summary badges - on same line */}
                        <div className="flex space-x-2">
                          {hasBlockingErrors && (
                            <span className="text-xs bg-red-200 text-red-800 px-2 py-1 rounded font-medium">
                              ❌ {report.blocking_errors.length} blocking
                            </span>
                          )}
                          {hasWarnings && (
                            <span className="text-xs bg-orange-200 text-orange-800 px-2 py-1 rounded font-medium">
                              ⚠️ {report.warnings.length} warnings
                            </span>
                          )}
                          {hasValidations && (
                            <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded font-medium">
                              🔎 {report.validations.length} suspicious
                            </span>
                          )}
                          {!hasBlockingErrors && !hasWarnings && !hasValidations && (
                            <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded font-medium">
                              ✅ All valid
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <span className="text-sm">
                          <strong>{report.valid_rows}</strong>/{report.total_rows} valid
                        </span>
                        <span className={`text-sm font-semibold ${validPercentage >= 90 ? 'text-green-600' : validPercentage >= 70 ? 'text-orange-600' : 'text-red-600'}`}>
                          {validPercentage}%
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Issues Details - 2 columns layout */}
                  <div className="p-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      
                      {/* LEFT COLUMN: Blocking Errors */}
                      <div>
                        {hasBlockingErrors && (
                          <div className="bg-red-50 border-l-4 border-red-500 p-3">
                            <div className="flex items-start">
                              <span className="text-red-600 font-bold mr-2">❌</span>
                              <div className="flex-1">
                                <p className="font-semibold text-red-900 text-sm mb-1">
                                  Blocking Errors ({report.blocking_errors.length})
                                </p>
                                <div className="text-xs space-y-1 max-h-64 overflow-y-auto">
                                  {report.blocking_errors.map((err, idx) => (
                                    <div key={idx} className="text-red-800">
                                      <span className="font-mono bg-red-100 px-1">Row {err.row}</span>
                                      <span className="text-gray-600 mx-1">•</span>
                                      <span className="font-medium">User {err.user_id}</span>
                                      <span className="text-gray-600 mx-1">→</span>
                                      {err.issue}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {!hasBlockingErrors && (
                          <div className="bg-green-50 border-l-4 border-green-500 p-3 text-center">
                            <p className="text-green-700 font-semibold text-sm">✅ No blocking errors</p>
                          </div>
                        )}
                      </div>

                      {/* RIGHT COLUMN: Warnings */}
                      <div>
                        {hasWarnings && (
                          <div className="bg-orange-50 border-l-4 border-orange-500 p-3">
                            <div className="flex items-start">
                              <span className="text-orange-600 font-bold mr-2">⚠️</span>
                              <div className="flex-1">
                                <p className="font-semibold text-orange-900 text-sm mb-1">
                                  Warnings ({report.warnings.length})
                                </p>
                                <div className="text-xs space-y-1 max-h-64 overflow-y-auto">
                                  {report.warnings.map((warn, idx) => (
                                    <div key={idx} className="text-orange-800">
                                      <span className="font-mono bg-orange-100 px-1">Row {warn.row}</span>
                                      <span className="text-gray-600 mx-1">•</span>
                                      <span className="font-medium">User {warn.user_id}</span>
                                      <span className="text-gray-600 mx-1">→</span>
                                      {warn.issue}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {!hasWarnings && (
                          <div className="bg-green-50 border-l-4 border-green-500 p-3 text-center">
                            <p className="text-green-700 font-semibold text-sm">✅ No warnings</p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Validations - Full width below */}
                    {hasValidations && (
                      <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 mt-4">
                        <div className="flex items-start">
                          <span className="text-yellow-600 font-bold mr-2">🔎</span>
                          <div className="flex-1">
                            <p className="font-semibold text-yellow-900 text-sm mb-1">
                              Suspicious Data ({report.validations.length})
                            </p>
                            <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                              {report.validations.slice(0, 5).map((val, idx) => (
                                <div key={idx} className="text-yellow-800">
                                  <span className="font-mono bg-yellow-100 px-1">Row {val.row}</span>
                                  <span className="text-gray-600 mx-1">•</span>
                                  <span className="font-medium">User {val.user_id}</span>
                                  <span className="text-gray-600 mx-1">→</span>
                                  {val.issue}
                                </div>
                              ))}
                              {report.validations.length > 5 && (
                                <p className="text-yellow-600 italic">+ {report.validations.length - 5} more</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Generate Button */}
      <div className="flex justify-center mb-6">
        <button
          onClick={handleGenerate}
          disabled={!clientData || selectedMarkets.length === 0 || loading}
          className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Download size={20} />
          <span>{loading ? 'Generating...' : 'Generate & Download'}</span>
        </button>
      </div>
    </div>
  )
}