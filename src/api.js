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

function resource(base, payload) {
  return {
    list: () => request('GET', base),
    create: (item) => request('POST', base, payload(item)),
    save: (item, opts) => request('PUT', `${base}/${item.id}`, payload(item), opts),
    remove: (id) => request('DELETE', `${base}/${id}`),
  };
}

export const patternApi = resource('/api/patterns', ({ name, beats, bpm, tags, layers }) => ({
  name,
  beats,
  bpm,
  tags,
  layers,
}));

export const arrangementApi = resource('/api/arrangements', ({ name, tags, items }) => ({ name, tags, items }));
