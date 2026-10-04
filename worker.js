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
  const bank = ["Tunai", "Mandiri", "BCA", "BSI", "BRI", "CIMB", "SeaBank", "GoPay", "DANA", "Lainnya"].includes(body.bank) ? body.bank : "Tunai";
  return { book: body.book, kind: body.kind, amount, note: String(body.note || "Transaksi").slice(0, 160), category: String(body.category || "Umum").slice(0, 60), bank, occurredAt: /^\d{4}-\d{2}-\d{2}$/.test(body.occurredAt) ? body.occurredAt : today() };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url); const path = url.pathname;
    try {
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
        const bank = ["Mandiri", "BCA", "BSI", "BRI", "CIMB", "SeaBank", "GoPay", "DANA", "Tunai", "Lainnya"].includes(body.bank) ? body.bank : "Mandiri";
        await env.DB.prepare("INSERT OR IGNORE INTO transactions (id,book,kind,amount,note,category,bank,occurred_at,source,source_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,"wifi","income",amount,note,"Pembayaran WiFi",bank,occurredAt,"wifi-sheet",paymentId,stamp,stamp).run();
        const row = await env.DB.prepare("SELECT id, source_key AS sourceKey FROM transactions WHERE source_key=?").bind(paymentId).first();
        return json({ ok: true, duplicate: row?.id !== id, id: row?.id });
      }

      if (path.startsWith("/api/") && !(await authorized(request, env))) return json({ error: "Silakan login" }, 401);
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
