import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
const $ = id => document.getElementById(id);
let auth, currentUser;
function msg(id, text){$(id).textContent=text}
async function api(path, options={}) {
  const token = currentUser ? await currentUser.getIdToken() : '';
  const res = await fetch(path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function finishLogin(user){
  currentUser=user;
  if(!user.emailVerified){await signOut(auth);currentUser=null;msg('privateMessage','This account email must be verified first.');return}
  try{
    const me=await api('/api/me');
    if(!me.isAdmin){await signOut(auth);currentUser=null;msg('privateMessage','Access denied. This account is not authorized.');return}
    $('privateLogin').classList.add('privateHidden');
    $('privatePanel').classList.remove('privateHidden');
    $('privateSignOut').classList.remove('privateHidden');
    msg('privateMessage','');
    await loadDeposits();
  }catch(e){
    await signOut(auth).catch(()=>{});currentUser=null;
    msg('privateMessage',e.message==='Admin only.'?'Access denied.':e.message);
  }
}
async function loadDeposits(){
  try{
    const rows=await api('/api/admin/deposits');const body=$('privateDeposits');body.innerHTML='';
    if(!rows.length){body.innerHTML='<tr><td colspan="4">No deposit requests yet.</td></tr>';return}
    for(const r of rows){const tr=document.createElement('tr');[r.id,r.email,`${r.amount} ${r.currency}`,r.status].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td)});body.append(tr)}
  }catch(e){msg('adjustMessage',e.message)}
}
async function init(){
  const cfg=await (await fetch('/api/config')).json();const c=cfg.firebaseWebConfig;
  if(!c.apiKey||!c.projectId||!c.appId){msg('privateMessage','Setup needed: configure Firebase web settings in the server environment.');return}
  auth=getAuth(initializeApp(c));
  $('privateGoogle').onclick=async()=>{try{await finishLogin((await signInWithPopup(auth,new GoogleAuthProvider())).user)}catch(e){msg('privateMessage',e.message)}};
  $('privateEmailLogin').onclick=async()=>{try{await finishLogin((await signInWithEmailAndPassword(auth,$('privateEmail').value.trim(),$('privatePassword').value)).user)}catch(e){msg('privateMessage',e.message)}};
  $('privateSignOut').onclick=async()=>{await signOut(auth);location.reload()};
  $('privateRefresh').onclick=loadDeposits;
  $('adjustAction').onchange=()=>{$('adjustAmount').placeholder=$('adjustAction').value==='limit'?'100000.00':'1.00'};
  $('applyAdjustment').onclick=async()=>{
    const email=$('customerEmail').value.trim(),action=$('adjustAction').value,amount=$('adjustAmount').value;
    if(!email){msg('adjustMessage','Enter the customer email.');return}
    try{
      const result=await api('/api/admin/wallet-adjustment',{method:'POST',body:JSON.stringify({email,action,amount:action==='limit'?undefined:amount,limit:action==='limit'?amount:undefined})});
      msg('adjustMessage',result.message);$('adjustAmount').value='';await loadDeposits();
    }catch(e){msg('adjustMessage',e.message)}
  };
}
init().catch(e=>msg('privateMessage',`Setup error: ${e.message}`));
