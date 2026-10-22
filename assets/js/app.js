/* ============================================================
   app.js — Application bootstrap: views, theme, language,
   demo data, live clock and global shortcuts
   ============================================================ */
(function (global) {
  'use strict';

  const App = {
    view: 'portal',

    /* ---------------- bootstrap ---------------- */

    init() {
      this.store = global.Store;
      this.ui = global.UI;
      this.i18n = global.I18n;

      if (global.Log && typeof global.Log.init === 'function') global.Log.init();

      this.store.init();
      this.ui.initModal();

      this._applyStoredPrefs();
      this._bindViewTabs();
      this._bindHeaderActions();
      this._bindStoreEvents();
      this._bindShortcuts();

      this.i18n.apply();
      global.Portal.init();
      global.Admin.init();
      this._renderFooterYear();
      this._tickClock();

      // Keep the live date and clock in sync with the active language.
      this._clockTimer = setInterval(() => this._tickClock(), 1000);
    },

    _applyStoredPrefs() {
      const prefs = this.store.getPrefs();
      const lang = prefs.lang === 'ar' ? 'ar' : 'en';
      this.i18n.setLanguage(lang);

      const theme = prefs.theme === 'light' ? 'light' : 'dark';
      document.documentElement.classList.toggle('light', theme === 'light');
    },

    /* ---------------- views ---------------- */

    _bindViewTabs() {
      document.querySelectorAll('[data-view]').forEach((btn) => {
        btn.addEventListener('click', () => this.setView(btn.getAttribute('data-view')));
      });
    },

    /** Switch between the employee portal, admin center, closed tickets and activity views. */
    setView(view) {
      const VIEWS = { portal: 'view-portal', admin: 'view-admin', closed: 'view-closed', activity: 'view-activity' };
      this.view = Object.prototype.hasOwnProperty.call(VIEWS, view) ? view : 'portal';

      Object.keys(VIEWS).forEach((key) => {
        const pane = document.getElementById(VIEWS[key]);
        if (!pane) return;
        pane.classList.toggle('hidden', key !== this.view);
      });

      document.querySelectorAll('[data-view]').forEach((btn) => {
        const active = btn.getAttribute('data-view') === this.view;
        btn.classList.toggle('view-tab-active', active);
        if (btn.hasAttribute('role')) btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      const mobileNav = document.getElementById('mobileNav');
      if (mobileNav) mobileNav.classList.add('hidden');

      if (this.view === 'admin') {
        global.Admin.render();
      } else if (this.view === 'closed') {
        global.Admin.renderClosed();
      } else if (this.view === 'activity') {
        global.Admin.renderActivity();
      } else {
        global.Portal.renderRecent();
      }
    },

    /* ---------------- header actions ---------------- */

    _bindHeaderActions() {
      const langBtn = document.getElementById('btnLang');
      if (langBtn) {
        langBtn.addEventListener('click', () => {
          const lang = this.i18n.toggle();
          this.store.setPref('lang', lang);
          this._retranslate();
        });
      }

      const themeBtn = document.getElementById('btnTheme');
      if (themeBtn) {
        themeBtn.addEventListener('click', () => {
          const light = document.documentElement.classList.toggle('light');
          this.store.setPref('theme', light ? 'light' : 'dark');
        });
      }

      const demoBtn = document.getElementById('btnDemo');
      if (demoBtn) demoBtn.addEventListener('click', () => this.toggleDemo());

      const menuBtn = document.getElementById('btnMobileMenu');
      if (menuBtn) {
        menuBtn.addEventListener('click', () => {
          const nav = document.getElementById('mobileNav');
          if (nav) nav.classList.toggle('hidden');
        });
      }
    },

    /** Load demo tickets, or clear everything when demo data already exists. */
    toggleDemo() {
      const hasDemo = this.store.tickets.some((t) => t.isDemo);
      if (hasDemo) {
        this.store.clearAll();
        this._syncDemoDot(false);
        global.Admin.refresh();
        this.ui.toast('success', this.i18n.t('toast.demoCleared'),
          this.i18n.t('toast.demoClearedMsg'));
        return;
      }

      const count = this.store.loadDemoData();
      this._syncDemoDot(true);
      global.Admin.refresh();
      this.ui.toast('success', this.i18n.t('toast.demoLoaded'),
        this.i18n.t('toast.demoLoadedMsg', { count: count }));
    },

    _syncDemoDot(active) {
      const dot = document.getElementById('demoDot');
      if (!dot) return;
      dot.classList.toggle('bg-emerald-400', active);
      dot.classList.toggle('bg-slate-500', !active);
    },

    /* ---------------- store events ---------------- */

    _bindStoreEvents() {
      this.store.subscribe(() => {
        global.Admin.renderMetrics();
        global.Portal.renderRecent();
        // The closed list is a separate archive: refresh it whenever the
        // active view is the closed-tickets pane.
        if (this.view === 'closed') global.Admin.renderClosed();
        // The audit trail grows with every mutation — keep it live.
        if (this.view === 'activity') global.Admin.renderActivity();
      });
    },

    /* ---------------- language re-render ---------------- */

    /** Re-render dynamic views so translated labels stay in sync. */
    _retranslate() {
      this.i18n.apply();
      global.Admin.render();
      global.Admin.renderClosed();
      global.Admin.renderActivity();
      global.Portal.renderRecent();
      this._renderFooterYear();
    },

    /* ---------------- clock & footer ---------------- */

    _tickClock() {
      const now = new Date();
      const dateEl = document.getElementById('liveDate');
      const clockEl = document.getElementById('liveClock');

      if (dateEl) {
        try {
          dateEl.textContent = new Intl.DateTimeFormat(
            this.i18n.lang === 'ar' ? 'ar-EG' : 'en-GB',
            { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit' }
          ).format(now);
        } catch (err) {
          dateEl.textContent = now.toDateString();
        }
      }
      if (clockEl) {
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        clockEl.textContent = h + ':' + m + ':' + s;
      }
    },

    _renderFooterYear() {
      const year = document.getElementById('year');
      if (year) year.textContent = String(new Date().getFullYear());
    },

    /* ---------------- keyboard shortcuts ---------------- */

    _bindShortcuts() {
      if (this._shortcutsBound) return;
      this._shortcutsBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
        if (typing) return;

        if (e.key === '1') {
          this.setView('portal');
        } else if (e.key === '2') {
          this.setView('admin');
        } else if (e.key.toLowerCase() === 'l') {
          const langBtn = document.getElementById('btnLang');
          if (langBtn) langBtn.click();
        }
      });
    }
  };

  global.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
  } else {
    App.init();
  }
})(window);
