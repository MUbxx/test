import { auth, db } from "./firebase.js";

import {
  collection, getDocs, doc, onSnapshot, updateDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import {
  onAuthStateChanged, signOut, sendPasswordResetEmail, deleteUser
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// ─────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────
function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `show ${type}`;
  setTimeout(() => t.className = '', 3000);
}

// ─────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────
let userData = null;
let allCourses = [];

// ─────────────────────────────────────────────────────────
// AUTH — realtime user listener for instant course unlock
// ─────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (!user) { window.location = 'login.html'; return; }

  // Real-time listener — updates immediately when admin grants access
  onSnapshot(doc(db, 'users', user.uid), snap => {
    userData = snap.data();
    if (!userData) return;

    // Fill profile fields
    const name  = userData.name  || 'Student';
    const email = userData.email || user.email;
    const phone = userData.phone || '';
    const role  = userData.role  || 'user';
    const purchased = userData.purchasedCourses || [];

    // Welcome
    const wn = document.getElementById('welcomeName');
    if (wn) wn.textContent = name.split(' ')[0];

    // Stats
    const se = document.getElementById('statEnrolled');
    if (se) se.textContent = purchased.length;

    // Profile section
    const pName  = document.getElementById('profileName');
    const pEmail = document.getElementById('profileEmail');
    const pRole  = document.getElementById('profileRole');
    const pAvatar= document.getElementById('profileAvatar');
    const mAvatar= document.getElementById('mobileAvatar');
    const pSC    = document.getElementById('pStatCourses');
    const editN  = document.getElementById('editName');
    const editE  = document.getElementById('editEmail');
    const editP  = document.getElementById('editPhone');

    if (pName)  pName.textContent  = name;
    if (pEmail) pEmail.textContent = email;
    if (pRole)  pRole.textContent  = role === 'admin' ? '🛡 Admin' : 'Student';
    if (pAvatar){ pAvatar.textContent = name[0].toUpperCase(); }
    if (mAvatar){ mAvatar.textContent = name[0].toUpperCase(); }
    if (pSC)    pSC.textContent    = purchased.length;
    if (editN)  editN.value        = name;
    if (editE)  editE.value        = email;
    if (editP)  editP.value        = phone;

    // Session info
    const si = document.getElementById('sessionInfo');
    if (si) si.textContent = `Signed in as ${email}`;

    // Re-render courses with updated purchase state
    renderCourses(allCourses, purchased);
    renderMyCourses(allCourses, purchased);

    // Load external data
    loadCertificates(email);
    loadInvoices(email);
  });

  loadCourses(user);
});

// ─────────────────────────────────────────────────────────
// LOAD ALL COURSES
// ─────────────────────────────────────────────────────────
async function loadCourses(user) {
  const snap = await getDocs(collection(db, 'courses'));
  allCourses = [];
  snap.forEach(c => allCourses.push({ id: c.id, ...c.data() }));
  const purchased = userData?.purchasedCourses || [];
  renderCourses(allCourses, purchased);
  renderMyCourses(allCourses, purchased);
}

// ─────────────────────────────────────────────────────────
// COURSE CARD
// ─────────────────────────────────────────────────────────
function courseCard(c, access) {
  return `
    <div class="cc">
      <div style="overflow:hidden;"><img src="${c.image || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400&q=70'}" alt="${c.title}"></div>
      <div style="padding:14px;">
        ${access ? '<span style="font-size:.64rem;font-weight:700;color:#22c55e;background:rgba(34,197,94,.1);padding:2px 7px;border-radius:99px;border:1px solid rgba(34,197,94,.2);">Enrolled</span>' : ''}
        <h4 style="font-size:.88rem;font-weight:700;margin:6px 0 4px;line-height:1.3;">${c.title}</h4>
        <p style="font-size:.72rem;color:var(--dim);margin-bottom:10px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${c.description || ''}</p>
        ${c.lessons?.length ? `<p style="font-size:.67rem;color:var(--dim);margin-bottom:8px;"><i class="fas fa-list" style="margin-right:3px;color:var(--c);"></i>${c.lessons.length} lessons</p>` : ''}
        ${access
          ? `<a href="web-pentesting.html?id=${c.id}" style="display:block;text-align:center;padding:9px;border-radius:8px;background:linear-gradient(135deg,#06b6d4,#0ea5e9);color:#042028;font-weight:700;font-size:.78rem;text-decoration:none;">
              <i class="fas fa-play" style="margin-right:4px;"></i>Continue Learning
             </a>`
          : `<button style="width:100%;padding:9px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:var(--dim);font-family:'Poppins',sans-serif;font-size:.78rem;font-weight:600;cursor:not-allowed;">
              <i class="fas fa-lock" style="margin-right:4px;"></i>Locked
             </button>`}
      </div>
    </div>`;
}

