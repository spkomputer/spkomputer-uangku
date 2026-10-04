const $ = s => document.querySelector(s);
const rupiah = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
const books = {
  pribadi: ['Pribadi', '👤', '#7557dd'],
  servis: ['Servis', '🔧', '#2478ee'],
  rental: ['Rental', '💻', '#e97827'],
  wifi: ['WiFi', '⌁', '#13a383']
};
let rows = [], kind = 'income', editing = null, deferredPrompt = null;

const api = async (path, opt = {}) => {
  const r = await fetch(path, { ...opt, headers: { 'content-type': 'application/json', ...(opt.headers || {}) } });
  const j = await r.json();
  if (r.status === 401 && path !== '/api/login') { showLogin(); throw Error('Silakan login'); }
  if (!r.ok) throw Error(j.error || 'Gagal');
  return j;
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = m => { const e = $('#toast'); e.textContent = m; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2200); };
const monthNow = () => new Date().toISOString().slice(0, 7);
const sum = (list, type) => list.filter(x => x.kind === type).reduce((total, x) => total + x.amount, 0);

function showLogin() { $('#login').hidden = false; $('#app').hidden = true; }
function showApp() { $('#login').hidden = true; $('#app').hidden = false; load(); }
async function load() { try { rows = await api('/api/transactions'); render(); } catch (e) { toast(e.message); } }

function render() {
  const current = rows.filter(x => x.occurredAt.startsWith(monthNow()));
  const inc = sum(current, 'income'), exp = sum(current, 'expense');
  $('#income').textContent = rupiah(inc);
  $('#expense').textContent = rupiah(exp);
  $('#balance').textContent = rupiah(inc - exp);
  $('#wallets').innerHTML = Object.entries(books).map(([id, b]) => {
    const total = current.filter(x => x.book === id).reduce((s, x) => s + (x.kind === 'income' ? x.amount : -x.amount), 0);
    return `<button class="wallet" data-book="${id}"><i style="background:${b[2]}">${b[1]}</i><b>${b[0]}</b><small>${rupiah(total)}</small></button>`;
  }).join('');
  if (!$('#reportMonth').value) $('#reportMonth').value = monthNow();
  filterRows(); renderRecap(); renderEvaluation();
}

function filterRows() {
  const q = $('#search').value.toLowerCase(), f = $('#filter').value;
  const list = rows.filter(x => (f === 'semua' || x.book === f) && `${x.note} ${x.bank || ''} ${x.category || ''}`.toLowerCase().includes(q));
  $('#list').innerHTML = list.length ? list.map(x => {
    const b = books[x.book];
    return `<article class="tx"><span class="tx-icon" style="background:${b[2]}">${b[1]}</span><div class="tx-main"><b>${esc(x.note)}</b><small>${b[0]} · ${new Date(x.occurredAt + 'T00:00:00').toLocaleDateString('id-ID')}</small><div class="tx-tags"><small class="bank-tag">${x.bank === 'Tunai' ? '💵' : '🏦'} ${esc(x.bank || 'Tunai')}</small><small class="category-tag">${esc(x.category || 'Umum')}</small></div></div><div class="tx-side"><b class="${x.kind}">${x.kind === 'income' ? '+' : '−'}${rupiah(x.amount)}</b><div class="actions"><button class="edit" data-edit="${x.id}" aria-label="Edit">✎</button><button class="delete" data-delete="${x.id}" aria-label="Hapus">⌫</button></div></div></article>`;
  }).join('') : '<div class="empty">Belum ada transaksi</div>';
}

function breakdown(data, target) {
  const items = Object.entries(data).sort((a, b) => (b[1].income + b[1].expense) - (a[1].income + a[1].expense));
  const max = Math.max(1, ...items.map(([, v]) => v.income + v.expense));
  $(target).innerHTML = items.length ? items.map(([name, v]) => `<article class="breakdown-row"><div><b>${esc(name)}</b><small>Masuk ${rupiah(v.income)} · Keluar ${rupiah(v.expense)}</small></div><strong>${rupiah(v.income - v.expense)}</strong><span><i style="width:${Math.max(4, Math.round((v.income + v.expense) / max * 100))}%"></i></span></article>`).join('') : '<div class="empty">Belum ada data bulan ini</div>';
}

function renderRecap() {
  const month = $('#reportMonth').value || monthNow();
  const list = rows.filter(x => x.occurredAt.startsWith(month));
  const inc = sum(list, 'income'), exp = sum(list, 'expense');
  $('#recapIncome').textContent = rupiah(inc); $('#recapExpense').textContent = rupiah(exp); $('#recapBalance').textContent = rupiah(inc - exp);
  const banks = {}, wallets = {};
  list.forEach(x => {
    const bank = x.bank || 'Tunai', book = books[x.book]?.[0] || x.book;
    banks[bank] ||= { income: 0, expense: 0 }; wallets[book] ||= { income: 0, expense: 0 };
    banks[bank][x.kind] += x.amount; wallets[book][x.kind] += x.amount;
  });
  breakdown(banks, '#bankRecap'); breakdown(wallets, '#bookRecap');
}

