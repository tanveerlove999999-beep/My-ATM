# Nova Trade + Wallet UI (starter project)

## Included
- Trading-inspired responsive dashboard: demo chart, market ticker, watchlist, portfolio overview
- Firebase Google sign-in and email/password sign-in with verification link and reset flow
- Node.js/Express backend, Firebase ID token verification, SQLite transaction-intent history
- Owner-only console at the unlinked `OWNER_PANEL_PATH`, with server-enforced authorization to credit/debit customer balances and set account limits, keyed to `ADMIN_EMAIL`
- Server-side per-customer wallet currency and country selection (PKR, USD, SAR, CAD, GBP, AED, AUD, INR, TRY, EUR, JPY, CNY, SGD, MYR, IDR, BDT, QAR, KWD, BHD, OMR, ZAR, NGN, BRL, MXN, CHF, SEK, NOK, DKK, NZD, PHP, THB, VND, LKR, NPR, EGP)
- Currency-aware balance, account limit, deposit intent, and admin adjustment display; country/currency is locked after deposit history or a non-zero balance to prevent relabeling funds
- Server-side wallet balance, remaining-limit display, and adjustment history
- Cloud/database setup notes and payment-provider integration placeholders

## Important
This is a visual/dashboard and backend starter, not a licensed broker, not a live trading platform, and not a working real-money wallet. Market figures/charts are illustrative. It does not place trades, execute investments, hold customer money, or connect a bank account. Real payments are disabled unless deliberately configured, and the included deposit endpoint is only an intent placeholder until a provider checkout/capture/webhook is implemented.

## Run locally
1. Install Node.js 20+.
2. `npm install`
3. Copy `.env.example` to `.env`.
4. Set Firebase web config values and `GOOGLE_APPLICATION_CREDENTIALS` to a service-account JSON stored outside `public/`.
5. The `.env.example` currently presets `ADMIN_EMAIL=tanveerlove999999@gmail.com`; confirm this is the exact email of your verified Firebase owner account before deployment. Change `OWNER_PANEL_PATH` to a private random path you keep to yourself.
6. In Firebase Console, enable Google and Email/Password providers and authorize your domain.
7. `npm start`, then open `http://localhost:3000`. The owner console is available only at the custom path you set in `OWNER_PANEL_PATH`; it is not linked from the customer site.

## Cloud server and database
For production, deploy to a trusted Node.js host with HTTPS and secret environment variables. Move from SQLite to a managed PostgreSQL database; implement migrations, backups, monitoring, access controls, and restore tests. `DATABASE_URL` is a planning placeholder in this starter; the current code uses SQLite locally.

## Bank account / settlement
Do not put bank account numbers or bank credentials in frontend HTML. Link the business settlement bank account through the approved payment provider's official merchant dashboard, following that provider's verification steps. Customers' card/bank details should be entered only on the provider's hosted checkout page. Never collect PINs, CVVs, online banking passwords, or OTPs.

## Real payments and global methods
Country selection is user-declared and is not inferred from Gmail. Currency labels are not FX conversion: each wallet balance is denominated in its selected currency, and the app does not convert between currencies. There is no universal method that works in all countries. Choose a payment provider that onboards your business country and target markets. Complete business/KYC review. Add hosted checkout, signed webhook verification, idempotency, reconciliation, refunds/disputes, and server-side checks of amount/currency/order/merchant before considering any deposit confirmed. The sample API creates pending deposit intents in the selected wallet currency; it deliberately does not mark payments paid. Admin balance adjustments are for controlled testing/operations and are audited with the admin email. Connect a provider-signed webhook and reconcile actual settlement before automatically crediting deposits. The account limit is an application-side display/control, not a bank or regulatory limit.

## Real trading
If you want real stocks/crypto/forex trading, you need an appropriately regulated broker/exchange integration, market-data license, suitability/risk disclosures, order execution and account reconciliation. This project intentionally uses clearly labeled demo numbers and does not execute trades.


## Private owner console
The customer dashboard contains no admin panel or admin link. Customer-facing profile UI shows the Firebase display name, photo (when available), and unique UID; it does not display the customer email. The owner console shell is served at `OWNER_PANEL_PATH` and its controls appear only after Firebase sign-in plus a server-side `/api/me` owner check. Every admin API also independently verifies `ADMIN_EMAIL`. Keep the path private as an extra layer only; it is not a substitute for authentication. Use HTTPS in production and protect the owner email and account with MFA where available.
