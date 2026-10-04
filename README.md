# Uangku SPKomputer

Aplikasi keuangan PWA untuk Android dengan dompet Pribadi, Servis, Rental, dan WiFi. Pembayaran dari Google Sheet WiFi dapat masuk otomatis memakai ID pembayaran unik sehingga tidak dobel.

## Deploy Cloudflare dari branch `uangku`

1. Buat D1 bernama `spkomputer-uangku`.
2. Salin ID D1 ke `wrangler.jsonc`.
3. Atur build GitHub Cloudflare: production branch `uangku`, deploy command `npx wrangler deploy`.
4. Tambahkan secret `ADMIN_PASSWORD`, `SESSION_SECRET`, dan `WIFI_SYNC_KEY`.
5. Jalankan migrasi: `npx wrangler d1 migrations apply DB --remote`.
6. Tambahkan custom domain `uangku.spkomputer.com`.

`WIFI_SYNC_KEY` harus sama dengan `UANGKU_SYNC_KEY` di Apps Script. Gunakan string acak panjang dan jangan simpan secret ke GitHub.