function renderCourses(courses, purchased) {
  const grid = document.getElementById('coursesGrid');
  if (!grid) return;
  const q = document.getElementById('searchCourse')?.value?.toLowerCase() || '';
  const filtered = q ? courses.filter(c => c.title.toLowerCase().includes(q)) : courses;
  if (!filtered.length) {
    grid.innerHTML = '<p style="color:var(--dim);font-size:.82rem;grid-column:1/-1;">No courses available yet.</p>';
    return;
  }
  grid.innerHTML = filtered.map(c => courseCard(c, purchased.includes(c.id))).join('');
}

function renderMyCourses(courses, purchased) {
  const grid = document.getElementById('myGrid');
  if (!grid) return;
  const mine = courses.filter(c => purchased.includes(c.id));
  if (!mine.length) {
    grid.innerHTML = '<p style="color:var(--dim);font-size:.82rem;grid-column:1/-1;">No courses yet. Contact admin for access.</p>';
    return;
  }
  grid.innerHTML = mine.map(c => courseCard(c, true)).join('');
}

// Search
document.getElementById('searchCourse')?.addEventListener('input', () => {
  renderCourses(allCourses, userData?.purchasedCourses || []);
});

// ─────────────────────────────────────────────────────────
// CERTIFICATES from GitHub JSON
// ─────────────────────────────────────────────────────────
async function loadCertificates(email) {
  const el = document.getElementById('certList');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--dim);font-size:.78rem;">Loading certificates...</p>';
  try {
    const res = await fetch('https://raw.githubusercontent.com/Mubyyy404/Cyber-Buddy/main/certificates.json');
    if (!res.ok) throw new Error('File not reachable');
    const data = await res.json();
    const arr  = Array.isArray(data) ? data : (data.certificates || []);
    const mine = arr.filter(c => c.email?.toLowerCase() === email.toLowerCase());

    // Update stat
    const sc = document.getElementById('statCerts');
    if (sc) sc.textContent = mine.length;
    const psc = document.getElementById('pStatCerts');
    if (psc) psc.textContent = mine.length;

    if (!mine.length) { el.innerHTML = '<p style="color:var(--dim);font-size:.78rem;">No certificates found for your account.</p>'; return; }

    el.innerHTML = mine.map(cert => `
      <div class="card" style="display:flex;align-items:center;gap:12px;">
        <div style="width:42px;height:42px;border-radius:10px;background:rgba(6,182,212,.1);border:1px solid rgba(6,182,212,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-certificate" style="color:var(--c);font-size:.9rem;"></i></div>
        <div style="flex:1;min-width:0;">
          <p style="font-weight:600;font-size:.85rem;">${cert.course}</p>
          <p style="font-size:.72rem;color:var(--dim);margin-top:2px;">${cert.type || 'Certificate'}${cert.duration ? ' • ' + cert.duration : ''}${cert.issuedOn ? ' • ' + cert.issuedOn : ''}</p>
        </div>
        <a href="certificate.html?id=${cert.certId}" style="padding:7px 14px;border-radius:8px;background:rgba(6,182,212,.1);border:1px solid rgba(6,182,212,.25);color:var(--c);font-size:.72rem;font-weight:700;text-decoration:none;white-space:nowrap;">
          <i class="fas fa-external-link-alt" style="margin-right:3px;"></i>View
        </a>
      </div>`).join('');
  } catch (e) {
    el.innerHTML = `<p style="color:#f87171;font-size:.78rem;"><i class="fas fa-exclamation-triangle" style="margin-right:4px;"></i>Failed to load certificates. Check your JSON file.</p>`;
    console.error('Certs:', e);
  }
}

