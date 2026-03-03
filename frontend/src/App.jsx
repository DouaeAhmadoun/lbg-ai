import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './contexts/AppContext'
import Navigation from './components/Navigation'
import PptTranslation from './pages/PptTranslation'
import ExcelShipment from './pages/ExcelShipment'
import Admin from './pages/Admin'
import History from './pages/History'
import NotFound from './pages/NotFound'
import './index.css'

function AppContent() {
  const { backendDown } = useApp()
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 flex flex-col">
      <Navigation />
      {backendDown && (
        <div className="bg-red-600 text-white text-sm text-center py-2 px-4">
          ⚠️ Impossible de contacter le serveur — vérifiez que le backend est démarré.
        </div>
      )}
      <main className="container mx-auto px-4 py-8 flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/ppt" replace />} />
          <Route path="/ppt" element={<PptTranslation />} />
          <Route path="/excel" element={<ExcelShipment />} />
          <Route path="/history" element={<History />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="text-center py-5 text-xs text-gray-400 dark:text-gray-600 border-t border-gray-200 dark:border-gray-800">
        Developed by{' '}
        <a
          href="https://douaeahmadoun.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600 dark:hover:text-gray-400 underline font-medium"
        >
          DA Consulting
        </a>
      </footer>
    </div>
  )
}

function App() {
  return (
    <Router>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </Router>
  )
}

export default App
