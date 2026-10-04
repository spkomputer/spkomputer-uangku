CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','optional','inactive')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Umum',
  icon TEXT NOT NULL DEFAULT '🎯',
  source_account TEXT NOT NULL DEFAULT 'Mandiri',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO accounts (id,name,purpose,status,sort_order,updated_at) VALUES
('cash','Tunai','Transaksi tunai harian','active',1,datetime('now')),
('bca','BCA','Usaha servis','active',2,datetime('now')),
('mandiri','Mandiri','WiFi pembayaran MT01 & MT03','active',3,datetime('now')),
('bsi','BSI','WiFi pembayaran MT02 & angsur emas','active',4,datetime('now')),
('cimb','CIMB','Keuangan pribadi','active',5,datetime('now')),
('seabank','SeaBank','Dana mengendap / cadangan','active',6,datetime('now')),
('dana','DANA','Pembayaran WiFi opsional','optional',7,datetime('now')),
('gopay','GoPay','Belum ditentukan','optional',8,datetime('now')),
('bri','BRI','Pembayaran WiFi bila diperlukan','optional',9,datetime('now'));

INSERT OR IGNORE INTO targets (id,name,category,icon,source_account,status,sort_order,updated_at) VALUES
('listrik','Listrik','Tagihan wajib','💡','Mandiri','active',1,datetime('now')),
('air','Air','Tagihan wajib','💧','CIMB','active',2,datetime('now')),
('bandwidth','Tagihan WiFi / Bandwidth','Operasional WiFi','🌐','Mandiri','active',3,datetime('now')),
('hutang','Pembayaran Hutang','Kewajiban','🧾','BSI','active',4,datetime('now')),
('parcel','Nabung Parcel','Tabungan','🎁','Mandiri','active',5,datetime('now')),
('kompensasi','Kompensasi WiFi','Operasional WiFi','🤝','Mandiri','active',6,datetime('now')),
('operasional','Biaya Operasional WiFi','Operasional WiFi','🛠️','Mandiri','active',7,datetime('now')),
('alat-bahan','Alat & Bahan WiFi','Investasi usaha','🧰','Mandiri','active',8,datetime('now')),
('darurat','Dana Darurat Usaha','Cadangan','🛡️','SeaBank','active',9,datetime('now')),
('maintenance','Maintenance Jaringan','Operasional WiFi','🔧','Mandiri','active',10,datetime('now')),
('upgrade','Upgrade Jaringan','Investasi usaha','🚀','SeaBank','active',11,datetime('now')),
('gaji','Gaji Pemilik','Pribadi','👤','CIMB','active',12,datetime('now')),
('perangkat','Penggantian Perangkat','Cadangan','💻','SeaBank','active',13,datetime('now'));
