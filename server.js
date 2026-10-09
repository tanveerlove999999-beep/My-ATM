import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import admin from 'firebase-admin';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
// Keep the owner console at a custom, unlinked path. This is obscurity only; APIs still enforce owner auth.
const OWNER_PANEL_PATH = (process.env.OWNER_PANEL_PATH || '/owner-9f4c2b7e').startsWith('/') ? (process.env.OWNER_PANEL_PATH || '/owner-9f4c2b7e') : `/${process.env.OWNER_PANEL_PATH}`;
const APP_ORIGIN = process.env.APP_ORIGIN || `http://localhost:${PORT}`;
const db = new Database(path.join(__dirname, 'nova-wallet.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY, uid TEXT NOT NULL, email TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, provider TEXT NOT NULL,
  status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wallets (
  uid TEXT PRIMARY KEY, email TEXT NOT NULL, balance_paisa INTEGER NOT NULL DEFAULT 0,
  limit_paisa INTEGER NOT NULL DEFAULT 10000000, updated_at TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'PK', currency TEXT NOT NULL DEFAULT 'PKR'
);
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id TEXT PRIMARY KEY, uid TEXT NOT NULL, email TEXT NOT NULL, delta_paisa INTEGER NOT NULL,
  balance_after_paisa INTEGER NOT NULL, reason TEXT NOT NULL, actor_email TEXT NOT NULL, created_at TEXT NOT NULL
);`);
// Wallet amounts are stored in the wallet's own currency; this app does not perform FX conversion.
const COUNTRIES = {
  PK:{country:'Pakistan',currency:'PKR'}, US:{country:'United States',currency:'USD'},
  SA:{country:'Saudi Arabia',currency:'SAR'}, CA:{country:'Canada',currency:'CAD'},
  GB:{country:'United Kingdom',currency:'GBP'}, AE:{country:'United Arab Emirates',currency:'AED'},
  AU:{country:'Australia',currency:'AUD'}, IN:{country:'India',currency:'INR'},
  TR:{country:'Türkiye',currency:'TRY'}, EU:{country:'Euro area',currency:'EUR'},
  JP:{country:'Japan',currency:'JPY'}, CN:{country:'China',currency:'CNY'}, SG:{country:'Singapore',currency:'SGD'},
  MY:{country:'Malaysia',currency:'MYR'}, ID:{country:'Indonesia',currency:'IDR'}, BD:{country:'Bangladesh',currency:'BDT'},
  QA:{country:'Qatar',currency:'QAR'}, KW:{country:'Kuwait',currency:'KWD'}, BH:{country:'Bahrain',currency:'BHD'},
  OM:{country:'Oman',currency:'OMR'}, ZA:{country:'South Africa',currency:'ZAR'}, NG:{country:'Nigeria',currency:'NGN'},
  BR:{country:'Brazil',currency:'BRL'}, MX:{country:'Mexico',currency:'MXN'}, CH:{country:'Switzerland',currency:'CHF'},
  SE:{country:'Sweden',currency:'SEK'}, NO:{country:'Norway',currency:'NOK'}, DK:{country:'Denmark',currency:'DKK'},
  NZ:{country:'New Zealand',currency:'NZD'}, PH:{country:'Philippines',currency:'PHP'}, TH:{country:'Thailand',currency:'THB'},
  VN:{country:'Vietnam',currency:'VND'}, LK:{country:'Sri Lanka',currency:'LKR'}, NP:{country:'Nepal',currency:'NPR'}, EG:{country:'Egypt',currency:'EGP'}
};
// Migrate databases created by earlier project versions.
const walletColumns = db.prepare('PRAGMA table_info(wallets)').all().map(c=>c.name);
if (!walletColumns.includes('country')) db.exec("ALTER TABLE wallets ADD COLUMN country TEXT NOT NULL DEFAULT 'PK'");
if (!walletColumns.includes('currency')) db.exec("ALTER TABLE wallets ADD COLUMN currency TEXT NOT NULL DEFAULT 'PKR'");
let firebaseReady = false;
try {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    firebaseReady = true;
  }
} catch (e) { console.error('Firebase setup issue:', e.message); }

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));
// Serve the owner-console shell only at the configured, unlinked path. Sensitive APIs remain separately protected.
app.get(OWNER_PANEL_PATH, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'private-admin.html'));
});
app.use('/api/', rateLimit({ windowMs: 60000, limit: 90, standardHeaders: true, legacyHeaders: false }));

async function requireUser(req, res, next) {
  if (!firebaseReady) return res.status(503).json({ error: 'Authentication is not configured yet.' });
  const token = (req.headers.authorization || '').match(/^Bearer (.+)$/)?.[1];
  if (!token) return res.status(401).json({ error: 'Please sign in.' });
  try {
    const user = await admin.auth().verifyIdToken(token, true);
    if (!user.email_verified) return res.status(403).json({ error: 'Verify your email first.' });
    req.user = { uid: user.uid, email: (user.email || '').toLowerCase() };
    next();
  } catch { res.status(401).json({ error: 'Session expired. Please sign in again.' }); }
}
function requireAdmin(req, res, next) {
  if (!ADMIN_EMAIL || req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  next();
}
app.get('/api/config', (_req, res) => res.json({
  firebaseWebConfig: {
    apiKey: process.env.FIREBASE_WEB_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  },
  paymentsEnabled: process.env.PAYMENTS_ENABLED === 'true',
  chartMode: 'illustrative-demo'
}));
app.get('/api/me', requireUser, (req, res) => res.json({
  email: req.user.email, isAdmin: Boolean(ADMIN_EMAIL && req.user.email === ADMIN_EMAIL)
}));
function ensureWallet(user) {
  db.prepare('INSERT OR IGNORE INTO wallets (uid,email,balance_paisa,limit_paisa,updated_at,country,currency) VALUES (?,?,0,10000000,?,?,?)')
    .run(user.uid, user.email, new Date().toISOString(), 'PK', 'PKR');
  db.prepare('UPDATE wallets SET email=?, updated_at=? WHERE uid=?').run(user.email, new Date().toISOString(), user.uid);
  return db.prepare('SELECT uid,email,balance_paisa,limit_paisa,updated_at,country,currency FROM wallets WHERE uid=?').get(user.uid);
}
app.post('/api/profile-country', requireUser, (req,res) => {
  const country = String(req.body?.country || '');
  const choice = COUNTRIES[country];
  if (!choice) return res.status(400).json({error:'Please choose a supported country.'});
  const w = ensureWallet(req.user);
  const hasDeposits = Boolean(db.prepare('SELECT 1 FROM deposits WHERE uid=? LIMIT 1').get(req.user.uid));
  if ((w.balance_paisa !== 0 || hasDeposits) && (w.country !== country || w.currency !== choice.currency)) {
    return res.status(409).json({error:'Country/currency cannot be changed after a balance or deposit history exists. Contact support.'});
  }
  db.prepare('UPDATE wallets SET country=?,currency=?,updated_at=? WHERE uid=?').run(country,choice.currency,new Date().toISOString(),req.user.uid);
  res.json({ok:true,country,currency:choice.currency});
});
app.get('/api/wallet', requireUser, (req, res) => {
  const w = ensureWallet(req.user);
  const ledger = db.prepare('SELECT id,delta_paisa,balance_after_paisa,reason,created_at FROM wallet_ledger WHERE uid=? ORDER BY created_at DESC LIMIT 20').all(req.user.uid);
  res.json({ balance: (w.balance_paisa / 100).toFixed(2), limit: (w.limit_paisa / 100).toFixed(2), remaining: (Math.max(0,w.limit_paisa-w.balance_paisa) / 100).toFixed(2), currency: w.currency, country: w.country, ledger: ledger.map(x=>({...x,delta:(x.delta_paisa/100).toFixed(2),balance_after:(x.balance_after_paisa/100).toFixed(2)})) });
});
app.get('/api/deposits', requireUser, (req, res) => {
  const rows = db.prepare('SELECT id,email,amount_cents,currency,provider,status,created_at FROM deposits WHERE uid=? ORDER BY created_at DESC LIMIT 50').all(req.user.uid);
  res.json(rows.map(r => ({ ...r, amount: (r.amount_cents / 100).toFixed(2) })));
});
app.post('/api/deposit-intents', requireUser, (req, res) => {
  if (process.env.PAYMENTS_ENABLED !== 'true') return res.status(503).json({ error: 'Real payments are disabled until a provider is approved and configured.' });
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) return res.status(400).json({ error: 'Amount must be between 1 and 1,000,000 in your wallet currency.' });
  const wallet = ensureWallet(req.user);
  if (Math.round(amount*100) + wallet.balance_paisa > wallet.limit_paisa) return res.status(400).json({error:`This deposit would exceed your ${wallet.currency} account limit.`});
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO deposits (id,uid,email,amount_cents,currency,provider,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, req.user.uid, req.user.email, Math.round(amount * 100), wallet.currency, 'provider-not-connected', 'pending', new Date().toISOString());
  res.status(201).json({ id, status: 'pending', message: 'Deposit intent created. Connect your approved provider checkout next.' });
});
app.post('/api/admin/wallet-adjustment', requireUser, requireAdmin, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const amount = Number(req.body?.amount);
  const action = req.body?.action;
  const limit = req.body?.limit === '' || req.body?.limit == null ? null : Number(req.body.limit);
  if (!email || !['credit','debit','limit'].includes(action)) return res.status(400).json({error:'Customer email and valid action are required.'});
  if (action === 'limit' && (!Number.isFinite(limit) || limit < 0 || limit > 100000000)) return res.status(400).json({error:"Limit must be between 0 and 100,000,000 in the customer wallet currency."});
  if (action !== 'limit' && (!Number.isFinite(amount) || amount <= 0 || amount > 10000000)) return res.status(400).json({error:"Adjustment must be a positive amount up to 10,000,000 in the customer wallet currency."});
  let customer; try { customer = await admin.auth().getUserByEmail(email); } catch { return res.status(404).json({error:'No Firebase user found for that email.'}); }
  const now = new Date().toISOString();
  let customerCurrency = 'PKR';
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO wallets (uid,email,balance_paisa,limit_paisa,updated_at,country,currency) VALUES (?,?,0,10000000,?,?,?)').run(customer.uid,email,now,'PK','PKR');
    const w = db.prepare('SELECT balance_paisa,limit_paisa,currency FROM wallets WHERE uid=?').get(customer.uid);
    customerCurrency = w.currency;
    if (action === 'limit') { db.prepare('UPDATE wallets SET limit_paisa=?,updated_at=? WHERE uid=?').run(Math.round(limit*100),now,customer.uid); return; }
    const delta = Math.round(amount*100) * (action === 'credit' ? 1 : -1);
    const next = w.balance_paisa + delta;
    if (next < 0) throw new Error('Balance cannot go below zero.');
    if (next > w.limit_paisa) throw new Error(`Adjustment would exceed the customer's ${w.currency} account limit.`);
    db.prepare('UPDATE wallets SET balance_paisa=?,updated_at=? WHERE uid=?').run(next,now,customer.uid);
    db.prepare('INSERT INTO wallet_ledger (id,uid,email,delta_paisa,balance_after_paisa,reason,actor_email,created_at) VALUES (?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),customer.uid,email,delta,next,action === 'credit' ? 'Admin credit' : 'Admin debit',req.user.email,now);
  })();
  res.json({ok:true,message: action === 'limit' ? `Customer limit updated (${customerCurrency}).` : `Customer balance ${action === 'credit' ? 'credited' : 'debited'} successfully in ${customerCurrency}.`});
});
app.get('/api/admin/wallets', requireUser, requireAdmin, (_req,res) => {
  const rows=db.prepare('SELECT email,balance_paisa,limit_paisa,updated_at FROM wallets ORDER BY updated_at DESC LIMIT 200').all();
  res.json(rows.map(w=>({...w,balance:(w.balance_paisa/100).toFixed(2),limit:(w.limit_paisa/100).toFixed(2)})));
});
app.get('/api/admin/deposits', requireUser, requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT id,email,amount_cents,currency,provider,status,created_at FROM deposits ORDER BY created_at DESC LIMIT 200').all();
  res.json(rows.map(r => ({ ...r, amount: (r.amount_cents / 100).toFixed(2) })));
});
app.listen(PORT, () => console.log(`Nova Wallet listening at ${APP_ORIGIN}`));
