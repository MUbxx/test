import { auth, db } from "./firebase.js";

import {
  collection, getDocs, doc, getDoc, setDoc, addDoc,
  updateDoc, deleteDoc, arrayUnion, arrayRemove,
  query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import {
  signOut, onAuthStateChanged, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// ─────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────
function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  setTimeout(() => t.className = '', 3000);
}

// ─────────────────────────────────────────────────────────
// AUTH — role check from Firestore (not email hardcoding)
// ─────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location = 'login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));

  if (!snap.exists() || snap.data().role !== 'admin') {
    alert('Unauthorized access');
    window.location = 'dashboard.html';
    return;
  }

  // Show admin email badge
  const badge = document.getElementById('adminBadge');
  if (badge) badge.innerHTML = `<i class="fas fa-user-shield"></i> ${user.email}`;

  loadDashboard();
  loadBuilderList();
});

// ─────────────────────────────────────────────────────────
// VIDEO URL CLEANER
// ─────────────────────────────────────────────────────────
function cleanUrl(input) {
  if (!input) return '';
  input = input.trim();
  // Strip full <iframe src="..."> tag
  const src = input.match(/src=["']([^"']+)["']/);
  if (src) input = src[1].trim();
  // Google Drive → /preview
  const drv = input.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (drv) return `https://drive.google.com/file/d/${drv[1]}/preview`;
  // YouTube → embed
  const yt = input.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1`;
  return input;
}

// ─────────────────────────────────────────────────────────
// LOAD DASHBOARD
// ─────────────────────────────────────────────────────────
async function loadDashboard() {
  const [usersSnap, coursesSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'courses'))
  ]);

  // Stats
  let enrollments = 0;
  const courseIds = [];
  const recentUsers = [];

  usersSnap.forEach(u => {
    const d = u.data();
    enrollments += (d.purchasedCourses || []).length;
    if (d.createdAt) recentUsers.push({ ...d, uid: u.id });
  });

  coursesSnap.forEach(c => courseIds.push({ id: c.id, ...c.data() }));

  document.getElementById('totalUsers').textContent       = usersSnap.size;
  document.getElementById('totalCourses').textContent     = coursesSnap.size;
  document.getElementById('totalEnrollments').textContent = enrollments;
  document.getElementById('activeCourses').textContent    = coursesSnap.size;

  // Recent registrations (last 5)
  const ru = document.getElementById('recentUsers');
  ru.innerHTML = '';
  const sorted = recentUsers.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 5);
  if (!sorted.length) { ru.innerHTML = '<p style="font-size:.78rem;color:var(--dim);">No users yet.</p>'; }
  sorted.forEach(u => {
    ru.innerHTML += `
      <div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04);">
        <div style="width:30px;height:30px;border-radius:50%;background:rgba(6,182,212,.15);border:1.5px solid rgba(6,182,212,.25);display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;color:#06b6d4;flex-shrink:0;">${(u.name||'?')[0].toUpperCase()}</div>
        <div>
          <p style="font-size:.78rem;font-weight:600;">${u.name || 'Unknown'}</p>
          <p style="font-size:.68rem;color:var(--dim);">${u.email || ''}</p>
        </div>
        <span class="bdg ${u.role === 'admin' ? 'brd' : 'bcn'}" style="margin-left:auto;">${u.role || 'user'}</span>
      </div>`;
  });

  // Activity feed (logs)
  const af = document.getElementById('actFeed');
  af.innerHTML = '';
  try {
    const logSnap = await getDocs(query(collection(db, 'logs'), orderBy('time', 'desc'), limit(6)));
    if (logSnap.empty) {
      af.innerHTML = '<p style="font-size:.78rem;color:var(--dim);">No activity yet.</p>';
    } else {
      logSnap.forEach(l => {
        const d = l.data();
        const timeStr = d.time?.toDate?.()?.toLocaleString() || '';
        af.innerHTML += `
          <div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04);">
            <div style="width:7px;height:7px;border-radius:50%;background:#06b6d4;margin-top:5px;flex-shrink:0;"></div>
            <div>
              <p style="font-size:.77rem;">${d.message || ''}</p>
              <p style="font-size:.65rem;color:var(--dim);">${timeStr}</p>
            </div>
          </div>`;
      });
    }
  } catch (_) {
    af.innerHTML = '<p style="font-size:.78rem;color:var(--dim);">Enable Firestore logs collection.</p>';
  }

  // Render users table + courses list
  renderUsers(usersSnap, courseIds);
  renderCourses(courseIds);
}

// ─────────────────────────────────────────────────────────
// RENDER COURSES LIST
// ─────────────────────────────────────────────────────────
function renderCourses(courses) {
  const list = document.getElementById('coursesList');
  list.innerHTML = '';
  if (!courses.length) {
    list.innerHTML = '<p style="font-size:.8rem;color:var(--dim);">No courses yet.</p>';
    return;
  }
  courses.forEach(c => {
    const lessonCount = c.lessons?.length || 0;
    const vType = c.video?.includes('youtube') ? 'yt' : c.video?.includes('drive') ? 'drive' : '';
    const vBadge = vType === 'yt'
      ? '<span class="bdg byt"><i class="fab fa-youtube"></i> YouTube</span>'
      : vType === 'drive'
      ? '<span class="bdg bdv"><i class="fab fa-google-drive"></i> Drive</span>'
      : '';

    const div = document.createElement('div');
    div.style.cssText = 'background:var(--bg3);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:13px 15px;display:flex;align-items:center;gap:12px;transition:border-color .2s;';
    div.onmouseenter = () => div.style.borderColor = 'rgba(6,182,212,.3)';
    div.onmouseleave = () => div.style.borderColor = 'rgba(255,255,255,.06)';
    div.innerHTML = `
      ${c.image
        ? `<img src="${c.image}" style="width:52px;height:38px;border-radius:6px;object-fit:cover;flex-shrink:0;">`
        : `<div style="width:52px;height:38px;border-radius:6px;background:rgba(6,182,212,.1);flex-shrink:0;display:flex;align-items:center;justify-content:center;"><i class="fas fa-video" style="color:#06b6d4;font-size:.8rem;"></i></div>`}
      <div style="flex:1;min-width:0;">
        <p style="font-weight:600;font-size:.85rem;">${c.title}</p>
        <p style="font-size:.7rem;color:var(--dim);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.description || 'No description'}</p>
        <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
          ${vBadge}
          ${lessonCount ? `<span class="bdg bgr"><i class="fas fa-list"></i> ${lessonCount} lessons</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button onclick="window.open('web-pentesting.html?id=${c.id}','_blank')" class="btn bo bs"><i class="fas fa-eye"></i></button>
        <button onclick="deleteCourse('${c.id}')" class="btn br bs"><i class="fas fa-trash"></i></button>
      </div>`;
    list.appendChild(div);
  });
}

