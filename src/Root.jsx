import { useEffect, useState } from 'react'
import App from './App.jsx'
import GateScanner from './pages/GateScanner.jsx'

function getCurrentRoute() {
  return window.location.pathname === '/gate' || window.location.hash === '#/gate' ? 'gate' : 'app'
}

export default function Root() {
  const [route, setRoute] = useState(getCurrentRoute)

  useEffect(() => {
    const handleRouteChange = () => setRoute(getCurrentRoute())
    window.addEventListener('hashchange', handleRouteChange)
    window.addEventListener('popstate', handleRouteChange)

    return () => {
      window.removeEventListener('hashchange', handleRouteChange)
      window.removeEventListener('popstate', handleRouteChange)
    }
  }, [])

  return route === 'gate' ? <GateScanner /> : <App />
}