function renderEvaluation() {
  const month = $('#reportMonth').value || monthNow();
  const list = rows.filter(x => x.occurredAt.startsWith(month));
  const inc = sum(list, 'income'), exp = sum(list, 'expense');
  const ratio = inc ? Math.round(exp / inc * 100) : 0;
  let level = 'empty', status = 'Belum dapat dinilai', message = 'Catat pemasukan dan pengeluaran agar evaluasi lebih akurat.';
  if (inc > 0 && ratio <= 60) { level = 'good'; status = 'Hemat & sehat'; message = 'Pengeluaran masih terkendali dan ada ruang yang baik untuk menabung.'; }
  else if (inc > 0 && ratio <= 80) { level = 'fair'; status = 'Cukup bijak'; message = 'Keuangan cukup sehat, tetapi tetap awasi pengeluaran terbesar.'; }
  else if (inc > 0 && ratio <= 100) { level = 'warning'; status = 'Waspada'; message = 'Hampir seluruh pemasukan sudah terpakai. Tahan belanja yang bisa ditunda.'; }
  else if (inc > 0) { level = 'danger'; status = 'Boros / defisit'; message = 'Pengeluaran lebih besar daripada pemasukan. Perlu penghematan segera.'; }
  const card = $('#evaluationCard'); card.className = `evaluation-card ${level}`;
  $('#evaluationStatus').textContent = status; $('#evaluationMessage').textContent = message;
  $('#expenseRatio').textContent = inc ? `Pengeluaran ${ratio}% dari pemasukan · Sisa ${rupiah(inc - exp)}` : `Pengeluaran tercatat ${rupiah(exp)}`;
  $('#evaluationBar').style.width = `${Math.min(100, ratio)}%`;
  const cats = {};
  list.filter(x => x.kind === 'expense').forEach(x => { const c = x.category || 'Umum'; cats[c] = (cats[c] || 0) + x.amount; });
  const catData = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, { income: 0, expense: v }]));
  breakdown(catData, '#categoryRecap');
  const biggest = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  const tips = [];
  if (!inc) tips.push('Catat semua pemasukan agar penilaian tidak keliru.');
  if (biggest) tips.push(`Periksa kategori ${biggest[0]} karena paling besar: ${rupiah(biggest[1])}.`);
  if (ratio > 80) tips.push('Tunda pembelian alat atau belanja pribadi yang belum mendesak.');
  if (inc > exp) tips.push(`Pisahkan sisa ${rupiah(inc - exp)} untuk tabungan, hutang, atau dana darurat.`);
  if (!tips.length) tips.push('Belum ada cukup transaksi untuk memberikan saran.');
  $('#evaluationTips').innerHTML = tips.map(t => `<li>${esc(t)}</li>`).join('');
}

