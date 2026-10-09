import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
const $ = id => document.getElementById(id);
let auth, currentUser, walletCurrency='PKR', walletCountry='PK';
const CURRENCY_SYMBOLS={PKR:'₨',USD:'$',SAR:'ر.س',CAD:'C$',GBP:'£',AED:'د.إ',AUD:'A$',INR:'₹',TRY:'₺',EUR:'€',JPY:'¥',CNY:'¥',SGD:'S$',MYR:'RM',IDR:'Rp',BDT:'৳',QAR:'ر.ق',KWD:'د.ك',BHD:'د.ب',OMR:'ر.ع.',ZAR:'R',NGN:'₦',BRL:'R$',MXN:'$',CHF:'CHF',SEK:'kr',NOK:'kr',DKK:'kr',NZD:'NZ$',PHP:'₱',THB:'฿',VND:'₫',LKR:'Rs',NPR:'रू',EGP:'E£'};
function message(id, text) { $(id).textContent = text; }
function toast(text) { const el=$('toast'); el.textContent=text; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3500); }
function money(value,currency=walletCurrency){try{return new Intl.NumberFormat(undefined,{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0)}catch{return `${currency} ${Number(value||0).toFixed(2)}`}}
async function api(path, options={}) {
  const token = currentUser ? await currentUser.getIdToken() : '';
  const res = await fetch(path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function updateCurrencyLabels(){
  $('walletCurrency').textContent=walletCurrency;
  $('depositCurrency').textContent=walletCurrency;
  $('currencySymbol').textContent=CURRENCY_SYMBOLS[walletCurrency]||walletCurrency;
  document.querySelectorAll('[data-amount]').forEach(b=>{b.textContent=`${CURRENCY_SYMBOLS[walletCurrency]||walletCurrency}${Number(b.dataset.amount).toLocaleString()}`});
  $('amount').placeholder=walletCurrency==='PKR'?'5000':'100';
}
function showRows(rows, target, admin=false) {
  const body=$(target); body.innerHTML='';
  if(!rows.length){body.innerHTML=`<tr><td colspan="${admin?4:5}">No transactions yet.</td></tr>`;return;}
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    const values=admin?[r.id,r.email,`${r.amount} ${r.currency}`,r.status]:[r.id,new Date(r.created_at).toLocaleString(),r.provider,`${r.amount} ${r.currency}`,r.status];
    values.forEach((v,i)=>{const td=document.createElement('td'); if((!admin&&i===4)||(admin&&i===3)){const s=document.createElement('span');s.className=`status ${String(v).toLowerCase()}`;s.textContent=v;td.append(s)}else td.textContent=v;tr.append(td)});
    body.append(tr);
  });
}
async function refresh() {
  try {
    const rows=await api('/api/deposits'); showRows(rows,'transactions'); $('depositCount').textContent=rows.length;
    const wallet=await api('/api/wallet');
    walletCurrency=wallet.currency||'PKR'; walletCountry=wallet.country||'PK'; $('countrySelect').value=walletCountry; updateCurrencyLabels();
    $('walletBalance').textContent=money(wallet.balance);
    $('walletLimit').textContent=money(wallet.limit);
    $('limitRemaining').textContent=`${money(wallet.remaining)} remaining`;
    const used=Number(wallet.limit)>0?Math.min(100,Number(wallet.balance)/Number(wallet.limit)*100):100; $('limitProgress').style.width=`${used}%`;
    $('accountStatus').textContent=Number(wallet.balance)>0?'Funded':'Not funded';
  } catch(e){toast(e.message)}
}
async function signedIn(user) {
  if(!user.emailVerified){await signOut(auth);message('authMessage','Please verify your email using the link sent to your inbox, then sign in again.');return}
  currentUser=user;
  try { await api('/api/profile-country',{method:'POST',body:JSON.stringify({country:$('countrySelect').value||'PK'})}); }
  catch(e) { try { const saved=await api('/api/wallet'); $('countrySelect').value=saved.country||'PK'; } catch{} }
  $('auth').classList.add('hidden'); $('app').classList.remove('hidden'); $('signOut').classList.remove('hidden');
  const profileName=user.displayName || 'Nova User'; $('profileName').textContent=profileName; $('profileUid').textContent=user.uid || '—';
  const avatar=$('profileAvatar'); avatar.textContent=(profileName.trim()[0]||'N').toUpperCase();
  if(user.photoURL){const img=document.createElement('img');img.src=user.photoURL;img.alt='';img.referrerPolicy='no-referrer';avatar.textContent='';avatar.append(img)}
  await refresh();
}
async function init() {
  const config=await (await fetch('/api/config')).json();
  const c=config.firebaseWebConfig;
  const savedCountry=localStorage.getItem('novaCountry'); if(savedCountry && $('countrySelect').querySelector(`option[value="${savedCountry}"]`)) $('countrySelect').value=savedCountry;
  $('countrySelect').addEventListener('change',async()=>{
    localStorage.setItem('novaCountry',$('countrySelect').value);
    if(!currentUser)return;
    try{await api('/api/profile-country',{method:'POST',body:JSON.stringify({country:$('countrySelect').value})});await refresh();message('payMessage','Wallet country and currency updated.');}
    catch(e){message('authMessage',e.message);const w=await api('/api/wallet').catch(()=>null);if(w)$('countrySelect').value=w.country||'PK';}
  });
  if(!c.apiKey||!c.projectId||!c.appId){
    message('authMessage','Setup needed: add Firebase web settings in .env and configure Firebase Authentication.');
    $('googleSignIn').onclick=()=>toast('Configure Firebase web settings and enable Google sign-in first.'); return;
  }
  auth=getAuth(initializeApp(c));
  $('googleSignIn').onclick=async()=>{try{await signedIn((await signInWithPopup(auth,new GoogleAuthProvider())).user)}catch(e){message('authMessage',e.message)}};
  $('emailSignUp').onclick=async()=>{try{const r=await createUserWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);await sendEmailVerification(r.user);await signOut(auth);message('authMessage','Verification link sent. Verify your email, then sign in.')}catch(e){message('authMessage',e.message)}};
  $('emailSignIn').onclick=async()=>{try{await signedIn((await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)).user)}catch(e){message('authMessage',e.message)}};
  $('resetPassword').onclick=async()=>{try{await sendPasswordResetEmail(auth,$('email').value.trim());message('authMessage','If registered, a reset link has been sent.')}catch(e){message('authMessage',e.message)}};
  $('signOut').onclick=async()=>{await signOut(auth);location.reload()};
  $('refresh').onclick=refresh;
  document.querySelectorAll('[data-amount]').forEach(b=>b.onclick=()=>{$('amount').value=b.dataset.amount});
  $('payButton').onclick=async()=>{
    const amount=Number($('amount').value);
    if(!Number.isFinite(amount)||amount<1){message('payMessage',`Enter an amount of at least 1 ${walletCurrency}.`);return}
    try {message('payMessage','Checking payment setup…');const result=await api('/api/deposit-intents',{method:'POST',body:JSON.stringify({amount})});message('payMessage',result.message);await refresh()}
    catch(e){message('payMessage',e.message)}
  };

}
init().catch(e=>message('authMessage',`Setup error: ${e.message}`));
