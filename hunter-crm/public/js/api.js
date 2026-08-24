const API_BASE = '';

const Auth = {
    getToken() { return localStorage.getItem('hcrm_token'); },
    getUser() {
        try { return JSON.parse(localStorage.getItem('hcrm_user') || 'null'); }
        catch { return null; }
    },
    setSession(token, user) {
        localStorage.setItem('hcrm_token', token);
        localStorage.setItem('hcrm_user', JSON.stringify(user));
    },
    clear() {
        localStorage.removeItem('hcrm_token');
        localStorage.removeItem('hcrm_user');
    },
    requireAuth() {
        if (!this.getToken()) window.location.href = '/login.html';
    },
    logout() {
        this.clear();
        window.location.href = '/login.html';
    },
};

async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = Auth.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    // A page whose session is gone is already navigating to /login.html. Firing
    // the request anyway just logs 401s against a document that's unloading, so
    // hand back a promise that never settles and let the navigation happen.
    if (!token && !path.startsWith('/api/auth/')) {
        Auth.logout();
        return new Promise(() => {});
    }

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    let body = null;
    try { body = await res.json(); } catch { /* no body */ }

    if (!res.ok) {
        const message = (body && body.error) || `Request failed (${res.status})`;
        // Only bounce when a session actually expired. A 401 with no token in
        // hand is a failed login, and that page needs to show the error itself.
        if (res.status === 401 && token) {
            Auth.clear();
            window.location.href = '/login.html';
        }
        throw new Error(message);
    }
    return body;
}

const apiGet = (path) => api(path);
const apiPost = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
const apiPatch = (path, body) => api(path, { method: 'PATCH', body: JSON.stringify(body) });
const apiDelete = (path) => api(path, { method: 'DELETE' });

function toast(message, type = 'success') {
    let stack = document.getElementById('toast-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'toast-stack';
        document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 3800);
}

/* ---------- formatting ---------- */

function formatMoney(n, { compact = false } = {}) {
    return Number(n).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
        notation: compact ? 'compact' : 'standard',
    });
}

function formatPercent(n, digits = 0) {
    if (n === null || n === undefined) return '—';
    return `${(Number(n) * 100).toFixed(digits)}%`;
}

function formatDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// "3 days ago" / "in 2 days" — the unit a rep actually thinks in.
function formatRelative(value) {
    if (!value) return 'never';
    const diffMs = new Date(value).getTime() - Date.now();
    const diffDays = Math.round(diffMs / 86400000);

    if (Math.abs(diffMs) < 3600000) return diffMs < 0 ? 'just now' : 'within the hour';
    if (diffDays === 0) return diffMs < 0 ? 'earlier today' : 'later today';
    if (diffDays === -1) return 'yesterday';
    if (diffDays === 1) return 'tomorrow';
    return diffDays < 0 ? `${Math.abs(diffDays)} days ago` : `in ${diffDays} days`;
}

function initials(first, last) {
    return `${(first || '?')[0]}${(last || '')[0] || ''}`.toUpperCase();
}

function titleCase(value) {
    if (!value) return '';
    return value.charAt(0) + value.slice(1).toLowerCase();
}

// Every value interpolated into innerHTML goes through this — contact names,
// company names and note bodies are all free text a user typed.
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const ACTIVITY_ICONS = { CALL: '📞', EMAIL: '✉️', MEETING: '🤝', LINKEDIN: '💼', NOTE: '📝' };
const STAGE_LABELS = {
    PROSPECTING: 'Prospecting',
    QUALIFYING: 'Qualifying',
    DEMO: 'Demo',
    PROPOSAL: 'Proposal',
    NEGOTIATION: 'Negotiation',
    WON: 'Won',
    LOST: 'Lost',
};

/* ---------- shared chrome ---------- */

function renderTopbar(active) {
    const user = Auth.getUser();
    const links = [
        ['/dashboard.html', 'Dashboard', 'dashboard'],
        ['/pipeline.html', 'Pipeline', 'pipeline'],
        ['/contacts.html', 'Contacts', 'contacts'],
    ];

    document.body.insertAdjacentHTML('afterbegin', `
        <header class="topbar">
            <a href="/dashboard.html" class="brand">
                <span class="dot"></span><span class="gradient-text">HUNTER</span>CRM
            </a>
            <nav class="nav-links">
                ${links.map(([href, label, key]) =>
                    `<a href="${href}" class="${key === active ? 'active' : ''}">${label}</a>`).join('')}
                <div class="user-chip">
                    <span>${escapeHtml(user ? user.full_name : '')}</span>
                    <button class="btn btn-ghost btn-sm" id="logout-btn">Log out</button>
                </div>
            </nav>
        </header>
    `);

    document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());
}

// Minimal modal controller: openModal/closeModal plus backdrop and Esc dismissal.
function wireModal(id) {
    const backdrop = document.getElementById(id);
    const close = () => { backdrop.hidden = true; };

    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) close();
    });
    backdrop.querySelectorAll('[data-modal-close]').forEach((el) => el.addEventListener('click', close));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !backdrop.hidden) close();
    });

    return {
        open() {
            backdrop.hidden = false;
            const first = backdrop.querySelector('input, select, textarea');
            if (first) first.focus();
        },
        close,
    };
}

function dueClass(dueAt, completedAt) {
    if (completedAt) return '';
    const due = new Date(dueAt).getTime();
    if (due < Date.now()) return 'task-due-overdue';
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return due <= endOfToday.getTime() ? 'task-due-today' : '';
}
