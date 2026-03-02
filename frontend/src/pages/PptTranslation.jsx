import { useState, useRef, useEffect } from 'react'
import { Download, FileText, Image as ImageIcon } from 'lucide-react'
import axios from 'axios'
import API_URL from '@/config'
axios.defaults.baseURL = API_URL

// --- Constants ---

const MODEL_OPTIONS = [
  {
    key: 'ocr_free:openrouter/free',
    name: 'OCR + Free',
    price: 'Free',
    quality: 'Text only',
    speed: 'Fast',
    warning: 'No formatting preserved',
  },
  {
    key: 'claude:claude-3-haiku-20240307',
    name: 'Claude Haiku',
    price: '$0.045/slide',
    quality: '88% accuracy',
    speed: 'Medium',
  },
  {
    key: 'claude:claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    price: '$0.06/slide',
    quality: '96% accuracy',
    speed: 'Slower',
  },
]

const MODEL_CONFIG = {
  'ocr_free:openrouter/free': { price: 0, minSec: 15, maxSec: 30 },
  'claude:claude-3-haiku-20240307': { price: 0.045, minSec: 10, maxSec: 20 },
  'claude:claude-sonnet-4-20250514': { price: 0.060, minSec: 10, maxSec: 20 },
}

const LANG_FLAGS = { fr: '🇫🇷', es: '🇪🇸', it: '🇮🇹', en: '🇬🇧' }
const LANG_NAMES = { fr: 'French', es: 'Spanish', it: 'Italian', en: 'English' }

const LANGUAGES = [
  { code: 'fr', label: '🇫🇷 French' },
  { code: 'es', label: '🇪🇸 Spanish' },
  { code: 'it', label: '🇮🇹 Italian' },
  { code: 'en', label: '🇬🇧 English' },
]

// --- Helpers ---

const formatElapsed = (s) => {
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

const getEstimate = (modelKey, count) => {
  const cfg = MODEL_CONFIG[modelKey]
  if (!cfg || count === 0) return { cost: 0, timeLabel: '' }
  const cost = count * cfg.price
  const minMin = Math.floor((count * cfg.minSec) / 60)
  const maxMin = Math.ceil((count * cfg.maxSec) / 60) + 2
  const timeLabel = count === 1 ? '<1 min' : `${Math.max(1, minMin)}–${maxMin} min`
  return { cost, timeLabel }
}

function loadSavedSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('ppt_settings') || '{}')
    return {
      provider: s.provider || 'ocr_free',
      model: s.model || 'openrouter/free',
      source_lang: s.source_lang || 'es',
      target_lang: s.target_lang || 'en',
      base_font_size: 11,
      title_size_adjustment: 5,
      subject_size_adjustment: 1,
      preserve_colors: true,
    }
  } catch {
    return { provider: 'ocr_free', model: 'openrouter/free', source_lang: 'es', target_lang: 'en', base_font_size: 11, title_size_adjustment: 5, subject_size_adjustment: 1, preserve_colors: true }
  }
}

// --- Main component ---