// ─────────────────────────────────────────────────────────
// BILLING from GitHub JSON
// ─────────────────────────────────────────────────────────
async function loadInvoices(email) {
  const el = document.getElementById('invoiceList');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--dim);font-size:.78rem;">Loading invoices...</p>';
  try {
    const res = await fetch('https://raw.githubusercontent.com/Mubyyy404/Cyber-Buddy/main/bills.json');
    if (!res.ok) throw new Error('File not reachable');
    const data  = await res.json();
    const arr   = Array.isArray(data) ? data : (data.bills || []);
    const mine  = arr.filter(b => b.email?.toLowerCase() === email.toLowerCase());

    if (!mine.length) { el.innerHTML = '<p style="color:var(--dim);font-size:.78rem;">No billing history found.</p>'; return; }

    el.innerHTML = mine.map(bill => `
      <div class="card" style="display:flex;align-items:center;gap:12px;">
        <div style="width:42px;height:42px;border-radius:10px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-receipt" style="color:#22c55e;font-size:.9rem;"></i></div>
        <div style="flex:1;min-width:0;">
          <p style="font-weight:600;font-size:.85rem;">${bill.course}</p>
          <p style="font-size:.72rem;color:var(--dim);margin-top:2px;">₹${bill.amount} • ${bill.date}${bill.paymentMode ? ' • ' + bill.paymentMode : ''}</p>
        </div>
        <a href="${bill.verifyUrl}" target="_blank" style="padding:7px 14px;border-radius:8px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.2);color:#22c55e;font-size:.72rem;font-weight:700;text-decoration:none;white-space:nowrap;">
          <i class="fas fa-check-circle" style="margin-right:3px;"></i>Verify
        </a>
      </div>`).join('');
  } catch (e) {
    el.innerHTML = `<p style="color:#f87171;font-size:.78rem;"><i class="fas fa-exclamation-triangle" style="margin-right:4px;"></i>Failed to load billing data.</p>`;
    console.error('Bills:', e);
  }
}

// ─────────────────────────────────────────────────────────
// PROFILE UPDATE
// ─────────────────────────────────────────────────────────
document.getElementById('saveProfile')?.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return;
  const name  = document.getElementById('editName').value.trim();
  const phone = document.getElementById('editPhone').value.trim();
  if (!name) { toast('Name cannot be empty', 'err'); return; }
  await updateDoc(doc(db, 'users', user.uid), { name, phone });
  toast('Profile updated ✅', 'ok');
});

// ─────────────────────────────────────────────────────────
// RESET PASSWORD (Profile + Security tabs)
// ─────────────────────────────────────────────────────────
async function sendReset() {
  const user = auth.currentUser;
  if (!user) return;
  await sendPasswordResetEmail(auth, user.email);
  toast('Password reset email sent to ' + user.email, 'ok');
}
document.getElementById('resetPwBtn')?.addEventListener('click', sendReset);
document.getElementById('secResetBtn')?.addEventListener('click', sendReset);

// ─────────────────────────────────────────────────────────
// DELETE ACCOUNT
// ─────────────────────────────────────────────────────────
document.getElementById('deleteAccBtn')?.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
  try {
    await deleteUser(auth.currentUser);
    window.location = 'login.html';
  } catch (e) {
    toast('Please re-login and try again', 'err');
  }
});

// ─────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await signOut(auth);
  window.location = 'login.html';
});
