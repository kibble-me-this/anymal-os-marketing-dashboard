import { useState } from 'react'
import { MARKETING_API, headers } from '../config'

const JOBS = [
  { id: 'research', label: 'Research Agent', desc: 'Scrapes Reddit + RSS, generates topic brief', endpoint: '/research/run', method: 'POST' },
  { id: 'content', label: 'Content Agent', desc: 'Generates drafts for all 5 channels from today\'s brief', endpoint: '/content/run', method: 'POST' },
]

export default function PipelineControl() {
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState({})

  const runJob = async (job) => {
    setLoading(l => ({ ...l, [job.id]: true }))
    setResults(r => ({ ...r, [job.id]: null }))
    try {
      const res = await fetch(`${MARKETING_API}${job.endpoint}`, { method: job.method, headers })
      const data = await res.json()
      setResults(r => ({ ...r, [job.id]: { success: true, data } }))
    } catch (err) {
      setResults(r => ({ ...r, [job.id]: { success: false, error: err.message } }))
    }
    setLoading(l => ({ ...l, [job.id]: false }))
  }

  return (
    <div>
      <h1 style={{ fontSize: '14px', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 20px 0', color: '#00e676' }}>Pipeline Control</h1>
      <p style={{ fontSize: '12px', color: '#4a7a5a', marginBottom: '24px' }}>
        Scheduled runs: Research at 8AM CT | Content at 9AM CT | Post generation at 6PM CT (Tue/Wed)
      </p>

      {JOBS.map(job => (
        <div key={job.id} style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '16px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div>
              <p style={{ fontSize: '13px', color: '#e0ffe0', margin: '0 0 4px 0', fontWeight: '500' }}>{job.label}</p>
              <p style={{ fontSize: '12px', color: '#4a7a5a', margin: 0 }}>{job.desc}</p>
            </div>
            <button onClick={() => runJob(job)} disabled={loading[job.id]}
              style={{ padding: '8px 20px', background: loading[job.id] ? '#1a3a2a' : 'transparent', color: '#00e676', border: '1px solid #00e676', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: loading[job.id] ? 'not-allowed' : 'pointer', fontFamily: 'IBM Plex Sans, monospace', whiteSpace: 'nowrap' }}>
              {loading[job.id] ? 'Running...' : 'Run Now'}
            </button>
          </div>
          {results[job.id] && (
            <div style={{ background: results[job.id].success ? '#0a2a1a' : '#2a0a0a', border: `1px solid ${results[job.id].success ? '#00e676' : '#ff4444'}`, borderRadius: '4px', padding: '10px', marginTop: '8px' }}>
              <pre style={{ fontSize: '11px', color: results[job.id].success ? '#00e676' : '#ff4444', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(results[job.id].success ? results[job.id].data : results[job.id].error, null, 2).slice(0, 500)}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
