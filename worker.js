const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function makeSession(env) { const exp = Date.now() + 7 * 86400000; return `${exp}.${await hmac(env.SESSION_SECRET, String(exp))}`; }
async function authorized(request, env) {
  const token = (request.headers.get("cookie") || "").match(/(?:^|; )uangku_session=([^;]+)/)?.[1];
  if (!token) return false; const [exp, sig] = token.split(".");
  return Number(exp) > Date.now() && sig === await hmac(env.SESSION_SECRET, exp);
}
function clean(body) {
  const amount = Math.round(Number(body.amount));
  if (!["pribadi", "servis", "rental", "wifi"].includes(body.book) || !["income", "expense"].includes(body.kind) || !Number.isFinite(amount) || amount < 1) throw new Error("Data transaksi tidak valid");
  const bank = String(body.bank || "Tunai").trim().slice(0, 40) || "Tunai";
  return { book: body.book, kind: body.kind, amount, note: String(body.note || "Transaksi").slice(0, 160), category: String(body.category || "Umum").slice(0, 60), bank, occurredAt: /^\d{4}-\d{2}-\d{2}$/.test(body.occurredAt) ? body.occurredAt : today() };
}

function cleanAccount(body) {
  const name = String(body.name || "").trim().slice(0, 40), purpose = String(body.purpose || "").trim().slice(0, 120);
  const status = ["active", "optional", "inactive"].includes(body.status) ? body.status : "active";
  if (!name) throw new Error("Nama rekening wajib diisi");
  return { id: String(body.id || crypto.randomUUID()).slice(0, 80), name, purpose, status, sortOrder: Math.round(Number(body.sortOrder) || 99) };
}
function cleanTarget(body) {
  const name = String(body.name || "").trim().slice(0, 80), category = String(body.category || "Umum").trim().slice(0, 60);
  if (!name) throw new Error("Nama target wajib diisi");
  const targetAmount = Math.max(0, Math.round(Number(body.targetAmount) || 0)), savedAmount = Math.max(0, Math.round(Number(body.savedAmount) || 0));
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? body.dueDate : "";
  return { id: String(body.id || crypto.randomUUID()).slice(0, 80), name, category, icon: String(body.icon || "🎯").trim().slice(0, 8), sourceAccount: String(body.sourceAccount || "Mandiri").trim().slice(0, 40), status: body.status === "inactive" ? "inactive" : "active", sortOrder: Math.round(Number(body.sortOrder) || 99), targetAmount, savedAmount, dueDate };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url); const path = url.pathname;
    try {
      if (path === "/api/health" && request.method === "GET") {
        const wifi = await env.DB.prepare("SELECT COUNT(*) AS total FROM transactions WHERE source='wifi-sheet'").first();
        return json({ ok: true, release: "2026-10-06-wifi-sync", wifiSynced: Number(wifi?.total || 0) });
      }
      if (path === "/api/login" && request.method === "POST") {
        const { password } = await request.json();
        if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) return json({ error: "Password salah" }, 401);
        const token = await makeSession(env); return json({ ok: true }, 200, { "set-cookie": `uangku_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800` });
      }
      if (path === "/api/logout" && request.method === "POST") return json({ ok: true }, 200, { "set-cookie": "uangku_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict" });
      if (path === "/api/session") return json({ authenticated: await authorized(request, env) });

      if (path === "/api/sync/wifi" && request.method === "POST") {
        if (!env.WIFI_SYNC_KEY || request.headers.get("x-sync-key") !== env.WIFI_SYNC_KEY) return json({ error: "Tidak diizinkan" }, 401);
        const body = await request.json(); const paymentId = String(body.paymentId || "").trim(); const amount = Math.round(Number(body.amount));
        if (!paymentId || !amount) return json({ error: "Pembayaran tidak valid" }, 400);
        const id = crypto.randomUUID(); const stamp = now(); const occurredAt = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : today();
        const note = `Pembayaran WiFi ${String(body.customerName || body.customerId || "Pelanggan").slice(0, 80)} – ${String(body.period || "").slice(0, 30)}`;
        const bank = String(body.bank || "Mandiri").trim().slice(0, 40) || "Mandiri";
        await env.DB.prepare("INSERT OR IGNORE INTO transactions (id,book,kind,amount,note,category,bank,occurred_at,source,source_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,"wifi","income",amount,note,"Pembayaran WiFi",bank,occurredAt,"wifi-sheet",paymentId,stamp,stamp).run();
        const row = await env.DB.prepare("SELECT id, source_key AS sourceKey FROM transactions WHERE source_key=?").bind(paymentId).first();
        return json({ ok: true, duplicate: row?.id !== id, id: row?.id });
      }

      if (path.startsWith("/api/") && !(await authorized(request, env))) return json({ error: "Silakan login" }, 401);
      if (path === "/api/settings" && request.method === "GET") {
        const accounts = await env.DB.prepare("SELECT id,name,purpose,status,sort_order AS sortOrder FROM accounts ORDER BY sort_order,name").all();
        const targets = await env.DB.prepare("SELECT id,name,category,icon,source_account AS sourceAccount,status,sort_order AS sortOrder,target_amount AS targetAmount,saved_amount AS savedAmount,due_date AS dueDate FROM targets ORDER BY sort_order,name").all();
        return json({ accounts: accounts.results, targets: targets.results });
      }
      if (path === "/api/accounts" && request.method === "POST") {
        const b = cleanAccount(await request.json());
        await env.DB.prepare("INSERT INTO accounts (id,name,purpose,status,sort_order,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,purpose=excluded.purpose,status=excluded.status,sort_order=excluded.sort_order,updated_at=excluded.updated_at").bind(b.id,b.name,b.purpose,b.status,b.sortOrder,now()).run();
        return json(b);
      }
      if (path === "/api/targets" && request.method === "POST") {
        const b = cleanTarget(await request.json());
        await env.DB.prepare("INSERT INTO targets (id,name,category,icon,source_account,status,sort_order,target_amount,saved_amount,due_date,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,icon=excluded.icon,source_account=excluded.source_account,status=excluded.status,sort_order=excluded.sort_order,target_amount=excluded.target_amount,saved_amount=excluded.saved_amount,due_date=excluded.due_date,updated_at=excluded.updated_at").bind(b.id,b.name,b.category,b.icon,b.sourceAccount,b.status,b.sortOrder,b.targetAmount,b.savedAmount,b.dueDate,now()).run();
        return json(b);
      }
      if (path === "/api/transactions" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT id,book,kind,amount,note,category,bank,occurred_at AS occurredAt,source,source_key AS sourceKey,created_at AS createdAt FROM transactions ORDER BY occurred_at DESC, created_at DESC LIMIT 1000").all(); return json(results);
      }
      if (path === "/api/transactions" && request.method === "POST") {
        const b = clean(await request.json()); const id = crypto.randomUUID(); const stamp = now();
        await env.DB.prepare("INSERT INTO transactions (id,book,kind,amount,note,category,bank,occurred_at,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id,b.book,b.kind,b.amount,b.note,b.category,b.bank,b.occurredAt,"manual",stamp,stamp).run(); return json({ id, ...b, source:"manual", createdAt:stamp }, 201);
      }
      if (path === "/api/transactions" && request.method === "PUT") {
        const body = await request.json(); const b = clean(body); if (!body.id) return json({ error:"ID kosong" },400);
        await env.DB.prepare("UPDATE transactions SET book=?,kind=?,amount=?,note=?,category=?,bank=?,occurred_at=?,updated_at=? WHERE id=?").bind(b.book,b.kind,b.amount,b.note,b.category,b.bank,b.occurredAt,now(),body.id).run();
        return json(await env.DB.prepare("SELECT id,book,kind,amount,note,category,bank,occurred_at AS occurredAt,source,created_at AS createdAt FROM transactions WHERE id=?").bind(body.id).first());
      }
      if (path === "/api/transactions/remove" && request.method === "POST") {
        const { id } = await request.json(); if (!id) return json({ error:"ID kosong" },400); const result = await env.DB.prepare("DELETE FROM transactions WHERE id=?").bind(id).run(); return json({ ok:true, deleted:result.meta.changes });
      }
      return env.ASSETS.fetch(request);
    } catch (error) { console.error(error); return json({ error: error.message || "Terjadi kesalahan" }, 500); }
  }
};