export default function PptTranslation() {
  // Core state
  const [file, setFile] = useState(null)
  const [slides, setSlides] = useState([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [slidesDetected, setSlidesDetected] = useState(0)
  const [jobId, setJobId] = useState(null)
  const [progressMessage, setProgressMessage] = useState('')
  const [progressWarning, setProgressWarning] = useState(null)
  const [failedSlides, setFailedSlides] = useState(0)
  const [detectedLang, setDetectedLang] = useState(null)
  const [error, setError] = useState(null)
  const [slideMethods, setSlideMethods] = useState([])
  const [translationCompleted, setTranslationCompleted] = useState(false)

  // New state
  const [elapsed, setElapsed] = useState(0)
  const [autoDownload, setAutoDownload] = useState(() => localStorage.getItem('ppt_auto_download') === 'true')
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [isRetryMode, setIsRetryMode] = useState(false)
  const [firstJobId, setFirstJobId] = useState(null)
  const [merging, setMerging] = useState(false)

  // Settings (persisted)
  const [settings, setSettings] = useState(loadSavedSettings)

  const fileInputRef = useRef(null)
  const progressRef = useRef(null)

  const modelKey = `${settings.provider}:${settings.model}`
  const selectedCount = slides.filter(s => s.selected).length
  const { cost, timeLabel } = getEstimate(modelKey, selectedCount)

  // Persist settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ppt_settings', JSON.stringify({
        provider: settings.provider, model: settings.model,
        source_lang: settings.source_lang, target_lang: settings.target_lang,
      }))
    } catch {}
  }, [settings.provider, settings.model, settings.source_lang, settings.target_lang])

  // Live elapsed timer
  useEffect(() => {
    if (!processing) return
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [processing])

  // Load history on mount
  useEffect(() => {
    axios.get('/api/ppt/history?limit=5')
      .then(res => setHistory(res.data.jobs || []))
      .catch(() => {})
  }, [])

  // --- Model helpers ---
  const handleModelSelect = (key) => {
    const parts = key.split(':')
    setSettings(prev => ({ ...prev, provider: parts[0], model: parts.slice(1).join(':') }))
  }

  const handleSwapLangs = () => {
    setDetectedLang(null)
    setSettings(prev => ({ ...prev, source_lang: prev.target_lang, target_lang: prev.source_lang }))
  }

  // --- File upload ---
  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files?.[0] || e
    if (!uploadedFile) return
    if (typeof uploadedFile.name === 'undefined') return // guard for weird calls

    if (!uploadedFile.name.endsWith('.pptx')) { setError('Please upload a .pptx file'); return }
    if (uploadedFile.size > 100 * 1024 * 1024) { setError('File size must be less than 100MB'); return }

    setError(null)
    setFile(uploadedFile)
    setProgressMessage('')
    setJobId(null)
    setSlideMethods([])
    setTranslationCompleted(false)
    setIsRetryMode(false)
    setFirstJobId(null)

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
    } catch (err) {
      setError('Error previewing slides: ' + err.message)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFileUpload(f)
  }

  // --- Slide selection ---
  const toggleSlide = (index) => setSlides(prev => prev.map((s, i) => i === index ? { ...s, selected: !s.selected } : s))
  const selectAll = () => setSlides(prev => prev.map(s => ({ ...s, selected: true })))
  const deselectAll = () => setSlides(prev => prev.map(s => ({ ...s, selected: false })))

  const applyRange = () => {
    const from = parseInt(rangeFrom, 10)
    const to = parseInt(rangeTo, 10)
    if (isNaN(from) || isNaN(to)) return
    setSlides(prev => prev.map(s => ({ ...s, selected: s.index + 1 >= from && s.index + 1 <= to })))
  }

  // --- Translation ---
  const handleTranslate = async () => {
    if (!file || selectedCount === 0) return

    setProcessing(true)
    setProgress(0)
    setCurrentSlide(0)
    setSlidesDetected(0)
    setProgressMessage('')
    setProgressWarning(null)
    setError(null)
    setSlideMethods([])
    setFailedSlides(0)
    setElapsed(0)
    setTranslationCompleted(false)

    setTimeout(() => progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('provider', settings.provider)
    formData.append('source_lang', settings.source_lang)
    formData.append('target_lang', settings.target_lang)
    formData.append('selected_slides', JSON.stringify(slides.filter(s => s.selected).map(s => s.index)))
    formData.append('base_font_size', settings.base_font_size)
    formData.append('title_size_adjustment', settings.title_size_adjustment)
    formData.append('subject_size_adjustment', settings.subject_size_adjustment)
    formData.append('preserve_colors', settings.preserve_colors)

    try {
      const response = await axios.post('/api/ppt/translate', formData)
      const newJobId = response.data.job_id
      setJobId(newJobId)
      trackProgress(newJobId)
    } catch (err) {
      setError('Error starting translation: ' + err.message)
      setProcessing(false)
    }
  }

  const trackProgress = (id) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await axios.get('/api/ppt/history?limit=5')
        const job = response.data.jobs?.find(j => j.id === id)
        if (!job) return

        const totalSel = job.settings_used?.selected_slides_count || selectedCount || job.total_slides
        if (totalSel > 0) {
          const pct = (job.slides_processed / totalSel) * 100
          setProgress(job.status === 'completed' ? 100 : Math.min(99, Math.round(pct)))
          setCurrentSlide(job.settings_used?.current_slide_index || job.slides_processed)
        }
        const detected = job.settings_used?.slides_detected
        if (detected) setSlidesDetected(detected)

        const methods = job.settings_used?.slide_methods || []
        const failedCount = job.settings_used?.failed_slides || 0
        setFailedSlides(failedCount)
        if (methods.length > 0) {
          setSlideMethods(methods)
          const offlineCount = methods.filter(s => s.method === 'offline').length
          const warns = []
          if (offlineCount > 0) warns.push(`⚠️ ${offlineCount} slide${offlineCount > 1 ? 's' : ''} translated offline (Helsinki-NLP).`)
          if (failedCount > 0) warns.push(`❌ ${failedCount} slide${failedCount > 1 ? 's' : ''} failed.`)
          setProgressWarning(warns.length ? warns.join(' ') : null)
        }

        if (job.status === 'completed') {
          setProgress(100)
          setProcessing(false)
          setTranslationCompleted(true)
          clearInterval(pollInterval)

          if (job.settings_used?.slide_methods) setSlideMethods(job.settings_used.slide_methods)

          const elapsedSec = job.settings_used?.elapsed_seconds || 0
          const timeStr = elapsedSec >= 60 ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s` : `${elapsedSec}s`
          const actualCost = job.settings_used?.total_cost
          const inputTok = job.settings_used?.total_input_tokens
          const outputTok = job.settings_used?.total_output_tokens
          const failCnt = job.settings_used?.failed_slides || 0
          const successCnt = job.slides_processed

          const lines = [`Translation completed in ${timeStr}`]
          if (actualCost !== undefined && actualCost > 0)
            lines.push(`Cost: $${actualCost.toFixed(3)} (${(inputTok || 0).toLocaleString()} in + ${(outputTok || 0).toLocaleString()} out tokens)`)
          if (failCnt > 0)
            lines.push(`${failCnt} slide${failCnt > 1 ? 's' : ''} failed — download contains ${successCnt} translated slide${successCnt > 1 ? 's' : ''}`)
          setProgressMessage(lines.join('\n'))

          if (autoDownload) {
            window.location.href = `${API_URL}/api/ppt/download/${id}`
          }

          // Refresh history
          axios.get('/api/ppt/history?limit=5').then(res => setHistory(res.data.jobs || [])).catch(() => {})

        } else if (job.status === 'failed') {
          setProcessing(false)
          setTranslationCompleted(false)
          clearInterval(pollInterval)
          setError('Translation failed: ' + job.error_message)
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }, 2000)

    setTimeout(() => { clearInterval(pollInterval); setProcessing(false); setProgress(100) }, 300000)
  }

  const handleDownload = () => { if (jobId) window.location.href = `${API_URL}/api/ppt/download/${jobId}` }

  const handleCancel = async () => {
    if (!jobId) return
    try {
      await axios.post(`/api/ppt/cancel/${jobId}`)
      setProcessing(false)
      setProgressMessage('Translation cancelled by user')
      setProgress(0)
    } catch (err) {
      setError('Failed to cancel translation')
    }
  }

  // --- Retry + Merge ---
  const handleRetry = () => {
    const failedIndices = slideMethods
      .filter(m => !m.method || m.method === 'unknown')
      .map(m => m.slide - 1)  // convert 1-based → 0-based

    setFirstJobId(jobId)
    setIsRetryMode(true)
    setSlides(prev => prev.map(s => ({ ...s, selected: failedIndices.includes(s.index) })))

    // Reset job state for new run
    setJobId(null)
    setProgressMessage('')
    setProgress(0)
    setTranslationCompleted(false)
    setSlideMethods([])
    setFailedSlides(0)
    setProgressWarning(null)
    setElapsed(0)
  }

  const handleMerge = async () => {
    setMerging(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('job_id_1', firstJobId)
      formData.append('job_id_2', jobId)
      const response = await axios.post('/api/ppt/merge', formData)
      window.location.href = `${API_URL}/api/ppt/download/${response.data.job_id}`
      setIsRetryMode(false)
      setFirstJobId(null)
    } catch (err) {
      setError('Error merging files: ' + (err.response?.data?.detail || err.message))
    } finally {
      setMerging(false)
    }
  }

  // --- Derived ---
  const isOcrFree = settings.provider === 'ocr_free'
  const isDimmed = processing ? 'opacity-30 pointer-events-none' : ''

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

        {/* Retry mode banner */}
        {isRetryMode && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center space-x-3">
            <span className="text-2xl">🔄</span>
            <div>
              <p className="text-sm font-semibold text-blue-800">Retry mode active</p>
              <p className="text-xs text-blue-700 mt-0.5">
                Only the {selectedCount} failed slide{selectedCount !== 1 ? 's' : ''} are selected.
                Start translation to retry them — then use Merge to combine with the original output.
              </p>
            </div>
          </div>
        )}

        {/* Upload + Settings */}
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 ${isDimmed}`}>

          {/* LEFT: Upload */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Presentation</h2>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                file ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pptx" className="hidden" />
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                {file ? (
                  <>
                    <p className="text-base font-medium text-gray-900 mb-1">{file.name}</p>
                    <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(1)} MB · {slides.length} slides · Click to change</p>
                  </>
                ) : (
                  <>
                    <p className="text-base font-medium text-gray-900 mb-1">Click or drag & drop</p>
                    <p className="text-sm text-gray-500">.pptx files only · max 100MB</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Translation Settings</h2>
            <div className="space-y-4">

              {/* A: Model cards */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Translation Model</label>
                <div className="grid grid-cols-3 gap-2">
                  {MODEL_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => handleModelSelect(opt.key)}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        modelKey === opt.key
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <p className="text-xs font-semibold text-gray-900 mb-1">{opt.name}</p>
                      <p className={`text-xs font-medium mb-1 ${opt.price === 'Free' ? 'text-green-600' : 'text-blue-600'}`}>{opt.price}</p>
                      <span className="text-xs text-gray-500 block">{opt.quality}</span>
                      <span className="text-xs text-gray-400">{opt.speed}</span>
                    </button>
                  ))}
                </div>
                {isOcrFree && (
                  <p className="mt-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2">
                    ⚠️ Free mode: text only, formatting is not preserved. Use Claude for full formatting.
                  </p>
                )}
              </div>

              {/* B: Languages with swap */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Languages</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex items-center mb-1 space-x-1">
                      <span className="text-xs text-gray-500">Source</span>
                      {detectedLang && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Auto-detected</span>}
                    </div>
                    <select
                      value={settings.source_lang}
                      onChange={(e) => { setDetectedLang(null); setSettings(prev => ({ ...prev, source_lang: e.target.value })) }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {LANGUAGES.filter(l => l.code !== 'en').map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  </div>

                  <button
                    onClick={handleSwapLangs}
                    className="mt-5 p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors"
                    title="Swap languages"
                  >⇄</button>

                  <div className="flex-1">
                    <span className="text-xs text-gray-500 block mb-1">Target</span>
                    <select
                      value={settings.target_lang}
                      onChange={(e) => setSettings(prev => ({ ...prev, target_lang: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* I: Auto-download */}
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDownload}
                  onChange={(e) => {
                    setAutoDownload(e.target.checked)
                    localStorage.setItem('ppt_auto_download', e.target.checked ? 'true' : 'false')
                  }}
                  className="rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-600">Download automatically when done</span>
              </label>

              {/* Cost estimate */}
              {selectedCount > 0 && (
                <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Slides selected:</span>
                    <span className="font-medium">{selectedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Est. time:</span>
                    <span className="font-medium">{timeLabel}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-blue-200">
                    <span className="font-semibold text-gray-900">Est. cost:</span>
                    <span className="font-bold text-blue-600">{cost === 0 ? 'Free' : `~$${cost.toFixed(2)}`}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Slides Selection */}
        {slides.length > 0 && (
          <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 ${isDimmed}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Select Slides
                <span className="ml-2 text-sm font-normal text-gray-500">({selectedCount} of {slides.length} selected)</span>
              </h2>
              <div className="flex items-center space-x-3">
                <button onClick={selectAll} className="text-sm text-blue-600 hover:text-blue-700">Select All</button>
                <span className="text-gray-300">•</span>
                <button onClick={deselectAll} className="text-sm text-blue-600 hover:text-blue-700">Deselect All</button>
              </div>
            </div>

            {/* H: Range selector */}
            <div className="flex items-center space-x-2 mb-3">
              <span className="text-xs text-gray-500">Select range:</span>
              <input
                type="number" min="1" max={slides.length}
                value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
                placeholder="From"
                className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="number" min="1" max={slides.length}
                value={rangeTo} onChange={e => setRangeTo(e.target.value)}
                placeholder="To"
                className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              />
              <button onClick={applyRange} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded border border-gray-300">
                Apply
              </button>
            </div>

            {/* G: Slide cards */}
            <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-3">
              <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {slides.map((slide) => (
                  <div
                    key={slide.index}
                    className={`relative border-2 rounded-lg p-2 cursor-pointer transition-all ${
                      slide.selected
                        ? 'border-blue-500 bg-blue-50 shadow-md'
                        : slide.has_image
                        ? 'border-teal-200 hover:border-teal-300 hover:shadow'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow'
                    }`}
                    onClick={() => toggleSlide(slide.index)}
                  >
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

                    <div className="aspect-video bg-gradient-to-br from-gray-50 to-gray-100 rounded relative overflow-hidden mb-1 flex items-center justify-center">
                      {slide.has_image
                        ? <ImageIcon className="w-5 h-5 text-teal-500" />
                        : <FileText className="w-5 h-5 text-gray-400" />
                      }
                    </div>
                    <p className="text-xs font-medium text-center text-gray-600">#{slide.index + 1}</p>
                    <p className="text-xs text-center" style={{ fontSize: '9px', color: slide.has_image ? '#0d9488' : '#9ca3af' }}>
                      {slide.has_image ? '🖼' : '📄'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* D: Pre-translation summary */}
        {slides.length > 0 && selectedCount > 0 && !processing && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-3 mb-4 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-4 text-sm text-gray-600 flex-wrap gap-y-1">
              <span className="font-medium text-gray-800">{selectedCount} slide{selectedCount !== 1 ? 's' : ''}</span>
              <span className="text-gray-300">·</span>
              <span>{LANG_FLAGS[settings.source_lang]} {LANG_NAMES[settings.source_lang]} → {LANG_FLAGS[settings.target_lang]} {LANG_NAMES[settings.target_lang]}</span>
              <span className="text-gray-300">·</span>
              <span>{MODEL_OPTIONS.find(m => m.key === modelKey)?.name}</span>
              {cost > 0 && <><span className="text-gray-300">·</span><span className="text-blue-600 font-medium">~${cost.toFixed(2)}</span></>}
              {timeLabel && <><span className="text-gray-300">·</span><span>{timeLabel}</span></>}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-center space-x-3 mb-6">
          <button
            onClick={handleTranslate}
            disabled={!file || selectedCount === 0 || processing}
            className="flex items-center space-x-2 bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{processing ? 'Processing...' : isRetryMode ? 'Retry Failed Slides' : 'Start Translation'}</span>
          </button>

          {processing && jobId && (
            <button
              onClick={handleCancel}
              className="flex items-center space-x-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-all"
            >
              <span>✕ Cancel</span>
            </button>
          )}

          {jobId && !processing && translationCompleted && (
            <button
              onClick={handleDownload}
              className="flex items-center space-x-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-all"
            >
              <Download size={18} />
              <span>Download Result</span>
            </button>
          )}

          {isRetryMode && firstJobId && jobId && !processing && translationCompleted && (
            <button
              onClick={handleMerge}
              disabled={merging}
              className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-all"
            >
              <span>{merging ? '⏳ Merging...' : '🔀 Merge & Download'}</span>
            </button>
          )}
        </div>

        {/* Post-translation summary */}
        {jobId && !processing && progressMessage && (() => {
          const isSuccess = translationCompleted && failedSlides === 0
          const isPartial = translationCompleted && failedSlides > 0
          const style = isSuccess ? 'bg-green-50 border-green-300 text-green-800'
            : isPartial ? 'bg-orange-50 border-orange-300 text-orange-800'
            : 'bg-red-50 border-red-300 text-red-800'
          return (
            <div className="mb-4 flex justify-center">
              <div className={`p-4 border rounded-xl w-full max-w-2xl text-center ${style}`}>
                <p className="text-sm font-medium whitespace-pre-line">{progressMessage}</p>
              </div>
            </div>
          )
        })()}

        {/* K: Retry failed slides banner */}
        {jobId && !processing && translationCompleted && failedSlides > 0 && !isRetryMode && (
          <div className="mb-4 flex justify-center">
            <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 max-w-2xl w-full flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-yellow-800">
                  {failedSlides} slide{failedSlides > 1 ? 's' : ''} failed
                </p>
                <p className="text-xs text-yellow-700 mt-0.5">
                  Retry only the failed slides to save cost — you'll pay only for those.
                  Results will be merged into a single file.
                </p>
              </div>
              <button
                onClick={handleRetry}
                className="flex-shrink-0 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-lg transition-all"
              >
                🔄 Retry {failedSlides} failed slide{failedSlides > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* E: Progress card (center stage) */}
        {processing && (
          <div ref={progressRef} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-sm font-semibold text-gray-900">
                  {slidesDetected > 0
                    ? `Processing slide ${currentSlide} of ${slidesDetected}`
                    : progressMessage || 'Processing...'}
                </span>
              </div>
              <div className="flex items-center space-x-4 text-sm">
                {/* F: Elapsed timer */}
                <span className="text-gray-400">Running for {formatElapsed(elapsed)}</span>
                <span className="font-semibold text-gray-700">{Math.round(progress)}%</span>
              </div>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden mt-3">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {progressWarning && (
              <div className="mt-3 p-3 bg-orange-50 border border-orange-300 rounded-lg flex items-start gap-2">
                <span className="text-orange-500 flex-shrink-0">⚠️</span>
                <p className="text-xs text-orange-800">{progressWarning}</p>
              </div>
            )}
          </div>
        )}

        {/* Detailed slide status */}
        {jobId && !processing && slideMethods.length > 0 && (
          <details className="mb-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-blue-600 mb-2 select-none">
              View detailed slide status ({slideMethods.length} slides)
            </summary>
            <div className="mt-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Slide', 'Status', 'Method', 'Error'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {slideMethods.map((slide, idx) => {
                    const isOffline = slide.method === 'offline'
                    const isFailed = !slide.method || slide.method === 'unknown'
                    return (
                      <tr key={idx} className={isFailed ? 'bg-red-50' : isOffline ? 'bg-orange-50' : ''}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">#{slide.slide}</td>
                        <td className="px-4 py-3 text-sm">
                          {!isFailed && !isOffline && <span className="text-green-600 font-medium">Success</span>}
                          {isOffline && <span className="text-orange-600 font-medium">Offline fallback</span>}
                          {isFailed && <span className="text-red-600 font-medium">Failed</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{slide.model || slide.method || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{slide.error || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {/* J: Translation history */}
        {history.length > 0 && (
          <details open={showHistory} onToggle={e => setShowHistory(e.target.open)} className="mb-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-blue-600 mb-2 select-none">
              Recent translations ({history.length})
            </summary>
            <div className="mt-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Date', 'File', 'Slides', 'Provider', 'Cost', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {history.map(job => {
                    const cost = job.settings_used?.total_cost
                    const date = job.created_at ? new Date(job.created_at).toLocaleDateString() : '—'
                    return (
                      <tr key={job.id} className={job.status === 'failed' ? 'bg-red-50' : ''}>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{date}</td>
                        <td className="px-4 py-3 text-xs text-gray-700 max-w-[140px] truncate" title={job.input_filename}>{job.input_filename}</td>
                        <td className="px-4 py-3 text-xs text-gray-700">{job.slides_processed ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{job.provider || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-700">
                          {cost !== undefined && cost !== null ? `$${Number(cost).toFixed(3)}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {job.status === 'completed' && (
                            <button
                              onClick={() => { window.location.href = `${API_URL}/api/ppt/download/${job.id}` }}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center space-x-1"
                            >
                              <Download size={12} /><span>Download</span>
                            </button>
                          )}
                          {job.status === 'failed' && <span className="text-xs text-red-500">Failed</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}

      </div>
    </div>
  )
}
