import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FileText, Table, History, Settings } from 'lucide-react'
import { useApp } from '../contexts/AppContext'

export default function Navigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAdmin, logout, pageGuardActive } = useApp()

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
    <nav className="bg-white shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <h1 className="text-xl font-bold text-gray-900">
              LBG AI Automation Hub
            </h1>

            <div className="flex space-x-4">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  onClick={(e) => handleNavClick(e, path)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === path
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={logout}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Logout
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
