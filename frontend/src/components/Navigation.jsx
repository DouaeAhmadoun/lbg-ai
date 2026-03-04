import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FileText, Table, History, Settings, Sun, Moon } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import lbgLogo from '../assets/logo.jpeg'

export default function Navigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAdmin, logout, pageGuardActive, darkMode, toggleDarkMode } = useApp()

  const navItems = [
    { path: '/ppt', label: 'PPT Translation', icon: FileText },
    { path: '/excel', label: 'Excel Shipment', icon: Table },
    { path: '/history', label: 'History', icon: History },
    { path: '/admin', label: 'Admin', icon: Settings },
  ]

  const handleNavClick = (e, path) => {
    if (pageGuardActive && location.pathname !== path) {
      e.preventDefault()
      if (window.confirm('You have unsaved data that will be lost if you navigate away. Are you sure you want to leave?')) {
        navigate(path)
      }
    }
  }

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <a
              href="https://lbg-ai.douaeahmadoun.com/"
              className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
            >
              <img src={lbgLogo} alt="LBG" className="h-8 w-8 rounded-full object-cover" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                LBG AI Automation Hub
              </h1>
            </a>

            <div className="flex space-x-4">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  onClick={(e) => handleNavClick(e, path)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === path
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {isAdmin && (
              <button
                onClick={logout}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
