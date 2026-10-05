async function request(method, url, body, { keepalive = false } = {}) {
  const res = await fetch(url, {
    method,
    keepalive,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}`);
  return res.status === 204 ? null : res.json();
}

const payload = ({ name, beats, bpm, layers }) => ({ name, beats, bpm, layers });

export const api = {
  list: () => request('GET', '/api/patterns'),
  create: (pattern) => request('POST', '/api/patterns', payload(pattern)),
  save: (pattern, opts) => request('PUT', `/api/patterns/${pattern.id}`, payload(pattern), opts),
  remove: (id) => request('DELETE', `/api/patterns/${id}`),
};