// ─────────────────────────────────────────────────────────
// RENDER USERS TABLE
// ─────────────────────────────────────────────────────────
function renderUsers(usersSnap, courses) {
  const tbody = document.getElementById('usersList');
  tbody.innerHTML = '';

  usersSnap.forEach(userDoc => {
    const d = userDoc.data();
    const owned = d.purchasedCourses || [];
    const joined = d.createdAt?.toDate?.()?.toLocaleDateString() || '—';
    const roleClass = d.role === 'admin' ? 'brd' : 'bcn';

    const tr = document.createElement('tr');
    tr.dataset.search = `${d.name || ''} ${d.email || ''} ${d.role || ''}`.toLowerCase();
    tr.dataset.role = d.role || 'user';

    tr.innerHTML = `
      <td style="padding:9px 11px;font-weight:600;">${d.name || '—'}</td>
      <td style="padding:9px 11px;color:var(--dim);font-size:.78rem;">${d.email || '—'}</td>
      <td style="padding:9px 11px;"><span class="bdg ${roleClass}">${d.role || 'user'}</span></td>
      <td style="padding:9px 11px;font-size:.75rem;color:var(--dim);">${joined}</td>
      <td style="padding:9px 11px;">
        ${owned.length
          ? `<span style="font-size:.75rem;color:#22c55e;">${owned.length} course${owned.length > 1 ? 's' : ''}</span>`
          : `<span style="font-size:.75rem;color:var(--dim);">None</span>`}
      </td>
      <td style="padding:9px 11px;white-space:nowrap;">
        <select id="gs-${userDoc.id}" style="background:#1e293b;border:1px solid rgba(6,182,212,.2);color:#e2e8f0;font-family:'Poppins',sans-serif;font-size:.7rem;padding:4px 7px;border-radius:6px;outline:none;margin-right:4px;max-width:130px;">
          <option value="">Select course</option>
          ${courses.map(c => `<option value="${c.id}">${c.title}</option>`).join('')}
        </select>
        <button onclick="grant('${userDoc.id}',this)" class="btn bg bs" style="margin-right:3px;">Grant</button>
        <button onclick="revoke('${userDoc.id}')" class="btn by bs">Revoke</button>
      </td>
      <td style="padding:9px 11px;white-space:nowrap;">
        <input id="name-${userDoc.id}" value="${d.name || ''}"
          style="background:#1e293b;border:1px solid rgba(6,182,212,.14);color:#e2e8f0;font-family:'Poppins',sans-serif;font-size:.75rem;padding:4px 7px;border-radius:6px;outline:none;width:110px;margin-right:4px;">
        <button onclick="updateUserName('${userDoc.id}')" class="btn bo bs">Save</button>
      </td>
      <td style="padding:9px 11px;white-space:nowrap;">
        <button onclick="deleteUser('${userDoc.id}')" class="btn br bs"><i class="fas fa-trash"></i></button>
      </td>`;

    tbody.appendChild(tr);
  });

  initSearch();
}

