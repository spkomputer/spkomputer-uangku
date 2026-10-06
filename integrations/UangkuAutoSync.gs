/**
 * Tambahkan sebagai file UangkuAutoSync.gs di Apps Script rekap WiFi.
 * Project Settings > Script properties:
 * UANGKU_SYNC_KEY = sama dengan secret WIFI_SYNC_KEY di Cloudflare
 * UANGKU_TRANSFER_BANK = bank untuk metode "Transfer" (hanya jika semua Transfer memakai bank yang sama).
 * Jika Transfer menggunakan beberapa bank, isi nama bank sebenarnya pada kolom Metode.
 * Jalankan uangkuPasangOtomatis10Menit sekali dan izinkan akses.
 * Tidak mengubah/menghapus transaksi; ID Bayar yang sama tidak ditambahkan dua kali.
 */
function uangkuPasangOtomatis10Menit() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('UANGKU_SYNC_KEY')) throw new Error('Isi Script property UANGKU_SYNC_KEY dahulu.');
  uangkuSinkron10Menit(); // Uji koneksi sebelum memasang pemicu.
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'uangkuSinkron10Menit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('uangkuSinkron10Menit').timeBased().everyMinutes(10).create();
}
function uangkuSinkron10Menit() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const p = PropertiesService.getScriptProperties();
    const key = p.getProperty('UANGKU_SYNC_KEY');
    if (!key) throw new Error('UANGKU_SYNC_KEY belum diatur.');
    const ss = SpreadsheetApp.openById('1gi1Q5C_uwPLxEPFTbhIiVzJ-QzKg3lc_OegCnuDFamc');
    const sheet = ss.getSheetByName('Pembayaran');
    if (!sheet) throw new Error('Tab Pembayaran tidak ditemukan.');
    const rows = sheet.getDataRange().getValues().slice(1).filter(r => String(r[0]).trim());
    if (!rows.length) return;
    let cursor = Number(p.getProperty('UANGKU_CURSOR') || 0) % rows.length;
    const start = Date.now();
    let sent = 0;
    for (let n = 0; n < Math.min(rows.length, 50); n++) {
      if (Date.now() - start > 240000) break;
      const r = rows[cursor];
      const method = String(r[7] || '').trim();
      const bank = /^transfer$/i.test(method) ? p.getProperty('UANGKU_TRANSFER_BANK') : method;
      if (!bank) throw new Error('Bank belum jelas untuk ID ' + r[0] + '. Isi Metode dengan bank sebenarnya atau UANGKU_TRANSFER_BANK.');
      if (!(r[1] instanceof Date) || isNaN(r[1].getTime())) throw new Error('Tanggal tidak valid untuk ID ' + r[0]);
      const amount = Number(r[6]);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Nominal tidak valid untuk ID ' + r[0]);
      const response = UrlFetchApp.fetch('https://uangku.spkomputer.com/api/sync/wifi', {
        method: 'post', contentType: 'application/json',
        headers: {'x-sync-key': key}, muteHttpExceptions: true,
        payload: JSON.stringify({
          paymentId: String(r[0]).trim(), customerId: String(r[2]),
          customerName: String(r[3]), period: String(r[5]), amount: amount,
          bank: bank, date: Utilities.formatDate(r[1], ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd')
        })
      });
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300)
        throw new Error('Sinkron gagal HTTP ' + response.getResponseCode() + ' untuk ID ' + r[0]);
      const result = JSON.parse(response.getContentText());
      if (!result.ok) throw new Error('Uangku belum mengonfirmasi pembayaran ' + r[0]);
      cursor = (cursor + 1) % rows.length;
      p.setProperty('UANGKU_CURSOR', String(cursor));
      sent++;
    }
    p.setProperty('UANGKU_LAST_SUCCESS', new Date().toISOString());
    p.deleteProperty('UANGKU_LAST_ERROR');
    console.log('Pembayaran diperiksa: ' + sent + '; total sumber: ' + rows.length);
  } catch (e) {
    PropertiesService.getScriptProperties().setProperty('UANGKU_LAST_ERROR', String(e.message));
    throw e;
  } finally { lock.releaseLock(); }
}
function uangkuRekapUlang() {
  PropertiesService.getScriptProperties().setProperty('UANGKU_CURSOR', '0');
  uangkuSinkron10Menit(); // Maksimal 50 per putaran; sisanya diteruskan pemicu.
}
