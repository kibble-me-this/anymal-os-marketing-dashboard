import { useState, useEffect } from 'react'
import { MARKETING_API, headers } from '../config'

export default function ResearchBrief() {
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  const fetchBrief = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${MARKETING_API}/research/brief`, { headers })
      const data = await res.json()
      setBrief(data.status === 'not_ready' ? null : data)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const runResearch = async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch(`${MARKETING_API}/research/run`, { method: 'POST', headers })
      const data = await res.json()
      setBrief(data.brief)
    } catch (err) {
      setError(err.message)
    }
    setRunning(false)
  }

  useEffect(() => { fetchBrief() }, [])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '14px', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0, color: '#00e676' }}>Today's Research Brief</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={runResearch} disabled={running}
            style={{ padding: '8px 16px', background: 'transparent', color: '#00e676', border: '1px solid #00e676', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'IBM Plex Sans, monospace' }}>
            {running ? 'Running...' : 'Re-run Research'}
          </button>
          <button onClick={fetchBrief}
            style={{ padding: '8px 16px', background: 'transparent', color: '#00e676', border: '1px solid #00e676', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'IBM Plex Sans, monospace' }}>
            Refresh
          </button>
        </div>
      </div>

      {error && <div style={{ background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '4px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#ff4444' }}>{error}</div>}

      {loading ? (
        <p style={{ color: '#4a7a5a', fontSize: '13px' }}>Loading brief...</p>
      ) : !brief ? (
        <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '24px', textAlign: 'center' }}>
          <p style={{ color: '#4a7a5a', fontSize: '13px', marginBottom: '16px' }}>No brief generated yet today. The research agent runs at 8AM CT.</p>
          <button onClick={runResearch} disabled={running}
            style={{ padding: '10px 24px', background: '#00e676', color: '#021a0e', border: 'none', borderRadius: '4px', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'IBM Plex Sans, monospace', fontWeight: '600' }}>
            Run Now
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {[
              { label: 'Date', value: brief.date },
              { label: 'Items Scraped', value: brief.total_items_scraped },
              { label: 'Qualified', value: brief.qualified_items },
              { label: 'Topics Selected', value: brief.topics?.length },
            ].map(m => (
              <div key={m.label} style={{ background: '#031808', border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px 16px', minWidth: '120px' }}>
                <p style={{ fontSize: '10px', color: '#4a7a5a', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.label}</p>
                <p style={{ fontSize: '20px', color: '#00e676', margin: 0, fontWeight: '500' }}>{m.value}</p>
              </div>
            ))}
          </div>

          {brief.topics?.map((topic, i) => (
            <div key={i} style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '16px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: '#0a2a1a', color: '#00e676', border: '1px solid #00e676', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{topic.stakeholder}</span>
                    <span style={{ fontSize: '10px', color: '#4a7a5a' }}>{topic.angle}</span>
                    <span style={{ fontSize: '10px', color: '#4a7a5a' }}>score: {topic.total_score}</span>
                  </div>
                  <a href={topic.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '14px', color: '#e0ffe0', textDecoration: 'none', fontWeight: '500', lineHeight: 1.4, display: 'block', marginBottom: '6px' }}>
                    {topic.title} ↗
                  </a>
                  <p style={{ fontSize: '12px', color: '#4a7a5a', margin: '0 0 8px 0' }}>via {topic.source}</p>
                  <p style={{ fontSize: '13px', color: '#a0c0a0', margin: 0, lineHeight: 1.5 }}>{topic.why_it_matters}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