// ─────────────────────────────────────────────────────────
// SEARCH + ROLE FILTER
// ─────────────────────────────────────────────────────────
function initSearch() {
  function applyFilters() {
    const q = document.getElementById('userSearch').value.toLowerCase();
    const role = document.getElementById('roleFilter').value;
    document.querySelectorAll('#usersList tr').forEach(tr => {
      const matchQ = !q || tr.dataset.search?.includes(q);
      const matchR = !role || tr.dataset.role === role;
      tr.style.display = matchQ && matchR ? '' : 'none';
    });
  }
  document.getElementById('userSearch').addEventListener('input', applyFilters);
  document.getElementById('roleFilter').addEventListener('change', applyFilters);
}

// ─────────────────────────────────────────────────────────
// GRANT ACCESS
// ─────────────────────────────────────────────────────────
window.grant = async (uid, btn) => {
  const courseId = document.getElementById(`gs-${uid}`).value;
  if (!courseId) { toast('Select a course first', 'err'); return; }

  const snap = await getDoc(doc(db, 'users', uid));
  const owned = snap.data().purchasedCourses || [];
  if (owned.includes(courseId)) { toast('User already has this course', 'err'); return; }

  btn.disabled = true; btn.textContent = '...';

  await updateDoc(doc(db, 'users', uid), { purchasedCourses: arrayUnion(courseId) });

  try {
    await addDoc(collection(db, 'logs'), {
      message: `Course "${courseId}" granted to ${snap.data().email || uid}`,
      time: serverTimestamp()
    });
  } catch (_) {}

  btn.textContent = '✓ Granted';
  btn.style.color = '#22c55e';
  toast('Course access granted ✅', 'ok');
  setTimeout(loadDashboard, 1500);
};

// ─────────────────────────────────────────────────────────
// REVOKE ACCESS
// ─────────────────────────────────────────────────────────
window.revoke = async uid => {
  const courseId = document.getElementById(`gs-${uid}`).value;
  if (!courseId) { toast('Select a course to revoke', 'err'); return; }

  await updateDoc(doc(db, 'users', uid), { purchasedCourses: arrayRemove(courseId) });

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    await addDoc(collection(db, 'logs'), {
      message: `Course "${courseId}" revoked from ${snap.data().email || uid}`,
      time: serverTimestamp()
    });
  } catch (_) {}

  toast('Access revoked', 'info');
  loadDashboard();
};

// ─────────────────────────────────────────────────────────
// UPDATE USER NAME
// ─────────────────────────────────────────────────────────
window.updateUserName = async uid => {
  const name = document.getElementById(`name-${uid}`).value.trim();
  if (!name) { toast('Name cannot be empty', 'err'); return; }
  await updateDoc(doc(db, 'users', uid), { name });
  toast('Name updated', 'ok');
};

