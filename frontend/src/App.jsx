import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './contexts/AppContext'
import Navigation from './components/Navigation'
import PptTranslation from './pages/PptTranslation'
import ExcelShipment from './pages/ExcelShipment'
import Admin from './pages/Admin'
import History from './pages/History'
import './index.css'

function App() {
  return (
    <Router>
      <AppProvider>
        <div className="min-h-screen bg-gray-50">
          <Navigation />
          <main className="container mx-auto px-4 py-8">
            <Routes>
              <Route path="/" element={<Navigate to="/ppt" replace />} />
              <Route path="/ppt" element={<PptTranslation />} />
              <Route path="/excel" element={<ExcelShipment />} />
              <Route path="/history" element={<History />} />
              <Route path="/admin" element={<Admin />} />
            </Routes>
          </main>
        </div>
      </AppProvider>
    </Router>
  )
}

export default App
