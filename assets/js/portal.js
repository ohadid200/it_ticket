/* ============================================================
   portal.js — Employee portal: form validation, submission,
   ticket tracking, timeline and recent-ticket list
   ============================================================ */
(function (global) {
  'use strict';

  const Portal = {
    _lastCode: null,

    init() {
      this.form = document.getElementById('ticketForm');
      this.trackForm = document.getElementById('trackForm');
      this.trackCodeInput = document.getElementById('trackCode');
      this.trackResult = document.getElementById('trackResult');
      this.recentList = document.getElementById('recentList');
      this.lastTicketBox = document.getElementById('lastTicket');
      this.descCount = document.getElementById('descCount');
      this.priorityPreview = document.getElementById('priorityPreview');
      this.submitBtn = document.getElementById('btnSubmit');
      this.submitLabel = document.getElementById('btnSubmitLabel');
      this.submitSpinner = document.getElementById('btnSubmitSpinner');

      if (this.form) this._bindForm();
      if (this.trackForm) this._bindTracking();
      this._bindDescriptionCounter();
      this._bindPriorityPreview();

      this.renderRecent();
    },

    /* ---------------- form ---------------- */

    _bindForm() {
      const fields = ['reqName', 'reqId', 'reqDept', 'reqCategory', 'reqPriority', 'reqSubject', 'reqDescription'];
      fields.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const evt = (el.tagName === 'SELECT') ? 'change' : 'input';
        el.addEventListener(evt, () => this._validateField(id, false));
        el.addEventListener('blur', () => this._validateField(id, true));
      });

      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submit();
      });
    },

    _bindDescriptionCounter() {
      const ta = document.getElementById('reqDescription');
      if (!ta || !this.descCount) return;
      const update = () => { this.descCount.textContent = String(ta.value.length); };
      ta.addEventListener('input', update);
      update();
    },

    _bindPriorityPreview() {
      const sel = document.getElementById('reqPriority');
      if (!sel || !this.priorityPreview) return;
      sel.addEventListener('change', () => this._renderPriorityPreview(sel.value));
      this._renderPriorityPreview(sel.value);
    },

    _renderPriorityPreview(value) {
      if (!this.priorityPreview) return;
      this.priorityPreview.innerHTML = '';
      if (!value) return;
      const badge = global.UI.priorityBadge(value);
      const hint = document.createElement('span');
      hint.className = 'text-[11px] text-slate-500';
      hint.textContent = global.I18n.lang === 'ar'
        ? 'سيتم التعامل مع هذه الأولوية أولاً'
        : 'This priority is handled first';
      this.priorityPreview.appendChild(badge);
      this.priorityPreview.appendChild(hint);
    },

    /* ---------------- validation ---------------- */

    _rules() {
      return {
        reqName: (v) => {
          if (!v.trim()) return 'err.required';
          if (v.trim().length < 2) return 'err.nameShort';
          return null;
        },
        reqId: (v) => {
          if (!v.trim()) return 'err.required';
          const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
          const isEmpId = /^[A-Za-z]{2,6}-?\d{2,6}$/.test(v.trim());
          if (!isEmail && !isEmpId) return 'err.email';
          return null;
        },
        reqDept: (v) => (v ? null : 'err.required'),
        reqCategory: (v) => (v ? null : 'err.required'),
        reqPriority: (v) => (v ? null : 'err.required'),
        reqSubject: (v) => {
          if (!v.trim()) return 'err.required';
          if (v.trim().length < 5) return 'err.subjectShort';
          return null;
        },
        reqDescription: (v) => {
          if (!v.trim()) return 'err.required';
          if (v.trim().length < 10) return 'err.descShort';
          return null;
        }
      };
    },

    /**
     * Validate a single field.
     * @param {string} id field element id
     * @param {boolean} showError force showing the error state
     * @returns {boolean} true when the field is valid
     */
    _validateField(id, showError) {
      const el = document.getElementById(id);
      if (!el) return true;
      const rule = this._rules()[id];
      if (!rule) return true;

      const errorKey = rule(el.value);
      const errorEl = document.querySelector('[data-error-for="' + id + '"]');
      const touched = showError || el.dataset.touched === '1';

      el.classList.remove('is-invalid', 'is-valid');
      if (errorKey) {
        el.dataset.touched = '1';
        if (touched) {
          el.classList.add('is-invalid');
          if (errorEl) errorEl.textContent = global.I18n.t(errorKey);
        }
        return false;
      }
      if (el.dataset.touched === '1') el.classList.add('is-valid');
      if (errorEl) errorEl.textContent = '';
      return true;
    },

    _validateAll() {
      const ids = ['reqName', 'reqId', 'reqDept', 'reqCategory', 'reqPriority', 'reqSubject', 'reqDescription'];
      let firstInvalid = null;
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.dataset.touched = '1';
        const ok = this._validateField(id, true);
        if (!ok && !firstInvalid) firstInvalid = el;
      });
      if (firstInvalid) {
        firstInvalid.focus();
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
      return true;
    },

    /* ---------------- submission ---------------- */

    submit() {
      if (!this._validateAll()) {
        global.UI.toast('error', global.I18n.t('toast.error'), global.I18n.t('err.required'));
        return;
      }
      this._setLoading(true);

      // Simulate a short network round-trip for a realistic UX.
      setTimeout(() => {
        const data = {
          requesterName: document.getElementById('reqName').value.trim(),
          employeeId: document.getElementById('reqId').value.trim(),
          department: document.getElementById('reqDept').value,
          category: document.getElementById('reqCategory').value,
          priority: document.getElementById('reqPriority').value,
          subject: document.getElementById('reqSubject').value.trim(),
          description: document.getElementById('reqDescription').value.trim()
        };

        try {
          const ticket = global.Store.create(data);
          global.Store.rememberSessionCode(ticket.code);
          this._lastCode = ticket.code;
          this._showLastTicket(ticket);
          this.renderRecent();
          this.form.reset();
          this._clearValidation();
          if (this.descCount) this.descCount.textContent = '0';
          this._renderPriorityPreview('');
          global.UI.toast('success', global.I18n.t('toast.created'),
            global.I18n.t('toast.createdMsg', { code: ticket.code }));
          this._prefillTrack(ticket.code);
        } catch (err) {
          if (global.Log) global.Log.error('portal', 'Ticket submission failed', err);
          else console.error('[portal] submit failed:', err);
          global.UI.toast('error', global.I18n.t('toast.error'),
            String(err && err.message ? err.message : err));
        } finally {
          this._setLoading(false);
        }
      }, 550);
    },

    _setLoading(state) {
      if (this.submitBtn) this.submitBtn.disabled = state;
      if (this.submitLabel) this.submitLabel.classList.toggle('hidden', state);
      if (this.submitSpinner) this.submitSpinner.classList.toggle('hidden', !state);
    },

    _clearValidation() {
      ['reqName', 'reqId', 'reqDept', 'reqCategory', 'reqPriority', 'reqSubject', 'reqDescription'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.classList.remove('is-invalid', 'is-valid');
          delete el.dataset.touched;
        }
        const err = document.querySelector('[data-error-for="' + id + '"]');
        if (err) err.textContent = '';
      });
    },

    _prefillTrack(code) {
      if (this.trackCodeInput) this.trackCodeInput.value = code;
    },

    _showLastTicket(ticket) {
      if (!this.lastTicketBox) return;
      this.lastTicketBox.classList.remove('hidden');
      this.lastTicketBox.innerHTML =
        '<div class="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 fade-in">' +
          '<div class="flex flex-wrap items-center justify-between gap-3">' +
            '<div class="min-w-0">' +
              '<p class="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">' +
                global.UI.escape(global.I18n.t('toast.created')) + '</p>' +
              '<p class="mt-1 font-mono text-2xl font-bold tracking-wider text-white" dir="ltr">' +
                global.UI.escape(ticket.code) + '</p>' +
              '<p class="mt-1 truncate text-xs text-slate-400">' + global.UI.escape(ticket.subject) + '</p>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              '<button type="button" class="btn-ghost" data-action="copy-last">' +
                global.UI.escape(global.I18n.t('track.copy')) + '</button>' +
              '<button type="button" class="btn-secondary" data-action="track-last">' +
                global.UI.escape(global.I18n.t('track.btn')) + '</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      const copyBtn = this.lastTicketBox.querySelector('[data-action="copy-last"]');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          global.UI.copy(ticket.code).then((ok) => {
            if (ok) global.UI.toast('success', global.I18n.t('track.copied'), ticket.code);
          });
        });
      }
      const trackBtn = this.lastTicketBox.querySelector('[data-action="track-last"]');
      if (trackBtn) {
        trackBtn.addEventListener('click', () => {
          this.track(ticket.code);
          if (this.trackResult) this.trackResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    },

    /* ---------------- tracking ---------------- */

    _bindTracking() {
      this.trackForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.track(this.trackCodeInput ? this.trackCodeInput.value : '');
      });
    },

    /** Look up a ticket by code and render its tracker card. */
    track(rawCode) {
      const value = String(rawCode || '').trim();
      if (!value) {
        global.UI.toast('warning', global.I18n.t('err.codeEmpty'), '');
        return;
      }
      const code = global.Store.normaliseCode(value);
      if (!code) {
        global.UI.toast('error', global.I18n.t('err.codeFormat'), value);
        if (this.trackResult) {
          this.trackResult.innerHTML =
            '<div class="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-200 fade-in">' +
            global.UI.escape(global.I18n.t('err.codeFormat')) + '</div>';
        }
        return;
      }

      const ticket = global.Store.getByCode(code);
      if (!ticket) {
        if (this.trackResult) {
          this.trackResult.innerHTML =
            '<div class="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-200 fade-in">' +
            global.UI.escape(global.I18n.t('track.notFound')) + '</div>';
        }
        global.UI.toast('warning', global.I18n.t('track.notFound'), code);
        return;
      }
      this.renderTicket(ticket);
    },

    /** Render the full tracker card for a ticket. */
    renderTicket(ticket) {
      if (!this.trackResult) return;
      const esc = global.UI.escape;
      const status = ticket.status;
      const progress = this._progressFor(status);
      const rejected = status === 'rejected';

      this.trackResult.innerHTML =
        '<div class="glass-card fade-in p-4 sm:p-5" data-ticket-id="' + esc(ticket.id) + '">' +
          '<div class="flex flex-wrap items-start justify-between gap-3">' +
            '<div class="min-w-0">' +
              '<p class="font-mono text-lg font-bold tracking-wider text-brand-300" dir="ltr">' + esc(ticket.code) + '</p>' +
              '<p class="mt-1 text-sm font-semibold text-white">' + esc(ticket.subject) + '</p>' +
            '</div>' +
            '<div class="flex flex-wrap items-center gap-2" data-badges></div>' +
          '</div>' +

          '<div class="mt-4">' +
            '<div class="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-500">' +
              '<span>' + esc(global.I18n.t('track.progress')) + '</span>' +
              '<span>' + esc(global.I18n.status(status)) + '</span>' +
            '</div>' +
            '<div class="progress-track"><div class="progress-fill" style="width:' + progress + '%"></div></div>' +
          '</div>' +

          '<div class="mt-4">' + this._timelineHTML(status) + '</div>' +

          (rejected && ticket.rejectionReason
            ? '<div class="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3">' +
                '<p class="text-[11px] font-semibold uppercase tracking-wider text-rose-300">' +
                  esc(global.I18n.status('rejected')) + '</p>' +
                '<p class="mt-1 text-sm text-rose-100">' + esc(ticket.rejectionReason) + '</p>' +
              '</div>'
            : '') +

          '<dl class="mt-4 grid gap-3 sm:grid-cols-2">' +
            this._infoRow(global.I18n.t('track.requester'), ticket.requesterName + ' · ' + ticket.employeeId) +
            this._infoRow(global.I18n.t('track.department'), ticket.department) +
            this._infoRow(global.I18n.t('track.category'), ticket.category) +
            this._infoRow(global.I18n.t('track.priority'), ticket.priority) +
            this._infoRow(global.I18n.t('track.created'), global.UI.formatDate(ticket.createdAt)) +
            this._infoRow(global.I18n.t('track.updated'), global.UI.formatDate(ticket.updatedAt)) +
            this._infoRow(global.I18n.t('track.assignee'),
              ticket.assignee && ticket.assignee !== 'Unassigned' ? ticket.assignee : global.I18n.t('track.unassigned')) +
            this._infoRow(global.I18n.t('admin.description'), ticket.description, true) +
          '</dl>' +

          '<div class="mt-5">' +
            '<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">' +
              esc(global.I18n.t('track.notes')) + '</p>' +
            '<div data-notes>' + this._notesHTML(ticket) + '</div>' +
          '</div>' +

          '<div class="mt-5 flex flex-wrap gap-2">' +
            '<button type="button" class="btn-ghost" data-action="copy-code">' +
              esc(global.I18n.t('track.copy')) + '</button>' +
            '<button type="button" class="btn-ghost" data-action="track-another">' +
              esc(global.I18n.t('track.trackAnother')) + '</button>' +
          '</div>' +
        '</div>';

      const badges = this.trackResult.querySelector('[data-badges]');
      if (badges) {
        badges.appendChild(global.UI.statusBadge(status));
        badges.appendChild(global.UI.priorityBadge(ticket.priority));
        const cat = document.createElement('span');
        cat.className = 'badge badge-cat';
        cat.textContent = ticket.category;
        badges.appendChild(cat);
      }

      const copyBtn = this.trackResult.querySelector('[data-action="copy-code"]');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          global.UI.copy(ticket.code).then((ok) => {
            if (ok) global.UI.toast('success', global.I18n.t('track.copied'), ticket.code);
          });
        });
      }
      const another = this.trackResult.querySelector('[data-action="track-another"]');
      if (another) {
        another.addEventListener('click', () => {
          this.trackResult.innerHTML = '';
          if (this.trackCodeInput) {
            this.trackCodeInput.value = '';
            this.trackCodeInput.focus();
          }
        });
      }
    },

    _infoRow(label, value, wide) {
      const esc = global.UI.escape;
      return '<div' + (wide ? ' class="sm:col-span-2"' : '') + '>' +
        '<dt class="text-[11px] uppercase tracking-wider text-slate-500">' + esc(label) + '</dt>' +
        '<dd class="mt-0.5 text-sm text-slate-200 break-words">' + esc(value || '—') + '</dd>' +
      '</div>';
    },

    /** Percentage of the pipeline completed for a status. */
    _progressFor(status) {
      const map = {
        pending: 12, analyzing: 38, in_progress: 68,
        on_hold: 50, resolved: 100, rejected: 100
      };
      return map[status] !== undefined ? map[status] : 0;
    },

    /** HTML for the 4-step progress stepper. */
    _timelineHTML(status) {
      const esc = global.UI.escape;
      const steps = global.Store.PIPELINE;
      const currentIndex = status === 'rejected' || status === 'on_hold'
        ? steps.indexOf(status === 'on_hold' ? 'in_progress' : 'pending')
        : steps.indexOf(status);

      const html = steps.map((step, i) => {
        let cls = 'timeline-step';
        let mark = String(i + 1);
        if (status === 'rejected' && i === 0) {
          cls += ' is-rejected';
          mark = '×';
        } else if (currentIndex > -1 && i < currentIndex) {
          cls += ' is-done';
          mark = '✓';
        } else if (currentIndex > -1 && i === currentIndex) {
          cls += ' is-current';
          mark = String(i + 1);
        }
        return '<div class="' + cls + '">' +
          '<span class="timeline-line"></span>' +
          '<span class="timeline-dot">' + mark + '</span>' +
          '<span class="timeline-label">' + esc(global.I18n.status(step)) + '</span>' +
        '</div>';
      }).join('');

      return '<div class="timeline">' + html + '</div>';
    },

    /** HTML for the requester-visible notes feed. */
    _notesHTML(ticket) {
      const esc = global.UI.escape;
      if (!ticket.notes || !ticket.notes.length) {
        return '<p class="rounded-xl border border-white/10 bg-slate-900/40 p-3 text-xs text-slate-500">' +
          esc(global.I18n.t('track.noNotes')) + '</p>';
      }
      return ticket.notes.map((n) =>
        '<div class="note-item">' +
          '<div class="note-meta">' + esc(n.author) + ' · ' + esc(global.UI.relativeTime(n.createdAt)) + '</div>' +
          '<p class="note-text">' + esc(n.text) + '</p>' +
        '</div>').join('');
    },

    /* ---------------- recent tickets ---------------- */

    renderRecent() {
      if (!this.recentList) return;
      const codes = global.Store.getSessionCodes();
      const esc = global.UI.escape;

      if (!codes.length) {
        this.recentList.innerHTML =
          '<p class="rounded-lg border border-dashed border-white/10 p-3 text-center text-xs text-slate-500">' +
          esc(global.I18n.t('track.noNotes')) + '</p>';
        return;
      }

      this.recentList.innerHTML = codes.map((code) => {
        const ticket = global.Store.getByCode(code);
        if (!ticket) return '';
        return '<button type="button" data-code="' + esc(ticket.code) + '" ' +
          'class="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-start transition hover:border-brand-400/40 hover:bg-white/10">' +
          '<span class="min-w-0">' +
            '<span class="block font-mono text-xs font-bold tracking-wider text-brand-300" dir="ltr">' + esc(ticket.code) + '</span>' +
            '<span class="block truncate text-[11px] text-slate-400">' + esc(ticket.subject) + '</span>' +
          '</span>' +
          '<span data-badge></span>' +
        '</button>';
      }).join('');

      this.recentList.querySelectorAll('[data-code]').forEach((btn) => {
        const code = btn.getAttribute('data-code');
        const ticket = global.Store.getByCode(code);
        const slot = btn.querySelector('[data-badge]');
        if (ticket && slot) slot.appendChild(global.UI.statusBadge(ticket.status));
        btn.addEventListener('click', () => {
          this.track(code);
          if (this.trackResult) this.trackResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
    }
  };

  global.Portal = Portal;
})(window);




