import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function NotFound() {
  useEffect(() => { document.title = 'Page introuvable — LBG AI' }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <p className="text-9xl font-bold text-gray-200 dark:text-gray-700 mb-4 select-none">404</p>
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Page introuvable</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        Cette page n'existe pas ou a été déplacée.
      </p>
      <Link
        to="/ppt"
        className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
      >
        Retour à l'accueil
      </Link>
      <p className="mt-16 text-xs text-gray-400 dark:text-gray-600">
        Veuillez nous contacter sur{' '}
        <a
          href="https://douaeahmadoun.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-600 dark:hover:text-gray-400"
        >
          douaeahmadoun.com
        </a>
      </p>
    </div>
  )
}
