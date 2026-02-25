import { useState, useRef } from 'react'
import { Upload, PlayCircle, Download, FileText, Image as ImageIcon } from 'lucide-react'
import axios from 'axios'
import API_URL from '@/config'
axios.defaults.baseURL = API_URL

const MODEL_CONFIG = {
  'ocr_free:openrouter/free': {
    name: 'OCR + AI Free',
    price: 0,
    quality: 'No formatting',
    speed: 'Fast'
  },
  'claude:claude-3-haiku-20240307': {
    name: 'Claude Haiku',
    price: 0.045,  // Real observed: $0.042/slide avg (rounded up for safety)
    quality: '88%',
    speed: 'Medium'
  },
  'claude:claude-sonnet-4-20250514': {
    name: 'Claude Sonnet 4',
    price: 0.060,  // Real observed: $0.054/slide (4 slides test), rounded up
    quality: '96%',
    speed: 'Slower'
  }
}

export default function PptTranslation() {
  const [file, setFile] = useState(null)
  const [slides, setSlides] = useState([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [jobId, setJobId] = useState(null)
  const [progressMessage, setProgressMessage] = useState('')
  const [progressWarning, setProgressWarning] = useState(null) // message orange pendant processing
  const [failedSlides, setFailedSlides] = useState(0)
  const [detectedLang, setDetectedLang] = useState(null)
  const [error, setError] = useState(null)
  const [slideMethods, setSlideMethods] = useState([])  // [{slide, method, error}]
  const [startTime, setStartTime] = useState(null)  // Track translation start time
  const [translationCompleted, setTranslationCompleted] = useState(false)  // Track successful completion
  const fileInputRef = useRef(null)

  const [settings, setSettings] = useState({
    provider: 'ocr_free',
    model: 'openrouter/free',
    source_lang: 'es',
    target_lang: 'en',
    base_font_size: 11,
    title_size_adjustment: 5,
    subject_size_adjustment: 1,
    preserve_colors: true
  })

  const selectedCount = slides.filter(s => s.selected).length

  const getEstimate = () => {
    const modelKey = `${settings.provider}:${settings.model}`
    const config = MODEL_CONFIG[modelKey]
    if (!config || selectedCount === 0) return { cost: 0, time: '', modelName: '', quality: '' }
    const cost = selectedCount * config.price
    
    // Calculate time range (VERY pessimistic for better UX - avoid disappointment)
    let minSecondsPerSlide = 12
    let maxSecondsPerSlide = 25
    
    if (settings.provider === 'claude') {
      // Claude vision - generous buffer for API latency, queuing, retries
      minSecondsPerSlide = 10
      maxSecondsPerSlide = 20
    } else if (settings.provider === 'openrouter-vision') {
      // OpenRouter vision - slower and more variable
      minSecondsPerSlide = 12
      maxSecondsPerSlide = 25
    } else if (settings.provider === 'openrouter-ocr') {
      // OCR free mode - most unpredictable (OCR + translation + post-processing)
      minSecondsPerSlide = 15
      maxSecondsPerSlide = 30
    }
    
    const minMinutes = Math.floor((selectedCount * minSecondsPerSlide) / 60)
    const maxMinutes = Math.ceil((selectedCount * maxSecondsPerSlide) / 60)
    
    // Format time as wide ranges (never show seconds - always minutes)
    let time = ''
    if (selectedCount === 1) {
      time = '<1'
    } else if (maxMinutes <= 2) {
      time = '1-3' // Very wide range for short tasks
    } else if (maxMinutes <= 5) {
      time = `${Math.max(1, minMinutes)}-${maxMinutes + 2}` // +2 buffer
    } else {
      time = `${minMinutes}-${maxMinutes + 3}` // +3 buffer for long tasks
    }
    
    return { cost, time, modelName: config.name, quality: config.quality }
  }

  const estimate = getEstimate()

  const handleModelChange = (e) => {
    const parts = e.target.value.split(':')
    const provider = parts[0]
    const model = parts.slice(1).join(':')
    setSettings(prev => ({ ...prev, provider, model }))
  }

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0]
    if (!uploadedFile) return

    if (!uploadedFile.name.endsWith('.pptx')) {
      setError('Please upload a .pptx file')
      return
    }
    if (uploadedFile.size > 100 * 1024 * 1024) {
      setError('File size must be less than 100MB')
      return
    }

    // Reset state for new file
    setError(null)
    setFile(uploadedFile)
    setProgressMessage('')  // Clear previous completion message
    setJobId(null)  // Clear previous job
    setSlideMethods([])  // Clear previous slide methods
    setTranslationCompleted(false)  // Reset completion state

    const formData = new FormData()
    formData.append('file', uploadedFile)

    try {
      const response = await axios.post('/api/ppt/preview', formData)
      setSlides(response.data.slides)
      if (response.data.detected_lang) {
        setDetectedLang(response.data.detected_lang)
        setSettings(prev => ({ ...prev, source_lang: response.data.detected_lang }))
      } else {
        setDetectedLang(null)
      }
    } catch (error) {
      setError('Error previewing slides: ' + error.message)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      const fakeEvent = { target: { files: [droppedFile] } }
      handleFileUpload(fakeEvent)
    }
  }

  const toggleSlide = (index) => {
    setSlides(prev => prev.map((s, i) =>
      i === index ? { ...s, selected: !s.selected } : s
    ))
  }

  const selectAll = () => setSlides(prev => prev.map(s => ({ ...s, selected: true })))
  const deselectAll = () => setSlides(prev => prev.map(s => ({ ...s, selected: false })))

  const handleTranslate = async () => {
    if (!file || selectedCount === 0) return

    setProcessing(true)
    setProgress(0)
    setCurrentSlide(0)
    setProgressMessage('')
    setProgressWarning(null)
    setError(null)
    setSlideMethods([])
    setFailedSlides(0)
    setStartTime(Date.now())  // Capture start time
    setTranslationCompleted(false)  // Reset completion state

    const formData = new FormData()
    formData.append('file', file)
    formData.append('provider', settings.provider)
    formData.append('source_lang', settings.source_lang)
    formData.append('target_lang', settings.target_lang)
    formData.append('selected_slides', JSON.stringify(
      slides.filter(s => s.selected).map(s => s.index)
    ))
    formData.append('base_font_size', settings.base_font_size)
    formData.append('title_size_adjustment', settings.title_size_adjustment)
    formData.append('subject_size_adjustment', settings.subject_size_adjustment)
    formData.append('preserve_colors', settings.preserve_colors)

    try {
      const response = await axios.post('/api/ppt/translate', formData)
      const newJobId = response.data.job_id
      setJobId(newJobId)
      trackProgress(newJobId)
    } catch (error) {
      setError('Error starting translation: ' + error.message)
      setProcessing(false)
    }
  }

  const trackProgress = (id) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await axios.get(`/api/ppt/history?limit=5`)
        const jobs = response.data.jobs
        const job = jobs.find(j => j.id === id)
        if (!job) return

        // Calculate progress based on SELECTED slides only, not total slides
        // Use persisted count from backend to avoid losing it on page refresh
        const totalSelectedSlides = job.settings_used?.selected_slides_count || selectedCount || job.total_slides
        if (totalSelectedSlides > 0) {
          const percent = (job.slides_processed / totalSelectedSlides) * 100
          // Debug logging
          console.log(`Progress calc:`, {
            slides_processed: job.slides_processed,
            selected_slides_count: job.settings_used?.selected_slides_count,
            selectedCount: selectedCount,
            total_slides: job.total_slides,
            totalSelectedSlides: totalSelectedSlides,
            rawPercent: percent,
          })
          // Cap at 99% until completion to avoid getting stuck at 100%
          const cappedPercent = job.status === 'completed' ? 100 : Math.min(99, Math.round(percent))
          console.log(`Progress: ${job.slides_processed}/${totalSelectedSlides} = ${percent.toFixed(1)}% → ${cappedPercent}%`)
          setProgress(cappedPercent)
          // Use current_slide_index if available, otherwise fall back to slides_processed
          const displaySlide = job.settings_used?.current_slide_index || job.slides_processed
          setCurrentSlide(displaySlide)
        }

        // Détecter les fallbacks offline et slides échouées pendant le processing
        const methods = job.settings_used?.slide_methods || []
        const failedSlidesCount = job.settings_used?.failed_slides || 0
        setFailedSlides(failedSlidesCount)
        if (methods.length > 0) {
          setSlideMethods(methods)
          const offlineCount = methods.filter(s => s.method === 'offline').length
          const failedCount = failedSlidesCount || methods.filter(s => !s.method || s.method === 'unknown').length
          const warnings = []
          if (offlineCount > 0) {
            warnings.push(
              `⚠️ OpenRouter unavailable — ${offlineCount} slide${offlineCount > 1 ? 's' : ''} translated offline (Helsinki-NLP).`
            )
          }
          if (failedCount > 0) {
            warnings.push(
              `❌ ${failedCount} slide${failedCount > 1 ? 's' : ''} could not be translated.`
            )
          }
          setProgressWarning(warnings.length ? warnings.join(' ') : null)
        }
        if (methods.length === 0 && failedSlidesCount > 0) {
          setProgressWarning(
            `❌ ${failedSlidesCount} slide${failedSlidesCount > 1 ? 's' : ''} could not be translated.`
          )
        }

        if (job.status === 'completed') {
          setProgress(100)
          setProcessing(false)
          setTranslationCompleted(true)  // Mark as successfully completed
          clearInterval(pollInterval)
          
          // Get elapsed time from backend (more reliable than frontend calculation)
          const elapsedSec = job.settings_used?.elapsed_seconds || 0
          const elapsedMin = Math.floor(elapsedSec / 60)
          const remainingSec = elapsedSec % 60
          const timeStr = elapsedMin > 0 
            ? `${elapsedMin}m ${remainingSec}s`
            : `${elapsedSec}s`
          
          // Display actual cost if available
          const actualCost = job.settings_used?.total_cost
          const inputTokens = job.settings_used?.total_input_tokens
          const outputTokens = job.settings_used?.total_output_tokens
          
          // Check if offline fallback was used
          const methods = job.settings_used?.slide_methods || []
          const offlineCount = methods.filter(s => s.method === 'offline').length
          const failedCount = job.settings_used?.failed_slides || 0
          const totalSelected = selectedCount || job.slides_processed + failedCount
          const successCount = job.slides_processed
          
          const offlineWarning = offlineCount > 0 
            ? `Note: ${offlineCount} slide${offlineCount > 1 ? 's' : ''} translated offline (OpenRouter unavailable)`
            : ''
          
          const failureWarning = failedCount > 0
            ? `${failedCount}/${totalSelected} slide${failedCount > 1 ? 's' : ''} failed - Download contains ${successCount} translated slide${successCount > 1 ? 's' : ''}`
            : ''
          
          // Build message as array of lines (without emojis)
          const messageLines = []
          messageLines.push(`Translation completed in ${timeStr}`)
          
          if (actualCost !== undefined && actualCost > 0) {
            messageLines.push(`Cost: $${actualCost.toFixed(3)} (${(inputTokens || 0).toLocaleString()} in + ${(outputTokens || 0).toLocaleString()} out tokens)`)
          }
          
          if (failureWarning) {
            messageLines.push(failureWarning)
          }
          
          if (offlineWarning) {
            messageLines.push(offlineWarning)
          }
          
          setProgressMessage(messageLines.join('\n'))
          
          // Récupérer slide_methods finaux
          if (job.settings_used?.slide_methods) {
            setSlideMethods(job.settings_used.slide_methods)
          }
        } else if (job.status === 'failed') {
          setProcessing(false)
          setTranslationCompleted(false)  // Mark as failed (don't show download)
          clearInterval(pollInterval)
          setError('Translation failed: ' + job.error_message)
        }
      } catch (error) {
        console.error('Polling error:', error)
      }
    }, 2000)

    setTimeout(() => {
      clearInterval(pollInterval)
      setProcessing(false)
      setProgress(100)
    }, 300000)
  }

  const handleDownload = () => {
    if (!jobId) return
    window.location.href = `/api/ppt/download/${jobId}`
  }

  const handleCancel = async () => {
    if (!jobId) return
    
    try {
      await axios.post(`/api/ppt/cancel/${jobId}`)
      setProcessing(false)
      setProgressMessage('Translation cancelled by user')
      setProgress(0)
    } catch (error) {
      console.error('Error cancelling job:', error)
      setError('Failed to cancel translation')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">

        {/* Header */}
        <div className="mb-8 flex items-center space-x-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xl">PT</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">PowerPoint Translation</h1>
            <p className="text-gray-600">Professional automated translation service</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
            <svg className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="ml-3 text-sm text-red-800 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="ml-3 text-red-400 hover:text-red-600 text-lg leading-none">×</button>
          </div>
        )}

        {/* Upload + Settings - 2 Columns */}
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 ${processing ? 'pointer-events-none opacity-50' : ''}`}>

          {/* LEFT: Upload */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Presentation</h2>

            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                file
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pptx"
                className="hidden"
              />
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <Upload className="w-8 h-8 text-blue-600" />
                </div>
                {file ? (
                  <>
                    <p className="text-lg font-medium text-gray-900 mb-1">{file.name}</p>
                    <p className="text-sm text-blue-600">Click to change file</p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium text-gray-900 mb-2">Click to browse or drag and drop</p>
                    <p className="text-sm text-gray-500">.pptx files only • Maximum 100MB</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Settings */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Translation Settings</h2>

            <div className="space-y-4">
              {/* Model */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Translation Model</label>
                <select
                  value={`${settings.provider}:${settings.model}`}
                  onChange={handleModelChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="ocr_free:openrouter/free">
                    OCR + Free Translation — no formatting
                  </option>
                  <option value="claude:claude-3-haiku-20240307">
                    Claude Haiku ($0.045/slide) — 88% accuracy
                  </option>
                  <option value="claude:claude-sonnet-4-20250514">
                    Claude Sonnet 4 ($0.06/slide) — 96% accuracy
                  </option>
                </select>

                {/* Warning for OCR Free */}
                {settings.provider === 'ocr_free' && (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs text-yellow-800">
                      ⚠️ <strong>Free mode:</strong> Text only, formatting is not preserved.
                      Use Claude for full formatting.
                    </p>
                  </div>
                )}
              </div>

              {/* Source and Target Language - same row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Source Language */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Source Language
                    {detectedLang && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-normal">
                        Auto-detected
                      </span>
                    )}
                  </label>
                  <select
                    value={settings.source_lang}
                    onChange={(e) => {
                      setDetectedLang(null)
                      setSettings(prev => ({ ...prev, source_lang: e.target.value }))
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="fr">🇫🇷 French</option>
                    <option value="es">🇪🇸 Spanish</option>
                    <option value="it">🇮🇹 Italian</option>
                  </select>
                </div>

                {/* Target Language */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Target Language</label>
                  <select
                    value={settings.target_lang}
                    onChange={(e) => setSettings(prev => ({ ...prev, target_lang: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="en">🇬🇧 English</option>
                    <option value="es">🇪🇸 Spanish</option>
                    <option value="fr">🇫🇷 French</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Cost Estimate */}
            {selectedCount > 0 && (
              <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Slides:</span>
                    <span className="font-medium text-gray-900">{selectedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Time:</span>
                    <span className="font-medium text-gray-900">{estimate.time} min</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-blue-200">
                    <span className="text-gray-900 font-semibold">Cost:</span>
                    <span className="font-bold text-blue-600">
                      {estimate.cost === 0 ? 'Free' : `~$${estimate.cost.toFixed(2)}`}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Slides Selection */}
        {slides.length > 0 && (
          <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 ${processing ? 'pointer-events-none opacity-50' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Select Slides ({selectedCount} of {slides.length} selected)
              </h2>
              <div className="flex space-x-2">
                <button onClick={selectAll} className="text-sm text-blue-600 hover:text-blue-700">Select All</button>
                <span className="text-gray-300">•</span>
                <button onClick={deselectAll} className="text-sm text-blue-600 hover:text-blue-700">Deselect All</button>
              </div>
            </div>

            {/* Scrollable grid with max height */}
            <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-3">
              <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {slides.map((slide) => (
                  <div
                    key={slide.index}
                    className={`relative border-2 rounded-lg p-2 cursor-pointer transition-all ${
                      slide.selected
                        ? 'border-blue-500 bg-blue-50 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow'
                    }`}
                    onClick={() => toggleSlide(slide.index)}
                  >
                    {/* Checkbox */}
                    <div className="absolute top-1 right-1 z-10">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                        slide.selected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                      }`}>
                        {slide.selected && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Preview */}
                    <div className="aspect-video bg-gradient-to-br from-gray-50 to-gray-100 rounded relative overflow-hidden mb-1">
                      <div className="flex flex-col items-center justify-center h-full p-1 text-center">
                        {slide.has_image
                          ? <ImageIcon className="w-6 h-6 text-green-500 mb-1" />
                          : <FileText className="w-6 h-6 text-gray-400 mb-1" />
                        }
                        {slide.title && (
                          <p className="text-xs text-gray-700 line-clamp-1 px-1">{slide.title}</p>
                        )}
                      </div>
                    </div>

                    <p className="text-xs font-medium text-center text-gray-700">Slide {slide.index + 1}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-center space-x-4 mb-6">
          <button
            onClick={handleTranslate}
            disabled={!file || selectedCount === 0 || processing}
            className="flex items-center space-x-2 bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <PlayCircle size={20} />
            <span>{processing ? 'Processing...' : 'Start Translation'}</span>
          </button>

          {processing && jobId && (
            <button
              onClick={handleCancel}
              className="flex items-center space-x-2 bg-red-600 text-white px-8 py-3 rounded-lg hover:bg-red-700 transition-all"
            >
              <span>✕</span>
              <span>Cancel</span>
            </button>
          )}

          {jobId && !processing && translationCompleted && (
            <button
              onClick={handleDownload}
              className="flex items-center space-x-2 bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 transition-all"
            >
              <Download size={20} />
              <span>Download Result</span>
            </button>
          )}
        </div>

        {/* Success Summary - shown after translation completes */}
        {jobId && !processing && progressMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-300 rounded-lg">
            <p className="text-sm text-green-800 font-medium whitespace-pre-line">{progressMessage}</p>
          </div>
        )}

        {/* Detailed slide status table - shown after translation */}
        {jobId && !processing && slideMethods.length > 0 && (
          <details className="mb-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-blue-600 mb-2 select-none">
              View detailed slide status ({slideMethods.length} slides)
            </summary>
            <div className="mt-3 bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Slide</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {slideMethods.map((slide, idx) => {
                    const isSuccess = slide.method && slide.method !== 'unknown'
                    const isOffline = slide.method === 'offline'
                    const isFailed = !slide.method || slide.method === 'unknown'
                    
                    return (
                      <tr key={idx} className={isFailed ? 'bg-red-50' : isOffline ? 'bg-orange-50' : ''}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">#{slide.slide}</td>
                        <td className="px-4 py-3 text-sm">
                          {isSuccess && !isOffline && <span className="text-green-600 font-medium">Success</span>}
                          {isOffline && <span className="text-orange-600 font-medium">Offline</span>}
                          {isFailed && <span className="text-red-600 font-medium">Failed</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {slide.model || slide.method || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {slide.error || (isOffline ? 'API unavailable' : '—')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {/* Progress Bar */}
        {processing && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-900">
                  {progressMessage || 'Processing...'}
                </span>
              </div>
              <span className="text-sm text-gray-600">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            {currentSlide > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                Processing slide {currentSlide}
              </p>
            )}

            {/* Avertissement inline si fallback offline détecté pendant le processing */}
            {progressWarning && (
              <div className="mt-3 p-3 bg-orange-50 border border-orange-300 rounded-lg flex items-start gap-2">
                <span className="text-orange-500 text-base flex-shrink-0">⚠️</span>
                <p className="text-xs text-orange-800">{progressWarning}</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}