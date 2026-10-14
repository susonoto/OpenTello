// End-to-end encrypted chat. The room secret lives only in the URL fragment (#...),
// which browsers never send to the server. From it we derive:
//   - an AES-256-GCM key that encrypts every message (including names) in the browser
//   - a SHA-256 room tag the relay uses to group ciphertext without learning the secret
const API = '/api/relay';
const POLL_VISIBLE_MS = 2500;
const POLL_HIDDEN_MS = 15000;

const joinScreen = document.getElementById('join-screen');
const chatScreen = document.getElementById('chat-screen');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const joinHint = document.getElementById('join-hint');
const messages = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const copyBtn = document.getElementById('copy-btn');
const statusEl = document.getElementById('status');

const enc = new TextEncoder();
const dec = new TextDecoder();

let myName = '';
let roomTag = '';
let aesKey = null;
let cursor = -1;
let polling = false;
let pollTimer = 0;
let leaveData = '';
const ownNonces = new Set();

function toB64(bytes) {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function fromB64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

function toB64Url(bytes) {
  return toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return fromB64(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

async function setupRoom(secret) {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey', 'deriveBits']);
  const hkdf = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('opentello-v1'), info: enc.encode(info) });
  aesKey = await crypto.subtle.deriveKey(hkdf('message-key'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const tagBits = await crypto.subtle.deriveBits(hkdf('room-tag'), base, 256);
  roomTag = [...new Uint8Array(tagBits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function encrypt(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(JSON.stringify(obj))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64(out);
}

async function decrypt(data) {
  const bytes = fromB64(data);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, aesKey, bytes.slice(12));
  return JSON.parse(dec.decode(plain));
}

async function post(payload) {
  const n = toB64(crypto.getRandomValues(new Uint8Array(12)));
  ownNonces.add(n);
  payload.n = n;
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: roomTag, data: await encrypt(payload) })
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
}

// Reuse an invite link's secret, or create a new room.
function roomSecretFromHash() {
  const hash = location.hash.slice(1);
  if (!hash) return null;
  try {
    const bytes = fromB64Url(hash);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

if (roomSecretFromHash()) {
  joinHint.textContent = 'You were invited to a private, end-to-end encrypted room.';
  joinBtn.textContent = 'Join room';
}

async function join() {
  if (!window.crypto?.subtle) {
    alert('This browser does not support the encryption this chat requires (a secure HTTPS connection is needed).');
    return;
  }
  let secret = roomSecretFromHash();
  if (!secret) {
    secret = crypto.getRandomValues(new Uint8Array(32));
    history.replaceState(null, '', '#' + toB64Url(secret));
  }
  await setupRoom(secret);

  myName = nameInput.value.trim().slice(0, 20) || 'Anonymous';
  joinScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  msgInput.focus();

  await poll(); // fetch the starting cursor so earlier traffic is skipped
  addSystem(`You joined as ${myName}. Share the invite link to bring others in. Messages vanish when you close the page.`);
  post({ t: 'join', u: myName }).catch(() => {});
  // Prepared ahead of time: the page may close before async encryption could finish.
  leaveData = await encrypt({ t: 'leave', u: myName });
}

joinBtn.addEventListener('click', join);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') join();
});

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    copyBtn.textContent = 'Copied';
  } catch {
    prompt('Copy this invite link:', location.href);
  }
  setTimeout(() => (copyBtn.textContent = 'Copy invite link'), 1500);
});

async function send() {
  const text = msgInput.value.trim().slice(0, 500);
  if (!text) return;
  msgInput.value = '';
  msgInput.focus();
  try {
    await post({ t: 'msg', u: myName, m: text, ts: Date.now() });
    addMessage({ user: myName, text, time: formatTime(Date.now()), own: true });
  } catch {
    msgInput.value = text;
    addSystem('Message could not be sent. Try again.');
  }
}

sendBtn.addEventListener('click', send);
msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') send();
});

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function clean(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

async function handle(item) {
  let p;
  try {
    p = await decrypt(item.data);
  } catch {
    return; // not decryptable with this room's key; ignore
  }
  if (ownNonces.delete(p.n)) return; // our own message, already shown
  const user = clean(p.u, 20) || 'Anonymous';
  if (p.t === 'join') addSystem(`${user} joined`);
  else if (p.t === 'leave') addSystem(`${user} left`);
  else if (p.t === 'msg') addMessage({ user, text: clean(p.m, 500), time: formatTime(Number(p.ts) || Date.now()) });
}

async function poll() {
  if (polling) return;
  polling = true;
  clearTimeout(pollTimer);
  try {
    const url = cursor < 0 ? `${API}?room=${roomTag}` : `${API}?room=${roomTag}&after=${cursor}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    const body = await res.json();
    for (const item of body.items) await handle(item);
    cursor = body.cursor;
    statusEl.textContent = '🔒 Encrypted · Connected';
  } catch {
    statusEl.textContent = 'Disconnected';
  } finally {
    polling = false;
    // Poll less often in background tabs to stay well within free-tier limits.
    pollTimer = setTimeout(poll, document.hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS);
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && roomTag) poll();
});

window.addEventListener('pagehide', () => {
  if (!leaveData) return;
  navigator.sendBeacon(API, new Blob([JSON.stringify({ room: roomTag, data: leaveData })], { type: 'application/json' }));
});

function addMessage(data) {
  const div = document.createElement('div');
  div.className = 'msg' + (data.own ? ' own' : '');

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${data.user} · ${data.time}`;

  const text = document.createElement('div');
  text.className = 'text';
  text.textContent = data.text;

  div.appendChild(meta);
  div.appendChild(text);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function addSystem(text) {
  const div = document.createElement('div');
  div.className = 'msg system';
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}
