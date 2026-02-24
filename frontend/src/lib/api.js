const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api/v1'

async function handle(res) {
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
  }
  return res.json()
}

export const api = {
  generateInitial(prompt) {
    return fetch(`${API_BASE}/generate-initial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    }).then(handle)
  },
  refine(payload) {
    return fetch(`${API_BASE}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(handle)
  },
  generateSql(schema) {
    return fetch(`${API_BASE}/generate-sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema })
    }).then(handle)
  }
}
