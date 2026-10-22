/* ============================================================
   ui.js — Toasts, Modal, badges and shared render helpers
   ============================================================ */
(function (global) {
  'use strict';

  const TOAST_ICONS = {
    success: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"></path></svg>',
    error: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>',
    info: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 16v-5M12 8h.01"></path><circle cx="12" cy="12" r="9"></circle></svg>',
    warning: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path></svg>'
  };

  const UI = {
    _toastSeq: 0,
    _modalResolve: null,

    /** Display a toast notification. type: success | error | info | warning */
    toast(type, title, message, duration) {
      const stack = document.getElementById('toastStack');
      if (!stack) return null;
      const kind = TOAST_ICONS[type] ? type : 'info';
      const el = document.createElement('div');
      el.className = 'toast toast-' + kind;
      el.dataset.toastId = String(++this._toastSeq);
      el.innerHTML =
        '<div class="toast-icon">' + TOAST_ICONS[kind] + '</div>' +
        '<div class="min-w-0 flex-1">' +
          '<p class="toast-title"></p>' +
          (message ? '<p class="toast-msg"></p>' : '') +
        '</div>' +
        '<button class="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-white/10 hover:text-white" aria-label="Dismiss">' +
          '<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>' +
        '</button>';

      el.querySelector('.toast-title').textContent = title || '';
      if (message) el.querySelector('.toast-msg').textContent = message;

      const dismiss = () => {
        if (el.classList.contains('is-hiding')) return;
        el.classList.add('is-hiding');
        setTimeout(() => el.remove(), 260);
      };

      el.querySelector('button').addEventListener('click', dismiss);
      stack.appendChild(el);
      setTimeout(dismiss, duration || 4200);
      return el;
    },

    /* ---------------- modal ---------------- */

    /**
     * Open a modal dialog.
     * options: { title, bodyHTML, confirmText, cancelText, danger, hideFooter,
     *            onConfirm(ctx), onOpen(ctx) }
     * Returns a Promise resolving to true (confirm) / false (cancel).
     */
    modal(options) {
      const o = options || {};
      const backdrop = document.getElementById('modalBackdrop');
      const titleEl = document.getElementById('modalTitle');
      const bodyEl = document.getElementById('modalBody');
      const footerEl = document.getElementById('modalFooter');
      if (!backdrop || !titleEl || !bodyEl || !footerEl) return Promise.resolve(false);

      titleEl.textContent = o.title || '';
      bodyEl.innerHTML = o.bodyHTML || '';
      footerEl.innerHTML = '';

      const ctx = {
        bodyEl: bodyEl,
        close: (value) => this._closeModal(value),
        getInput: (sel) => bodyEl.querySelector(sel)
      };

      if (!o.hideFooter) {
        if (o.cancelText !== null) {
          const cancelBtn = document.createElement('button');
          cancelBtn.className = 'btn-ghost';
          cancelBtn.type = 'button';
          cancelBtn.textContent = o.cancelText || global.I18n.t('modal.cancel');
          cancelBtn.addEventListener('click', () => this._closeModal(false));
          footerEl.appendChild(cancelBtn);
        }
        if (o.confirmText) {
          const okBtn = document.createElement('button');
          okBtn.className = o.danger ? 'btn-danger' : 'btn-primary';
          okBtn.type = 'button';
          okBtn.id = 'modalConfirmBtn';
          okBtn.textContent = o.confirmText;
          okBtn.addEventListener('click', () => {
            if (typeof o.onConfirm === 'function') {
              const result = o.onConfirm(ctx);
              if (result === false) return; // keep the modal open (validation failed)
            }
            this._closeModal(true);
          });
          footerEl.appendChild(okBtn);
        }
      }

      backdrop.classList.remove('hidden');
      backdrop.classList.add('is-open');
      this._modalResolve = null;

      if (typeof o.onOpen === 'function') o.onOpen(ctx);

      const focusTarget = bodyEl.querySelector('input, textarea, select');
      if (focusTarget) setTimeout(() => focusTarget.focus(), 60);

      return new Promise((resolve) => { this._modalResolve = resolve; });
    },

    _closeModal(value) {
      const backdrop = document.getElementById('modalBackdrop');
      if (backdrop) {
        backdrop.classList.remove('is-open');
        backdrop.classList.add('hidden');
      }
      if (this._modalResolve) {
        const r = this._modalResolve;
        this._modalResolve = null;
        r(!!value);
      }
    },

    /** Close the modal on backdrop click, close button, or Escape. */
    initModal() {
      const backdrop = document.getElementById('modalBackdrop');
      const closeBtn = document.getElementById('modalClose');
      if (backdrop) {
        backdrop.addEventListener('mousedown', (e) => {
          if (e.target === backdrop) this._closeModal(false);
        });
      }
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this._closeModal(false));
      }
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && backdrop && backdrop.classList.contains('is-open')) {
          this._closeModal(false);
        }
      });
    },

    /* ---------------- formatting helpers ---------------- */

    /** Format an ISO date using the active locale. */
    formatDate(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      try {
        return new Intl.DateTimeFormat(global.I18n.lang === 'ar' ? 'ar-EG' : 'en-GB', {
          year: 'numeric', month: 'short', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false
        }).format(d);
      } catch (err) {
        return d.toLocaleString();
      }
    },

    formatTime(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      try {
        return d.toLocaleTimeString(global.I18n.lang === 'ar' ? 'ar-EG' : 'en-GB', {
          hour: '2-digit', minute: '2-digit', hour12: false
        });
      } catch (err) {
        return d.toLocaleTimeString();
      }
    },

    /** Human-readable relative time, e.g. "3 hours ago". */
    relativeTime(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      const diff = Math.floor((Date.now() - d.getTime()) / 1000);
      let rtf;
      try {
        rtf = new Intl.RelativeTimeFormat(global.I18n.lang === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
      } catch (err) {
        return this.formatDate(iso);
      }
      if (diff < 60) return rtf.format(-diff, 'second');
      if (diff < 3600) return rtf.format(-Math.floor(diff / 60), 'minute');
      if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), 'hour');
      if (diff < 2592000) return rtf.format(-Math.floor(diff / 86400), 'day');
      return this.formatDate(iso);
    },

    /** Escape user-supplied text before injecting it into HTML. */
    escape(text) {
      if (text === null || text === undefined) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    /** Build a status badge element. */
    statusBadge(status) {
      const span = document.createElement('span');
      span.className = 'badge badge-' + status;
      span.textContent = global.I18n.status(status);
      return span;
    },

    /** Build a priority badge element. */
    priorityBadge(priority) {
      const span = document.createElement('span');
      span.className = 'badge badge-' + String(priority).toLowerCase();
      span.textContent = priority;
      return span;
    },

    /** Trigger a client-side file download. */
    download(filename, content, mime) {
      try {
        const blob = new Blob(['\uFEFF' + content], { type: (mime || 'text/plain') + ';charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        return true;
      } catch (err) {
        if (global.Log) global.Log.error('ui', 'Download failed', err);
        else console.error('[ui] download failed:', err);
        return false;
      }
    },

    /** Copy text to the clipboard with a graceful fallback. */
    copy(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(() => true).catch(() => this._copyFallback(text));
      }
      return Promise.resolve(this._copyFallback(text));
    },

    _copyFallback(text) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (err) {
        return false;
      }
    }
  };

  global.UI = UI;
})(window);


