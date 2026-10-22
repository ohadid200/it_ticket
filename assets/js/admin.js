/* ============================================================
   admin.js — Command center: metrics, filters, ticket feed,
   status/assignment updates, notes, rejection and deletion
   ============================================================ */
(function (global) {
  'use strict';

  const Admin = {
    filters: { search: '', status: 'all', priority: 'all', sort: 'newest' },
    activityFilters: { action: 'all', search: '' },
    _expanded: {},

    init() {
      this.feed = document.getElementById('adminFeed');
      this.empty = document.getElementById('adminEmpty');
      this.metricsBox = document.getElementById('metrics');
      this.resultCount = document.getElementById('resultCount');
      this.searchInput = document.getElementById('adminSearch');
      this.statusFilter = document.getElementById('filterStatus');
      this.priorityFilter = document.getElementById('filterPriority');
      this.sortSelect = document.getElementById('sortBy');
      this.resetBtn = document.getElementById('btnResetFilters');

      this.activityFeed = document.getElementById('activityFeed');
      this.activityEmpty = document.getElementById('activityEmpty');
      this.activityCount = document.getElementById('activityCount');
      this.activityTypeFilter = document.getElementById('activityType');
      this.activitySearch = document.getElementById('activitySearch');
      this.activityResetBtn = document.getElementById('btnActivityReset');
      this.activityExportBtn = document.getElementById('btnActivityExport');
      this.activityClearBtn = document.getElementById('btnActivityClear');

      this._bindFilters();
      this._bindExports();
      this._bindTeamButton();
      this._bindActivity();
      this.render();
      this.renderActivity();
    },

    _bindFilters() {
      if (this.searchInput) {
        this.searchInput.addEventListener('input', () => {
          this.filters.search = this.searchInput.value;
          this.render();
        });
      }
      if (this.statusFilter) {
        this.statusFilter.addEventListener('change', () => {
          this.filters.status = this.statusFilter.value;
          this.render();
        });
      }
      if (this.priorityFilter) {
        this.priorityFilter.addEventListener('change', () => {
          this.filters.priority = this.priorityFilter.value;
          this.render();
        });
      }
      if (this.sortSelect) {
        this.sortSelect.addEventListener('change', () => {
          this.filters.sort = this.sortSelect.value;
          this.render();
        });
      }
      if (this.resetBtn) {
        this.resetBtn.addEventListener('click', () => this.resetFilters());
      }
    },

    resetFilters() {
      this.filters = { search: '', status: 'all', priority: 'all', sort: 'newest' };
      if (this.searchInput) this.searchInput.value = '';
      if (this.statusFilter) this.statusFilter.value = 'all';
      if (this.priorityFilter) this.priorityFilter.value = 'all';
      if (this.sortSelect) this.sortSelect.value = 'newest';
      this.render();
    },

    _bindExports() {
      const csvBtn = document.getElementById('btnExportCsv');
      const jsonBtn = document.getElementById('btnExportJson');
      if (csvBtn) csvBtn.addEventListener('click', () => this.exportData('csv'));
      if (jsonBtn) jsonBtn.addEventListener('click', () => this.exportData('json'));
    },

    _bindTeamButton() {
      const btn = document.getElementById('btnManageTeam');
      if (btn) btn.addEventListener('click', () => this.openTeamManager());
    },

    /* ---------------- activity log ---------------- */

    _bindActivity() {
      if (this.activityTypeFilter) {
        this.activityTypeFilter.addEventListener('change', () => {
          this.activityFilters.action = this.activityTypeFilter.value;
          this.renderActivity();
        });
      }
      if (this.activitySearch) {
        this.activitySearch.addEventListener('input', () => {
          this.activityFilters.search = this.activitySearch.value;
          this.renderActivity();
        });
      }
      if (this.activityResetBtn) {
        this.activityResetBtn.addEventListener('click', () => this.resetActivityFilters());
      }
      if (this.activityExportBtn) {
        this.activityExportBtn.addEventListener('click', () => this.exportActivity());
      }
      if (this.activityClearBtn) {
        this.activityClearBtn.addEventListener('click', () => this.clearActivity());
      }
    },

    resetActivityFilters() {
      this.activityFilters = { action: 'all', search: '' };
      if (this.activityTypeFilter) this.activityTypeFilter.value = 'all';
      if (this.activitySearch) this.activitySearch.value = '';
      this.renderActivity();
    },

    /** Populate the event-type filter with the known action types. */
    _renderActivityTypes() {
      if (!this.activityTypeFilter) return;
      const select = this.activityTypeFilter;
      const current = this.activityFilters.action;
      select.innerHTML = '';

      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = global.I18n.t('activity.allTypes');
      select.appendChild(allOption);

      global.Activity.TYPES.forEach((type) => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = global.I18n.t('activity.type.' + type);
        select.appendChild(opt);
      });

      select.value = global.Activity.TYPES.indexOf(current) !== -1 ? current : 'all';
      this.activityFilters.action = select.value;
    },

    /** Render the persistent activity / audit log. */
    renderActivity() {
      if (!global.Activity) return;
      this._renderActivityTypes();

      const events = global.Activity.query({
        action: this.activityFilters.action,
        search: this.activityFilters.search
      });

      if (this.activityCount) this.activityCount.textContent = String(events.length);
      if (!this.activityFeed) return;

      this.activityFeed.innerHTML = '';
      if (!events.length) {
        if (this.activityEmpty) this.activityEmpty.classList.remove('hidden');
        return;
      }
      if (this.activityEmpty) this.activityEmpty.classList.add('hidden');

      const esc = global.UI.escape;
      const frag = document.createDocumentFragment();
      events.forEach((event) => {
        const row = document.createElement('div');
        row.className = 'activity-row';
        row.dataset.activityId = event.id;
        row.dataset.activityAction = event.action;
        row.innerHTML =
          '<span class="activity-dot activity-dot-' + esc(event.action) + '"></span>' +
          '<div class="min-w-0 flex-1">' +
            '<div class="flex flex-wrap items-center gap-2">' +
              '<span class="activity-action">' + esc(global.I18n.t('activity.type.' + event.action)) + '</span>' +
              (event.code ? '<span class="badge badge-code" dir="ltr">' + esc(event.code) + '</span>' : '') +
            '</div>' +
            '<p class="mt-1 text-xs text-slate-300">' + esc(event.details) + '</p>' +
          '</div>' +
          '<time class="activity-time shrink-0" datetime="' + esc(event.at) + '">' +
            esc(global.UI.formatDate(event.at)) +
          '</time>';
        frag.appendChild(row);
      });
      this.activityFeed.appendChild(frag);
    },

    /** Export the currently filtered activity events as CSV. */
    exportActivity() {
      if (!global.Activity) return;
      const events = global.Activity.query({
        action: this.activityFilters.action,
        search: this.activityFilters.search
      });
      if (!events.length) {
        global.UI.toast('warning', global.I18n.t('activity.emptyTitle'), global.I18n.t('activity.emptySub'));
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const ok = global.UI.download('it-activity-' + stamp + '.csv', global.Activity.toCSV(events), 'text/csv');
      if (ok) {
        global.UI.toast('success', global.I18n.t('toast.exported'),
          global.I18n.t('toast.exportedMsg', { count: events.length, format: 'CSV' }));
      }
    },

    /** Confirm and clear all activity log entries from localStorage. */
    clearActivity() {
      if (!global.Activity) return;
      const count = global.Activity.count();
      if (!count) {
        global.UI.toast('info', global.I18n.t('activity.emptyTitle'), global.I18n.t('activity.emptySub'));
        return;
      }
      const self = this;
      global.UI.modal({
        title: global.I18n.t('activity.clearConfirmTitle'),
        bodyHTML: '<p>' + global.UI.escape(global.I18n.t('activity.clearConfirm')) + '</p>',
        confirmText: global.I18n.t('activity.clear'),
        cancelText: global.I18n.t('modal.cancel'),
        danger: true,
        onConfirm: () => {
          global.Activity.clear();
          self.renderActivity();
          global.UI.toast('success', global.I18n.t('activity.clearedTitle'),
            global.I18n.t('activity.clearedMsg', { count: count }));
          return true;
        }
      });
    },

    /* ---------------- team management ---------------- */

    /**
     * Modal for adding/removing assignees. The roster lives in
     * Store.TEAM (persisted); changes here refresh the feed so every
     * assignee dropdown picks up the new list immediately.
     */
    openTeamManager() {
      const esc = global.UI.escape;
      const self = this;
      const I = global.I18n;

      const memberRow = (m) => {
        const locked = m === 'Unassigned';
        const parts = m.split('—');
        const name = locked ? I.t('admin.unassigned') : parts[0].trim();
        const role = locked ? '' : parts.slice(1).join('—').trim();
        return '<li class="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">' +
          '<div class="min-w-0">' +
            '<p class="truncate text-xs font-semibold text-white">' + esc(name) + '</p>' +
            (role ? '<p class="truncate text-[11px] text-slate-400">' + esc(role) + '</p>' : '') +
          '</div>' +
          (locked
            ? ''
            : '<button type="button" class="team-member-remove grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-300" data-value="' + esc(m) + '" aria-label="' + esc(I.t('team.remove')) + '">' +
              '<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>' +
              '</button>') +
        '</li>';
      };

      global.UI.modal({
        title: I.t('team.title'),
        cancelText: null,
        confirmText: I.t('modal.close'),
        bodyHTML:
          '<p class="mb-3 text-xs text-slate-400">' + esc(I.t('team.hint')) + '</p>' +
          '<ul id="teamList" class="scroll-thin max-h-56 space-y-2 overflow-y-auto pe-1"></ul>' +
          '<div class="mt-4 grid grid-cols-2 gap-2">' +
            '<input id="teamNameInput" class="field-input h-9 py-1 text-xs" maxlength="40" placeholder="' + esc(I.t('team.namePh')) + '" />' +
            '<input id="teamRoleInput" class="field-input h-9 py-1 text-xs" maxlength="40" placeholder="' + esc(I.t('team.rolePh')) + '" />' +
          '</div>' +
          '<p id="teamFormError" class="mt-1 min-h-[1rem] text-[11px] font-semibold text-rose-400"></p>' +
          '<button id="teamAddBtn" type="button" class="btn-ghost mt-2 w-full justify-center">' + esc(I.t('team.add')) + '</button>',
        onOpen: (ctx) => {
          const list = ctx.bodyEl.querySelector('#teamList');
          const nameInput = ctx.bodyEl.querySelector('#teamNameInput');
          const roleInput = ctx.bodyEl.querySelector('#teamRoleInput');
          const errEl = ctx.bodyEl.querySelector('#teamFormError');
          const addBtn = ctx.bodyEl.querySelector('#teamAddBtn');

          const renderList = () => { list.innerHTML = global.Store.TEAM.map(memberRow).join(''); };
          renderList();

          addBtn.addEventListener('click', () => {
            const name = String(nameInput.value || '').trim();
            const added = global.Store.addTeamMember(name, roleInput.value);
            if (!added) {
              errEl.textContent = name.length < 2 ? I.t('team.nameShort') : I.t('team.duplicate');
              return;
            }
            errEl.textContent = '';
            nameInput.value = '';
            roleInput.value = '';
            renderList();
            self.render();
            nameInput.focus();
            global.UI.toast('success', I.t('team.added'), I.t('team.addedMsg', { name: added }));
          });

          list.addEventListener('click', (e) => {
            const btn = e.target.closest('.team-member-remove');
            if (!btn) return;
            const value = btn.getAttribute('data-value');
            const result = global.Store.removeTeamMember(value);
            if (!result) return;
            renderList();
            self.render();
            global.UI.toast('success', I.t('team.removed'),
              result.reassigned
                ? I.t('team.reassignedMsg', { name: value, count: result.reassigned })
                : I.t('team.removedMsg', { name: value }));
          });
        }
      });
    },

    /**
     * Export the currently filtered ticket set as CSV or JSON.
     * The exported payload always matches what the admin is looking at.
     */
    exportData(format) {
      const list = global.Store.query(this.filters);
      if (!list.length) {
        global.UI.toast('warning', global.I18n.t('admin.emptyTitle'), global.I18n.t('admin.emptySub'));
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'csv') {
        const ok = global.UI.download('it-tickets-' + stamp + '.csv', global.Store.toCSV(list), 'text/csv');
        if (ok) {
          global.UI.toast('success', global.I18n.t('toast.exported'),
            global.I18n.t('toast.exportedMsg', { count: list.length, format: 'CSV' }));
        }
      } else {
        const ok = global.UI.download('it-tickets-' + stamp + '.json', global.Store.toJSON(list), 'application/json');
        if (ok) {
          global.UI.toast('success', global.I18n.t('toast.exported'),
            global.I18n.t('toast.exportedMsg', { count: list.length, format: 'JSON' }));
        }
      }
    },

    /* ---------------- rendering ---------------- */

    /**
     * Locate every card for a ticket — it can be rendered in the admin feed
     * and in the closed-tickets archive at the same time.
     */
    _findCards(id) {
      const sel = '[data-ticket-id="' + id + '"]';
      const found = [];
      if (this.feed) {
        this.feed.querySelectorAll(sel).forEach((el) => found.push(el));
      }
      const closedBox = document.getElementById('closedTicketsContainer');
      if (closedBox) {
        closedBox.querySelectorAll(sel).forEach((el) => {
          if (found.indexOf(el) === -1) found.push(el);
        });
      }
      return found;
    },

    /**
     * Locate a ticket card wherever it is currently rendered — the admin
     * feed or the closed-tickets archive.
     */
    _findCard(id) {
      const sel = '[data-ticket-id="' + id + '"]';
      const feed = this.feed ? this.feed.querySelector(sel) : null;
      if (feed) return feed;
      const closedBox = document.getElementById('closedTicketsContainer');
      return closedBox ? closedBox.querySelector(sel) : null;
    },

    /** Patch every rendered copy of a ticket card. */
    _patchAllCards(ticket) {
      this._findCards(ticket.id).forEach((card) => this._patchCard(card, ticket));
    },

    render() {
      this.renderMetrics();
      const list = global.Store.query(this.filters);
      if (this.resultCount) this.resultCount.textContent = String(list.length);
      if (!this.feed) return;

      this.feed.innerHTML = '';
      if (!list.length) {
        if (this.empty) this.empty.classList.remove('hidden');
        return;
      }
      if (this.empty) this.empty.classList.add('hidden');

      const frag = document.createDocumentFragment();
      list.forEach((ticket) => frag.appendChild(this._ticketCard(ticket)));
      this.feed.appendChild(frag);
    },

    renderMetrics() {
      if (!this.metricsBox) return;
      const m = global.Store.metrics();
      const cards = [
        { label: 'm.total', value: m.total, color: 'rgba(51,102,255,0.45)', icon: 'M4 6h16M4 12h16M4 18h10' },
        { label: 'm.open', value: m.open, color: 'rgba(234,179,8,0.42)', icon: 'M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z' },
        { label: 'm.progress', value: m.in_progress, color: 'rgba(59,130,246,0.42)', icon: 'M4 12h4l3 8 4-16 3 8h2' },
        { label: 'm.closed', value: m.closed, color: 'rgba(16,185,129,0.42)', icon: 'm5 13 4 4L19 7' },
        { label: 'm.rejected', value: m.rejected, color: 'rgba(239,68,68,0.42)', icon: 'M18 6 6 18M6 6l12 12' }
      ];

      this.metricsBox.innerHTML = cards.map((c) =>
        '<div class="metric-card" style="--metric-color:' + c.color + '">' +
          '<div class="flex items-start justify-between gap-2">' +
            '<div>' +
              '<p class="metric-label">' + global.UI.escape(global.I18n.t(c.label)) + '</p>' +
              '<p class="metric-value mt-1">' + c.value + '</p>' +
            '</div>' +
            '<span class="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-slate-400">' +
              '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + c.icon + '"></path></svg>' +
            '</span>' +
          '</div>' +
        '</div>').join('');
    },

    /* ---------------- ticket card ---------------- */

    _ticketCard(ticket) {
      const esc = global.UI.escape;
      const card = document.createElement('article');
      card.className = 'glass-card ticket-card p-4 sm:p-5 fade-in';
      card.dataset.ticketId = ticket.id;

      const statusOptions = global.Store.STATUSES.map((s) =>
        '<option value="' + s + '"' + (s === ticket.status ? ' selected' : '') + '>' +
        esc(global.I18n.status(s)) + '</option>'
      ).join('');

      // Keep an assignee that is no longer on the team visible on old tickets.
      const members = global.Store.TEAM.slice();
      if (ticket.assignee && ticket.assignee !== 'Unassigned' && members.indexOf(ticket.assignee) === -1) {
        members.push(ticket.assignee);
      }
      const teamOptions = members.map((m) =>
        '<option value="' + esc(m) + '"' + (m === ticket.assignee ? ' selected' : '') + '>' +
        esc(m === 'Unassigned' ? global.I18n.t('admin.unassigned') : m) + '</option>').join('');

      // Tickets already in a terminal state lose the close button.
      const closed = ticket.status === 'resolved' || ticket.status === 'rejected';

      card.innerHTML =
        '<div class="flex flex-wrap items-start justify-between gap-3">' +
          '<div class="min-w-0 flex-1">' +
            '<div class="flex flex-wrap items-center gap-2">' +
              '<span class="badge badge-code" dir="ltr">' + esc(ticket.code) + '</span>' +
              '<span data-slot="status"></span>' +
              '<span data-slot="priority"></span>' +
              '<span class="badge badge-cat">' + esc(ticket.category) + '</span>' +
            '</div>' +
            '<h3 class="mt-2 text-sm font-semibold text-white sm:text-base">' + esc(ticket.subject) + '</h3>' +
            '<p class="mt-1 text-xs text-slate-400">' +
              esc(ticket.requesterName) + ' · ' + esc(ticket.employeeId) + ' · ' + esc(ticket.department) +
            '</p>' +
          '</div>' +
          '<div class="text-end shrink-0">' +
            '<p class="text-[11px] text-slate-500">' + esc(global.I18n.t('track.created')) + '</p>' +
            '<p class="text-xs font-medium text-slate-300">' + esc(global.UI.formatDate(ticket.createdAt)) + '</p>' +
            '<p class="mt-1 text-[11px] text-slate-500" data-slot="updated">' + esc(global.UI.relativeTime(ticket.updatedAt)) + '</p>' +
          '</div>' +
        '</div>' +

        '<div class="mt-3">' +
          '<button type="button" class="collapsible-btn" data-action="toggle-desc">' +
            '<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>' +
            '<span data-slot="desc-label">' + esc(global.I18n.t('admin.showDesc')) + '</span>' +
          '</button>' +
          '<div class="ticket-desc">' +
            '<p class="rounded-xl border border-white/10 bg-slate-900/40 p-3 text-xs leading-relaxed text-slate-300">' +
              esc(ticket.description) +
            '</p>' +
          '</div>' +
        '</div>' +

        '<div data-slot="rejection">' +
          (ticket.rejectionReason
            ? '<div class="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3">' +
                '<p class="text-[11px] font-semibold uppercase tracking-wider text-rose-300">' +
                  esc(global.I18n.status('rejected')) + '</p>' +
                '<p class="mt-1 text-xs text-rose-100">' + esc(ticket.rejectionReason) + '</p>' +
              '</div>'
            : '') +
        '</div>' +

        '<div class="mt-4 grid gap-3 sm:grid-cols-2">' +
          '<div>' +
            '<label class="field-label" for="status-' + esc(ticket.id) + '">' +
              esc(global.I18n.t('admin.status')) + '</label>' +
            '<select id="status-' + esc(ticket.id) + '" class="field-input h-9 py-1 text-xs" data-role="status">' +
              statusOptions +
            '</select>' +
          '</div>' +
          '<div>' +
            '<label class="field-label" for="assignee-' + esc(ticket.id) + '">' +
              esc(global.I18n.t('admin.assignee')) + '</label>' +
            '<select id="assignee-' + esc(ticket.id) + '" class="field-input h-9 py-1 text-xs" data-role="assignee">' +
              teamOptions +
            '</select>' +
          '</div>' +
        '</div>' +

        '<div class="mt-4">' +
          '<p class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">' +
            esc(global.I18n.t('admin.notes')) + '</p>' +
          '<div data-slot="notes">' + this._notesHTML(ticket) + '</div>' +
        '</div>' +

        '<div class="mt-4 flex flex-wrap items-center gap-2">' +
          '<button type="button" class="btn-ghost" data-action="note">' +
            esc(global.I18n.t('admin.addNote')) + '</button>' +
          '<button type="button" class="btn-secondary' + (closed ? ' hidden' : '') + '" data-action="close">' +
            esc(global.I18n.t('admin.closeTicket')) + '</button>' +
          '<button type="button" class="btn-danger" data-action="delete">' +
            esc(global.I18n.t('admin.delete')) + '</button>' +
        '</div>';

      const statusSlot = card.querySelector('[data-slot="status"]');
      if (statusSlot) statusSlot.appendChild(global.UI.statusBadge(ticket.status));
      const prioritySlot = card.querySelector('[data-slot="priority"]');
      if (prioritySlot) prioritySlot.appendChild(global.UI.priorityBadge(ticket.priority));

      this._bindCard(card, ticket);
      return card;
    },

    _notesHTML(ticket) {
      const esc = global.UI.escape;
      if (!ticket.notes || !ticket.notes.length) {
        return '<p class="rounded-lg border border-dashed border-white/10 p-2.5 text-[11px] text-slate-500">' +
          esc(global.I18n.t('admin.noNotes')) + '</p>';
      }
      return ticket.notes.map((n) =>
        '<div class="note-item">' +
          '<div class="note-meta">' + esc(n.author) + ' · ' + esc(global.UI.relativeTime(n.createdAt)) + '</div>' +
          '<p class="note-text">' + esc(n.text) + '</p>' +
        '</div>').join('');
    },

    _bindCard(card, ticket) {
      const esc = global.UI.escape;

      /* collapsible description */
      const toggleBtn = card.querySelector('[data-action="toggle-desc"]');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          const box = card.querySelector('.ticket-desc');
          const label = card.querySelector('[data-slot="desc-label"]');
          if (!box) return;
          const open = box.classList.toggle('is-open');
          toggleBtn.classList.toggle('is-open', open);
          if (label) {
            label.textContent = open
              ? global.I18n.t('admin.hideDesc')
              : global.I18n.t('admin.showDesc');
          }
        });
      }

      /* status change */
      const statusSel = card.querySelector('[data-role="status"]');
      if (statusSel) {
        statusSel.addEventListener('change', () => {
          const next = statusSel.value;
          if (next === 'rejected') {
            this._promptRejection(ticket);
            return;
          }
          this._updateStatus(ticket, next);
        });
      }

      /* assignment */
      const assigneeSel = card.querySelector('[data-role="assignee"]');
      if (assigneeSel) {
        assigneeSel.addEventListener('change', () => {
          const updated = global.Store.assign(ticket.id, assigneeSel.value);
          if (!updated) return;
          this._patchAllCards(updated);
          global.UI.toast('success', global.I18n.t('toast.updated'),
            global.I18n.t('toast.updatedMsg', {
              code: updated.code,
              status: global.I18n.status(updated.status)
            }));
        });
      }

      /* add note */
      const noteBtn = card.querySelector('[data-action="note"]');
      if (noteBtn) noteBtn.addEventListener('click', () => this._promptNote(ticket));

      /* close (resolve) */
      const closeBtn = card.querySelector('[data-action="close"]');
      if (closeBtn) closeBtn.addEventListener('click', () => this._confirmClose(ticket));

      /* delete */
      const delBtn = card.querySelector('[data-action="delete"]');
      if (delBtn) delBtn.addEventListener('click', () => this._confirmDelete(ticket));
    },

    /** Refresh the badge / notes of a card in place after a store update. */
    _patchCard(card, ticket) {
      const esc = global.UI.escape;
      const statusSlot = card.querySelector('[data-slot="status"]');
      if (statusSlot) {
        statusSlot.innerHTML = '';
        statusSlot.appendChild(global.UI.statusBadge(ticket.status));
      }
      const notesSlot = card.querySelector('[data-slot="notes"]');
      if (notesSlot) notesSlot.innerHTML = this._notesHTML(ticket);

      const rejectionSlot = card.querySelector('[data-slot="rejection"]');
      if (rejectionSlot) {
        rejectionSlot.innerHTML = ticket.rejectionReason
          ? '<div class="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3">' +
              '<p class="text-[11px] font-semibold uppercase tracking-wider text-rose-300">' +
                esc(global.I18n.status('rejected')) + '</p>' +
              '<p class="mt-1 text-xs text-rose-100">' + esc(ticket.rejectionReason) + '</p>' +
            '</div>'
          : '';
      }

      const updatedSlot = card.querySelector('[data-slot="updated"]');
      if (updatedSlot) updatedSlot.textContent = global.UI.relativeTime(ticket.updatedAt);

      const prioritySlot = card.querySelector('[data-slot="priority"]');
      if (prioritySlot) {
        prioritySlot.innerHTML = '';
        prioritySlot.appendChild(global.UI.priorityBadge(ticket.priority));
      }
      const sel = card.querySelector('[data-role="status"]');
      if (sel) sel.value = ticket.status;
      const asg = card.querySelector('[data-role="assignee"]');
      if (asg) asg.value = ticket.assignee;

      // Show the close button again when a terminal ticket is reopened.
      const closeBtn = card.querySelector('[data-action="close"]');
      if (closeBtn) {
        const terminal = ticket.status === 'resolved' || ticket.status === 'rejected';
        closeBtn.classList.toggle('hidden', terminal);
      }
    },

    _updateStatus(ticket, status) {
      this._applyStatus(ticket, status);
    },

    _syncResultCount() {
      if (!this.resultCount) return;
      this.resultCount.textContent = String(global.Store.query(this.filters).length);
    },
    /* ---------------- rejection ---------------- */

    /**
     * Ask the admin for a rejection reason before a ticket can be rejected.
     * The modal stays open until a non-empty reason is provided.
     */
    _promptRejection(ticket) {
      const esc = global.UI.escape;
      const self = this;

      const bodyHTML =
        '<p class="mb-3">' + esc(global.I18n.t('modal.rejectBody', { code: ticket.code })) + '</p>' +
        '<textarea id="rejectReason" rows="4" maxlength="500" ' +
          'class="field-input resize-y" ' +
          'placeholder="' + esc(global.I18n.t('modal.reasonPlaceholder')) + '"></textarea>' +
        '<p id="rejectError" class="field-error"></p>';

      const confirmed = global.UI.modal({
        title: global.I18n.t('modal.rejectTitle'),
        bodyHTML: bodyHTML,
        confirmText: global.I18n.t('modal.rejectConfirm'),
        cancelText: global.I18n.t('modal.cancel'),
        danger: true,
        onOpen: (ctx) => {
          const ta = ctx.getInput('#rejectReason');
          if (!ta) return;
          ta.addEventListener('input', () => {
            const err = ctx.getInput('#rejectError');
            if (err) err.textContent = '';
            ta.classList.remove('is-invalid');
          });
        },
        onConfirm: (ctx) => {
          const ta = ctx.getInput('#rejectReason');
          const err = ctx.getInput('#rejectError');
          const reason = ta ? String(ta.value || '').trim() : '';

          if (reason.length < 5) {
            if (ta) {
              ta.classList.add('is-invalid');
              ta.focus();
            }
            if (err) err.textContent = global.I18n.t('modal.required');
            return false; // keep the modal open
          }

          self._applyStatus(ticket, 'rejected', { rejectionReason: reason });
          return true;
        }
      });

      return confirmed.then((ok) => {
        if (!ok) {
          // Cancelled by the admin — restore the previous status in the select.
          const sel = this._findCard(ticket.id)
            ? this._findCard(ticket.id).querySelector('[data-role="status"]')
            : null;
          if (sel) sel.value = ticket.status;
        }
      });
    },

    /* ---------------- notes ---------------- */

    /** Prompt for an internal note and persist it on the ticket. */
    _promptNote(ticket) {
      const esc = global.UI.escape;
      const self = this;

      const bodyHTML =
        '<p class="mb-3">' + esc(global.I18n.t('modal.noteBody', { code: ticket.code })) + '</p>' +
        '<textarea id="noteText" rows="4" maxlength="600" ' +
          'class="field-input resize-y" ' +
          'placeholder="' + esc(global.I18n.t('modal.notePlaceholder')) + '"></textarea>' +
        '<p id="noteError" class="field-error"></p>';

      return global.UI.modal({
        title: global.I18n.t('modal.noteTitle'),
        bodyHTML: bodyHTML,
        confirmText: global.I18n.t('modal.noteConfirm'),
        cancelText: global.I18n.t('modal.cancel'),
        onOpen: (ctx) => {
          const ta = ctx.getInput('#noteText');
          if (!ta) return;
          ta.addEventListener('input', () => {
            const err = ctx.getInput('#noteError');
            if (err) err.textContent = '';
            ta.classList.remove('is-invalid');
          });
        },
        onConfirm: (ctx) => {
          const ta = ctx.getInput('#noteText');
          const err = ctx.getInput('#noteError');
          const text = ta ? String(ta.value || '').trim() : '';

          if (!text) {
            if (ta) {
              ta.classList.add('is-invalid');
              ta.focus();
            }
            if (err) err.textContent = global.I18n.t('modal.required');
            return false;
          }

          const updated = global.Store.addNote(ticket.id, text, 'IT Helpdesk');
          if (!updated) {
            if (err) err.textContent = global.I18n.t('toast.error');
            return false;
          }

          const card = self._findCard(updated.id);
          if (card) self._patchAllCards(updated);

          global.UI.toast('success', global.I18n.t('toast.noteAdded'),
            global.I18n.t('toast.noteAddedMsg', { code: updated.code }));
          return true;
        }
      });
    },

    /* ---------------- closing ---------------- */

    /**
     * Confirm before marking a ticket as resolved (closed). The card's own
     * close button hides itself once the ticket reaches a terminal status.
     */
    _confirmClose(ticket) {
      const esc = global.UI.escape;
      const self = this;

      return global.UI.modal({
        title: global.I18n.t('modal.closeTicketTitle'),
        bodyHTML: '<p>' + esc(global.I18n.t('modal.closeTicketBody', { code: ticket.code })) + '</p>',
        confirmText: global.I18n.t('modal.closeTicketConfirm'),
        cancelText: global.I18n.t('modal.cancel'),
        onConfirm: () => {
          const updated = self._applyStatus(ticket, 'resolved');
          return !!updated;
        }
      });
    },

    /* ---------------- deletion ---------------- */

    /** Confirm before permanently removing a ticket. */
    _confirmDelete(ticket) {
      const esc = global.UI.escape;
      const self = this;

      return global.UI.modal({
        title: global.I18n.t('modal.deleteTitle'),
        bodyHTML: '<p>' + esc(global.I18n.t('modal.deleteBody', { code: ticket.code })) + '</p>',
        confirmText: global.I18n.t('modal.deleteConfirm'),
        cancelText: global.I18n.t('modal.cancel'),
        danger: true,
        onConfirm: () => {
          const ok = global.Store.remove(ticket.id);
          if (!ok) {
            global.UI.toast('error', global.I18n.t('toast.error'), ticket.code);
            return false;
          }
          self.render();
          self.renderClosed();
          global.UI.toast('success', global.I18n.t('toast.deleted'),
            global.I18n.t('toast.deletedMsg', { code: ticket.code }));
          return true;
        }
      });
    },

    /* ---------------- shared status helper ---------------- */

    /**
     * Apply a status (with an optional extra payload) and refresh the UI.
     * Cards that no longer match the active filters are removed from the feed.
     */
    _applyStatus(ticket, status, extra) {
      const updated = global.Store.updateStatus(ticket.id, status, extra);
      if (!updated) {
        global.UI.toast('error', global.I18n.t('toast.error'), status);
        return null;
      }

      const visible = global.Store.query(this.filters).some((t) => t.id === updated.id);
      if (!visible) {
        this.render();
      } else {
        this._patchAllCards(updated);
        this.renderMetrics();
        this._syncResultCount();
      }

      // A ticket that just became terminal belongs in the closed archive,
      // and a reopened one must disappear from it.
      this.renderClosed();

      global.UI.toast('success', global.I18n.t('toast.updated'),
        global.I18n.t('toast.updatedMsg', {
          code: updated.code,
          status: global.I18n.status(updated.status)
        }));

      return updated;
    },

    /** Render closed/resolved/rejected tickets in the closed tickets view. */
    renderClosed() {
      const closedTickets = global.Store.getClosedTickets();
      const list = document.getElementById('closedTicketsContainer');
      const empty = document.getElementById('closedTicketsEmpty');
      if (!list) return;

      // Clear existing content
      list.innerHTML = '';

      if (!closedTickets.length) {
        if (empty) empty.classList.remove('hidden');
        return;
      }
      if (empty) empty.classList.add('hidden');

      // Render each closed ticket
      const frag = document.createDocumentFragment();
      closedTickets.forEach((ticket) => {
        frag.appendChild(this._ticketCard(ticket));
      });
      list.appendChild(frag);
    },

    /** Refresh the admin feed, metrics and recent list after a data change. */
    refresh() {
      this.render();
      this.renderClosed();
      this.renderActivity();
      if (global.Portal && typeof global.Portal.renderRecent === 'function') {
        global.Portal.renderRecent();
      }
    }
  };

  global.Admin = Admin;
})(window);