function showView(view) {
  document.querySelectorAll('.page').forEach(p => p.hidden = p.id !== `page-${view}`);
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view !== 'catat') { renderRecap(); renderEvaluation(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function detectBank(t) {
  const l = t.toLowerCase();
  return l.includes('mandiri') ? 'Mandiri' : l.includes('bca') ? 'BCA' : l.includes('bsi') ? 'BSI' : l.includes('bri') ? 'BRI' : /gopay|go pay/.test(l) ? 'GoPay' : /tunai|cash/.test(l) ? 'Tunai' : null;
}
function detectCategory(t) {
  const l = t.toLowerCase();
  if (l.includes('listrik')) return 'Listrik'; if (/\bair\b/.test(l)) return 'Air'; if (l.includes('hutang')) return 'Hutang';
  if (l.includes('parcel')) return 'Nabung Parcel'; if (l.includes('kompensasi')) return 'Kompensasi WiFi';
  if (/alat|kabel|router|ont|splicer|bahan/.test(l) && l.includes('wifi')) return 'Alat & Bahan WiFi';
  if (/operasional|transport|bensin/.test(l) && l.includes('wifi')) return 'Operasional WiFi';
  if (/tagihan|internet/.test(l) && l.includes('wifi')) return 'Tagihan WiFi';
  if (/servis|service/.test(l)) return 'Servis'; if (/rental|sewa/.test(l)) return 'Rental';
  return 'Umum';
}
function parseChat(t) {
  const l = t.toLowerCase(), m = l.replace(/rp\s?/g, '').match(/(\d+(?:[.,]\d+)?)\s*(jt|juta|rb|ribu|k)?/);
  let n = m ? Number(m[1].replace(',', '.')) : 0;
  if (['jt', 'juta'].includes(m?.[2])) n *= 1e6; if (['rb', 'ribu', 'k'].includes(m?.[2])) n *= 1e3;
  return { book: l.includes('wifi') ? 'wifi' : /rental|sewa/.test(l) ? 'rental' : /servis|service/.test(l) ? 'servis' : 'pribadi', kind: /keluar|bayar|beli|belanja|biaya/.test(l) ? 'expense' : 'income', amount: Math.round(n), note: t.replace(/\b(rp\s?)?\d+(?:[.,]\d+)?\s*(jt|juta|rb|ribu|k)?\b/i, '').trim() || 'Transaksi', bank: detectBank(t) || $('#chatBank').value, category: detectCategory(t), occurredAt: new Date().toISOString().slice(0, 10) };
}
function openForm(x = null) {
  editing = x?.id || null; kind = x?.kind || 'income'; $('#formTitle').textContent = x ? 'Edit transaksi' : 'Transaksi baru';
  $('#book').value = x?.book || 'servis'; $('#bank').value = x?.bank || 'Tunai'; $('#category').value = x?.category || 'Umum';
  $('#amount').value = x?.amount || ''; $('#note').value = x?.note || ''; $('#date').value = x?.occurredAt || new Date().toISOString().slice(0, 10);
  document.querySelectorAll('[data-kind]').forEach(b => b.classList.toggle('active', b.dataset.kind === kind)); $('#editor').showModal();
}

$('#loginForm').onsubmit = async e => { e.preventDefault(); const btn = e.submitter || $('#loginForm button'); $('#loginError').textContent = ''; btn.disabled = true; btn.textContent = 'Memeriksa…'; try { await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('#password').value }) }); showApp(); } catch (err) { $('#loginError').textContent = err.message || 'Tidak dapat masuk. Coba lagi.'; } finally { btn.disabled = false; btn.textContent = 'Masuk'; } };
$('#add').onclick = () => openForm(); $('#close').onclick = () => $('#editor').close(); $('#search').oninput = filterRows; $('#filter').onchange = filterRows; $('#reportMonth').onchange = () => { renderRecap(); renderEvaluation(); };
$('#chatForm').onsubmit = async e => { e.preventDefault(); const b = parseChat($('#chatInput').value); if (!b.amount) return toast('Nominal belum terbaca'); try { rows.unshift(await api('/api/transactions', { method: 'POST', body: JSON.stringify(b) })); $('#chatInput').value = ''; render(); toast(`Tercatat melalui ${b.bank}`); } catch (err) { toast(err.message); } };
$('#editForm').onsubmit = async e => { e.preventDefault(); const b = { id: editing, book: $('#book').value, kind, bank: $('#bank').value, category: $('#category').value, amount: Number($('#amount').value.replace(/\D/g, '')), note: $('#note').value, occurredAt: $('#date').value }; try { const x = await api('/api/transactions', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(b) }); rows = editing ? rows.map(r => r.id === x.id ? x : r) : [x, ...rows]; $('#editor').close(); render(); toast('Tersimpan'); } catch (err) { toast(err.message); } };
document.onclick = async e => {
  const view = e.target.closest('[data-view]')?.dataset.view; if (view) return showView(view);
  const k = e.target.dataset.kind; if (k) { kind = k; document.querySelectorAll('[data-kind]').forEach(b => b.classList.toggle('active', b.dataset.kind === kind)); }
  const id = e.target.dataset.edit; if (id) openForm(rows.find(x => x.id === id));
  const del = e.target.dataset.delete; if (del && confirm('Hapus transaksi ini?')) { try { await api('/api/transactions/remove', { method: 'POST', body: JSON.stringify({ id: del }) }); rows = rows.filter(x => x.id !== del); render(); toast('Transaksi dihapus'); } catch (err) { toast(err.message); } }
  const chip = e.target.dataset.text; if (chip) $('#chatInput').value = chip;
  const wallet = e.target.closest('[data-book]')?.dataset.book; if (wallet) { showView('catat'); $('#filter').value = wallet; filterRows(); }
};

const installButton = $('#install');
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; if (installButton) installButton.hidden = false; });
if (installButton) installButton.addEventListener('click', async () => { if (!deferredPrompt) return toast('Gunakan menu browser lalu pilih Instal aplikasi'); await deferredPrompt.prompt(); deferredPrompt = null; installButton.hidden = true; });
window.addEventListener('appinstalled', () => { if (installButton) installButton.hidden = true; toast('Uangku sudah terpasang'); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
fetch('/api/session').then(r => r.json()).then(x => x.authenticated ? showApp() : showLogin());
const logoutButton = $('#logout');
if (logoutButton) logoutButton.addEventListener('click', async () => { logoutButton.disabled = true; logoutButton.textContent = 'Keluar…'; try { const r = await fetch('/api/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); if (!r.ok) throw Error('Gagal keluar'); location.reload(); } catch (err) { logoutButton.disabled = false; logoutButton.textContent = 'Keluar'; toast(err.message); } });