// ─────────────────────────────────────────────────────────
// DELETE USER
// ─────────────────────────────────────────────────────────
window.deleteUser = async uid => {
  if (!confirm('Delete this user from Firestore?')) return;
  await deleteDoc(doc(db, 'users', uid));
  toast('User deleted', 'ok');
  loadDashboard();
};

// ─────────────────────────────────────────────────────────
// DELETE COURSE
// ─────────────────────────────────────────────────────────
window.deleteCourse = async id => {
  if (!confirm('Delete this course? Cannot be undone.')) return;
  await deleteDoc(doc(db, 'courses', id));
  toast('Course deleted', 'ok');
  loadDashboard();
  loadBuilderList();
};

// ─────────────────────────────────────────────────────────
// QUICK UPLOAD COURSE (Courses tab)
// ─────────────────────────────────────────────────────────
document.getElementById('uploadBtn').onclick = async () => {
  const title       = document.getElementById('title').value.trim();
  const description = document.getElementById('description').value.trim();
  const image       = document.getElementById('image').value.trim();
  const videoRaw    = document.getElementById('video').value.trim();

  if (!title) { toast('Course title is required', 'err'); return; }

  const btn = document.getElementById('uploadBtn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>Uploading...';

  try {
    await setDoc(doc(db, 'courses', title.toLowerCase().replace(/[^a-z0-9]+/g, '-')), {
      title, description, image,
      video: cleanUrl(videoRaw),
      lessons: [],
      createdAt: serverTimestamp()
    });
    toast('Course uploaded ✅', 'ok');
    ['title', 'description', 'image', 'video'].forEach(id => document.getElementById(id).value = '');
    loadDashboard();
    loadBuilderList();
  } catch (e) {
    toast('Upload failed: ' + e.message, 'err');
  }

  btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload"></i>Upload Course';
};

// ─────────────────────────────────────────────────────────
// PASSWORD RESET
// ─────────────────────────────────────────────────────────
document.getElementById('resetPassword').onclick = async () => {
  const email = document.getElementById('resetEmail').value.trim();
  if (!email) { toast('Enter an email first', 'err'); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    toast('Password reset email sent ✅', 'ok');
  } catch (e) { toast(e.message, 'err'); }
};

// ─────────────────────────────────────────────────────────
// CHANGE USER ROLE (Security tab)
// ─────────────────────────────────────────────────────────
document.getElementById('changeRoleBtn').onclick = async () => {
  const email   = document.getElementById('roleEmail').value.trim();
  const newRole = document.getElementById('roleVal').value;
  if (!email) { toast('Enter an email', 'err'); return; }

  // Find user by email
  const usersSnap = await getDocs(collection(db, 'users'));
  let found = null;
  usersSnap.forEach(u => { if (u.data().email === email) found = u; });

  if (!found) { toast('User not found with that email', 'err'); return; }

  await updateDoc(doc(db, 'users', found.id), { role: newRole });

  try {
    await addDoc(collection(db, 'logs'), {
      message: `Role of ${email} changed to "${newRole}"`,
      time: serverTimestamp()
    });
  } catch (_) {}

  toast(`Role updated to "${newRole}" ✅`, 'ok');
  loadDashboard();
};

// ─────────────────────────────────────────────────────────
// ACTIVITY LOGS TAB
// ─────────────────────────────────────────────────────────
async function loadLogs() {
  const container = document.getElementById('logsContainer');
  container.innerHTML = '<p style="color:var(--dim);font-size:.8rem;">Loading...</p>';
  try {
    const snap = await getDocs(query(collection(db, 'logs'), orderBy('time', 'desc'), limit(50)));
    if (snap.empty) { container.innerHTML = '<p style="color:var(--dim);font-size:.8rem;">No logs yet.</p>'; return; }
    container.innerHTML = '';
    snap.forEach(l => {
      const d = l.data();
      const timeStr = d.time?.toDate?.()?.toLocaleString() || '—';
      container.innerHTML += `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:var(--bg3);border:1px solid rgba(255,255,255,.05);border-radius:8px;margin-bottom:6px;">
          <div style="width:7px;height:7px;border-radius:50%;background:#06b6d4;margin-top:5px;flex-shrink:0;"></div>
          <div style="flex:1;">
            <p style="font-size:.8rem;">${d.message || '—'}</p>
            <p style="font-size:.67rem;color:var(--dim);margin-top:2px;">${timeStr}</p>
          </div>
        </div>`;
    });
  } catch (e) {
    container.innerHTML = `<p style="color:#f87171;font-size:.8rem;">Error: ${e.message}</p>`;
  }
}
window._loadLogs = loadLogs;

// ─────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────
document.getElementById('logoutBtn').onclick = async () => {
  await signOut(auth);
  window.location = 'login.html';
};

// ═════════════════════════════════════════════════════════
// COURSE BUILDER
// ═════════════════════════════════════════════════════════

async function loadBuilderList() {
  const sel = document.getElementById('builderSel');
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Select —</option>';
  const snap = await getDocs(collection(db, 'courses'));
  snap.forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.data().title || c.id;
    sel.appendChild(o);
  });
  if (prev) sel.value = prev;
}

