function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function isAdmin(request, env) {
  const got = request.headers.get('x-admin-key') || '';
  return !!env.ADMIN_KEY && got === env.ADMIN_KEY;
}

function rowToProduct(r) {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    paid: Number(r.paid_price || 0),
    list: r.list_price == null ? null : Number(r.list_price),
    grams: Number(r.package_grams || 0),
    a: Number(r.ratio_a || 0),
    b: Number(r.ratio_b || 0),
    ratioMethod: r.ratio_method || 'weight',
    density: r.density == null ? null : Number(r.density),
    shrink: r.shrinkage == null ? null : Number(r.shrinkage),
    shore: r.shore || '',
    workingMinutes: r.working_minutes == null ? null : Number(r.working_minutes),
    cureHours: r.cure_hours == null ? null : Number(r.cure_hours),
    maxPour: r.max_pour_mm == null ? null : Number(r.max_pour_mm),
    img: r.image_url || (r.image_key ? `/api/images/${encodeURIComponent(r.image_key)}` : ''),
    imageKey: r.image_key || '',
    notes: r.notes_json ? JSON.parse(r.notes_json) : [],
    sourceUrl: r.source_url || '',
    custom: !!r.custom,
  };
}

async function listProducts(env) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is not configured yet' }, 503);
  try {
    const { results } = await env.DB.prepare('SELECT * FROM products ORDER BY type,name').all();
    return json({ ok: true, products: results.map(rowToProduct) });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
}

async function saveProduct(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is not configured yet' }, 503);
  try {
    const p = await request.json();
    if (!p.id || !p.type || !p.name || !p.grams || !p.a || !p.b) {
      return json({ ok: false, error: 'missing required fields' }, 400);
    }
    await env.DB.prepare(`INSERT INTO products
      (id,type,name,paid_price,list_price,package_grams,ratio_a,ratio_b,ratio_method,density,shrinkage,shore,working_minutes,cure_hours,max_pour_mm,image_key,image_url,notes_json,source_url,custom,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
      type=excluded.type,name=excluded.name,paid_price=excluded.paid_price,list_price=excluded.list_price,
      package_grams=excluded.package_grams,ratio_a=excluded.ratio_a,ratio_b=excluded.ratio_b,
      ratio_method=excluded.ratio_method,density=excluded.density,shrinkage=excluded.shrinkage,shore=excluded.shore,
      working_minutes=excluded.working_minutes,cure_hours=excluded.cure_hours,max_pour_mm=excluded.max_pour_mm,
      image_key=excluded.image_key,image_url=excluded.image_url,notes_json=excluded.notes_json,
      source_url=excluded.source_url,custom=excluded.custom,updated_at=CURRENT_TIMESTAMP`)
      .bind(
        p.id, p.type, p.name, p.paid || 0, p.list ?? null, p.grams, p.a, p.b,
        p.ratioMethod || 'weight', p.density ?? null, p.shrink ?? null, p.shore || null,
        p.workingMinutes ?? null, p.cureHours ?? null, p.maxPour ?? null,
        p.imageKey || null, p.img || null, JSON.stringify(p.notes || []),
        p.sourceUrl || null, p.custom === false ? 0 : 1
      ).run();
    return json({ ok: true, id: p.id });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
}

async function deleteProduct(id, request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is not configured yet' }, 503);
  try {
    const row = await env.DB.prepare('SELECT image_key FROM products WHERE id=?').bind(id).first();
    if (row?.image_key && env.MEDIA) await env.MEDIA.delete(row.image_key);
    await env.DB.prepare('DELETE FROM products WHERE id=?').bind(id).run();
    return json({ ok: true, id });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
}

async function uploadImage(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.MEDIA) return json({ ok: false, error: 'R2 binding MEDIA is not configured yet' }, 503);
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ ok: false, error: 'file required' }, 400);
    if (!file.type.startsWith('image/')) return json({ ok: false, error: 'image only' }, 400);
    if (file.size > 2_000_000) return json({ ok: false, error: 'image too large; max 2MB' }, 413);
    const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
    const key = `products/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    await env.MEDIA.put(key, file.stream(), {
      httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
    });
    return json({ ok: true, key, url: `/api/images/${encodeURIComponent(key)}` });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
}

async function getImage(encodedKey, env) {
  if (!env.MEDIA) return new Response('R2 binding MEDIA is not configured yet', { status: 503 });
  const key = decodeURIComponent(encodedKey);
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers });
}

async function serveAsset(request, env) {
  const asset = await env.ASSETS.fetch(request);
  const type = asset.headers.get('content-type') || '';
  if (request.method === 'GET' && type.includes('text/html')) {
    const text = await asset.text();
    const html = text.includes('cloud.js')
      ? text
      : text.replace('</body>', '<script src="/cloud.js"></script></body>');
    const headers = new Headers(asset.headers);
    headers.delete('content-length');
    headers.set('Cache-Control', 'no-store');
    return new Response(html, {
      status: asset.status,
      statusText: asset.statusText,
      headers,
    });
  }
  return asset;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/products') {
      if (request.method === 'GET') return listProducts(env);
      if (request.method === 'POST') return saveProduct(request, env);
      return new Response('Method not allowed', { status: 405 });
    }

    if (path.startsWith('/api/products/') && request.method === 'DELETE') {
      const id = decodeURIComponent(path.slice('/api/products/'.length));
      return deleteProduct(id, request, env);
    }

    if (path === '/api/images' && request.method === 'POST') {
      return uploadImage(request, env);
    }

    if (path.startsWith('/api/images/') && request.method === 'GET') {
      return getImage(path.slice('/api/images/'.length), env);
    }

    return serveAsset(request, env);
  },
};
