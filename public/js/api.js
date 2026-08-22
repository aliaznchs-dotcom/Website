const API_BASE = '';

const Auth = {
    getToken() { return localStorage.getItem('nxt_token'); },
    getUser() {
        try { return JSON.parse(localStorage.getItem('nxt_user') || 'null'); }
        catch { return null; }
    },
    setSession(token, user) {
        localStorage.setItem('nxt_token', token);
        localStorage.setItem('nxt_user', JSON.stringify(user));
    },
    clear() {
        localStorage.removeItem('nxt_token');
        localStorage.removeItem('nxt_user');
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

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    let body = null;
    try { body = await res.json(); } catch { /* no body */ }

    if (!res.ok) {
        const message = (body && body.error) || `Request failed (${res.status})`;
        if (res.status === 401) Auth.clear();
        throw new Error(message);
    }
    return body;
}

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

function formatMoney(n) {
    return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function formatNumber(n, digits = 4) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits });
}