document.getElementById('loadBuilderBtn').onclick = async () => {
  const id = document.getElementById('builderSel').value;
  if (!id) { toast('Select a course first', 'err'); return; }
  const snap = await getDoc(doc(db, 'courses', id));
  if (!snap.exists()) { toast('Course not found', 'err'); return; }
  populateBuilder(id, snap.data());
  toast('Course loaded', 'ok');
};

function populateBuilder(id, d) {
  document.getElementById('bId').value    = id;
  document.getElementById('bTitle').value = d.title || '';
  document.getElementById('bDesc').value  = d.description || '';
  document.getElementById('bImage').value = d.image || '';
  document.getElementById('lessonsContainer').innerHTML =
    '<p style="font-size:.78rem;color:var(--dim);text-align:center;padding:12px;">No lessons yet.</p>';
  lc = 0;

  if (d.lessons && d.lessons.length) {
    d.lessons.forEach(l => addLesson(l));
  } else if (d.video) {
    addLesson({ title: d.title, videoUrl: d.video, description: d.description || '' });
  }

  document.getElementById('builderForm').style.display = 'block';
}

document.getElementById('createBtn').onclick = async () => {
  const title = document.getElementById('newTitle').value.trim();
  const id    = document.getElementById('newId').value.trim();
  if (!title || !id) { toast('Title and ID are required', 'err'); return; }

  await setDoc(doc(db, 'courses', id), {
    title, description: '', image: '', lessons: [], createdAt: serverTimestamp()
  });

  await loadBuilderList();
  await loadDashboard();
  document.getElementById('builderSel').value = id;
  document.getElementById('newModal').classList.remove('open');
  populateBuilder(id, { title, description: '', image: '', lessons: [] });
  toast('Course created ✅', 'ok');
};

document.getElementById('saveCourseBtn').onclick = async () => {
  const id    = document.getElementById('bId').value.trim();
  const title = document.getElementById('bTitle').value.trim();
  const desc  = document.getElementById('bDesc').value.trim();
  const image = document.getElementById('bImage').value.trim();

  if (!id || !title) { toast('Course title is required', 'err'); return; }

  const lessons = getLessons();
  if (!lessons.length) { toast('Add at least one lesson with a title and video URL', 'err'); return; }

  const btn = document.getElementById('saveCourseBtn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>Saving...';

  try {
    await setDoc(doc(db, 'courses', id), {
      title, description: desc, image, lessons, updatedAt: serverTimestamp()
    }, { merge: true });

    toast('Course saved ✅', 'ok');
    loadDashboard();
    loadBuilderList();
  } catch (e) {
    toast('Save failed: ' + e.message, 'err');
  }

  btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i>Save to Firebase';
};

document.getElementById('previewBtn').onclick = () => {
  const id = document.getElementById('bId').value.trim();
  if (!id) { toast('Load a course first', 'err'); return; }
  window.open(`web-pentesting.html?id=${id}`, '_blank');
};

document.getElementById('deleteCourseBtn').onclick = async () => {
  const id    = document.getElementById('bId').value.trim();
  const title = document.getElementById('bTitle').value.trim();
  if (!id) return;
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
  await deleteDoc(doc(db, 'courses', id));
  document.getElementById('builderForm').style.display = 'none';
  document.getElementById('bId').value = '';
  await loadDashboard();
  await loadBuilderList();
  toast('Course deleted', 'ok');
};
