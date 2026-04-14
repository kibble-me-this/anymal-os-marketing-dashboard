import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { DASHBOARD_PASSWORD } from './config'
import CampaignDashboard from './pages/CampaignDashboard'
import ResearchBrief from './pages/ResearchBrief'
import PipelineControl from './pages/PipelineControl'

const NAV_STYLE = {
  fontFamily: 'IBM Plex Sans, monospace',
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '6px 14px',
  borderRadius: '4px',
  textDecoration: 'none',
  border: '1px solid #00e676',
  color: '#00e676',
  background: 'transparent',
}

const NAV_ACTIVE = { ...NAV_STYLE, background: '#00e676', color: '#021a0e' }

export default function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [passInput, setPassInput] = useState('')
  const [passError, setPassError] = useState('')

  useEffect(() => {
    if (sessionStorage.getItem('mkt_auth') === 'true') setAuthenticated(true)
  }, [])

  const handleAuth = () => {
    if (passInput === DASHBOARD_PASSWORD) {
      setAuthenticated(true)
      sessionStorage.setItem('mkt_auth', 'true')
    } else {
      setPassError('Invalid access code')
      setPassInput('')
    }
  }

  if (!authenticated) {
    return (
      <div style={{ background: '#021a0e', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'IBM Plex Sans, monospace' }}>
        <div style={{ border: '1px solid #00e676', padding: '40px', borderRadius: '8px', width: '320px' }}>
          <p style={{ color: '#00e676', fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '24px' }}>Anymal OS -- Marketing Dashboard</p>
          <input
            type="password"
            placeholder="Access code"
            value={passInput}
            onChange={e => setPassInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid #00e676', color: '#00e676', fontFamily: 'IBM Plex Sans, monospace', fontSize: '13px', borderRadius: '4px', boxSizing: 'border-box', marginBottom: '12px' }}
          />
          {passError && <p style={{ color: '#ff4444', fontSize: '12px', marginBottom: '12px' }}>{passError}</p>}
          <button onClick={handleAuth} style={{ width: '100%', padding: '10px', background: '#00e676', color: '#021a0e', border: 'none', fontFamily: 'IBM Plex Sans, monospace', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: '4px' }}>
            Enter
          </button>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <div style={{ background: '#021a0e', minHeight: '100vh', fontFamily: 'IBM Plex Sans, monospace', color: '#00e676' }}>
        <div style={{ borderBottom: '1px solid #1a3a2a', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '24px' }}>
          <span style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.6 }}>Anymal OS -- Marketing</span>
          <nav style={{ display: 'flex', gap: '8px' }}>
            <NavLink to="/" end style={({ isActive }) => isActive ? NAV_ACTIVE : NAV_STYLE}>Campaigns</NavLink>
            <NavLink to="/brief" style={({ isActive }) => isActive ? NAV_ACTIVE : NAV_STYLE}>Today's Brief</NavLink>
            <NavLink to="/pipeline" style={({ isActive }) => isActive ? NAV_ACTIVE : NAV_STYLE}>Pipeline</NavLink>
          </nav>
        </div>
        <div style={{ padding: '24px' }}>
          <Routes>
            <Route path="/" element={<CampaignDashboard />} />
            <Route path="/brief" element={<ResearchBrief />} />
            <Route path="/pipeline" element={<PipelineControl />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
