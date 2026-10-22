/* ============================================================
   store.js — Data layer (localStorage persistence)
   ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'it_helpdesk_tickets_v1';
  const CLOSED_KEY = 'it_helpdesk_closed_v1';
  const PREFS_KEY = 'it_helpdesk_prefs_v1';
  const SESSION_KEY = 'it_helpdesk_session_v1';
  const TEAM_KEY = 'it_helpdesk_team_v1';

  const STATUSES = ['pending', 'analyzing', 'in_progress', 'on_hold', 'resolved', 'rejected'];
  const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
  const CATEGORIES = [
    'Hardware', 'Software', 'Network/Wi-Fi',
    'Printer/Scanner', 'Access & Passwords', 'Email/Account'
  ];
  const DEPARTMENTS = [
    'Operations', 'Sales', 'HR', 'Finance', 'Marketing', 'Executive', 'Other'
  ];
  /** Default roster — used until a custom team is stored. */
  const DEFAULT_TEAM = [
    'Unassigned',
    'Ahmed Hassan — Hardware',
    'Sara Khalil — Software',
    'Omar Farouk — Network',
    'Nadia Saleh — Accounts & Access',
    'Youssef Nabil — Print Services'
  ];

  /** Ordered pipeline used by the tracker stepper. */
  const PIPELINE = ['pending', 'analyzing', 'in_progress', 'resolved'];

  const PRIORITY_RANK = { Critical: 4, High: 3, Medium: 2, Low: 1 };

  /** Bridge to the unified logger (no-op when the logger is not loaded). */
  function log(level, scope, message, extra) {
    if (global.Log && typeof global.Log[level] === 'function') global.Log[level](scope, message, extra);
  }

  /** Bridge to the persistent activity log (no-op when it is not loaded). */
  function audit(action, details, meta) {
    if (global.Activity && typeof global.Activity.record === 'function') global.Activity.record(action, details, meta);
  }

  const Store = {
    tickets: [],
    listeners: [],

    /* ---------------- lifecycle ---------------- */

    init() {
      this.TEAM = this._loadTeam();
      this.tickets = this._read();
      this.closedTickets = this.getClosedTickets();
      return this.tickets;
    },

    /* ---------------- team management ---------------- */

    /** Load the persisted team roster (falls back to the default list). */
    _loadTeam() {
      try {
        const raw = localStorage.getItem(TEAM_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const seen = {};
            const members = [];
            parsed.forEach((v) => {
              if (typeof v !== 'string') return;
              const m = v.trim().replace(/\s+/g, ' ');
              if (!m || m === 'Unassigned' || seen[m]) return;
              seen[m] = true;
              members.push(m);
            });
            return ['Unassigned'].concat(members);
          }
        }
      } catch (err) {
        log('warn', 'store', 'Failed to read team', err);
      }
      return DEFAULT_TEAM.slice();
    },

    /** Get closed/resolved/rejected tickets from persistent storage. */
    getClosedTickets() {
      try {
        const raw = localStorage.getItem(CLOSED_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      } catch (err) {
        log('warn', 'store', 'Failed to read closed tickets', err);
      }
      return [];
    },

    /**
     * Move tickets to closed storage when status changes to resolved or rejected.
     * Called from updateStatus() after the ticket has been mutated.
     */
    _syncClosedList(ticket, wasTerminal, isTerminal) {
      try {
        if (!wasTerminal && isTerminal) {
          const closed = this.getClosedTickets().filter((t) => t.id !== ticket.id);
          closed.unshift(this._normalise(ticket));
          localStorage.setItem(CLOSED_KEY, JSON.stringify(closed));
          this.closedTickets = closed;
        } else if (wasTerminal && !isTerminal) {
          const closed = this.getClosedTickets().filter((t) => t.id !== ticket.id);
          localStorage.setItem(CLOSED_KEY, JSON.stringify(closed));
          this.closedTickets = closed;
        } else {
          // Same terminal state: keep the archived copy in sync.
          const closed = this.getClosedTickets();
          const idx = closed.findIndex((t) => t.id === ticket.id);
          if (idx !== -1) {
            closed[idx] = this._normalise(ticket);
            localStorage.setItem(CLOSED_KEY, JSON.stringify(closed));
            this.closedTickets = closed;
          }
        }
      } catch (err) {
        log('warn', 'store', 'Failed to persist closed tickets', err);
      }
    },

    /** Refresh the archived copy of a ticket that stays in the closed list. */
    _syncClosedCopy(ticket) {
      try {
        const closed = this.getClosedTickets();
        const idx = closed.findIndex((t) => t.id === ticket.id);
        if (idx === -1) return;
        closed[idx] = this._normalise(ticket);
        localStorage.setItem(CLOSED_KEY, JSON.stringify(closed));
        this.closedTickets = closed;
      } catch (err) {
        log('warn', 'store', 'Failed to sync closed ticket copy', err);
      }
    },

    _saveTeam() {
      try {
        localStorage.setItem(TEAM_KEY, JSON.stringify(this.TEAM.filter((m) => m !== 'Unassigned')));
      } catch (err) {
        log('error', 'store', 'Failed to persist team', err);
      }
    },

    /**
     * Add an assignee as "Name — Role" (role optional).
     * Returns the created entry, or null when validation fails.
     */
    addTeamMember(name, role) {
      const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
      const cleanRole = String(role || '').trim().replace(/\s+/g, ' ');
      if (cleanName.length < 2) return null;
      const entry = cleanRole ? cleanName + ' — ' + cleanRole : cleanName;
      if (this.TEAM.indexOf(entry) !== -1) return null;
      this.TEAM.push(entry);
      this._saveTeam();
      log('info', 'store', 'Team member added: ' + entry);
      audit('team_member_added', 'Team member added: ' + entry, { member: entry });
      return entry;
    },

    /**
     * Remove an assignee ("Unassigned" is permanent). Any tickets held by the
     * removed member fall back to Unassigned.
     * Returns { value, reassigned } or null when the entry cannot be removed.
     */
    removeTeamMember(value) {
      if (!value || value === 'Unassigned') return null;
      const idx = this.TEAM.indexOf(value);
      if (idx === -1) return null;
      this.TEAM.splice(idx, 1);
      this._saveTeam();

      let reassigned = 0;
      this.tickets.forEach((t) => {
        if (t.assignee === value) {
          t.assignee = 'Unassigned';
          t.updatedAt = new Date().toISOString();
          this._syncClosedCopy(t);
          reassigned += 1;
        }
      });
      const details = 'Team member removed: ' + value +
        (reassigned ? ' — ' + reassigned + ' ticket(s) reassigned to Unassigned' : '');
      log('warn', 'store', details);
      audit('team_member_removed', details, { member: value, reassigned: reassigned });
      if (reassigned) this._write();
      return { value: value, reassigned: reassigned };
    },

    _read() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map((t) => this._normalise(t)) : [];
      } catch (err) {
        log('warn', 'store', 'Failed to read tickets', err);
        return [];
      }
    },

    _normalise(t) {
      return {
        id: t.id || this._uid(),
        code: t.code || 'IT-00000',
        requesterName: t.requesterName || 'Unknown',
        employeeId: t.employeeId || '—',
        department: t.department || 'Other',
        category: t.category || 'Other',
        priority: PRIORITIES.indexOf(t.priority) === -1 ? 'Medium' : t.priority,
        subject: t.subject || 'Untitled request',
        description: t.description || '',
        status: STATUSES.indexOf(t.status) === -1 ? 'pending' : t.status,
        assignee: t.assignee || 'Unassigned',
        notes: Array.isArray(t.notes) ? t.notes : [],
        createdAt: t.createdAt || new Date().toISOString(),
        updatedAt: t.updatedAt || t.createdAt || new Date().toISOString(),
        rejectionReason: t.rejectionReason || '',
        isDemo: !!t.isDemo
      };
    },

    _write() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tickets));
      } catch (err) {
        log('error', 'store', 'Failed to persist tickets', err);
        if (global.UI) global.UI.toast('error', 'Storage error', 'Unable to save data locally.');
      }
      this._emit();
    },

    _emit() {
      this.listeners.forEach((fn) => {
        try { fn(this.tickets); } catch (err) { log('error', 'store', 'Listener failed', err); }
      });
    },

    subscribe(fn) {
      this.listeners.push(fn);
      return () => {
        const i = this.listeners.indexOf(fn);
        if (i > -1) this.listeners.splice(i, 1);
      };
    },

    _uid() {
      return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    },

    /* ---------------- code generation ---------------- */

    /**
     * Generate a guaranteed-unique ticket code in the IT-XXXXX format.
     * Retries with a fresh random value if a collision is detected.
     */
    generateCode() {
      const existing = new Set(this.tickets.map((t) => t.code));
      let code = '';
      let attempts = 0;
      do {
        code = 'IT-' + String(Math.floor(10000 + Math.random() * 90000));
        attempts += 1;
      } while (existing.has(code) && attempts < 100);
      if (existing.has(code)) {
        code = 'IT-' + String(Date.now()).slice(-5);
        let n = 0;
        while (existing.has(code)) {
          n += 1;
          code = 'IT-' + String((Date.now() + n) % 100000).padStart(5, '0');
        }
      }
      return code;
    },

    /** Normalise user input into a canonical IT-XXXXX code (or null). */
    normaliseCode(input) {
      if (!input) return null;
      const raw = String(input).trim().toUpperCase().replace(/^#/, '');
      const match = raw.match(/^IT[-\s]?(\d{5})$/);
      if (!match) return null;
      return 'IT-' + match[1];
    },

    /* ---------------- CRUD ---------------- */

    create(data) {
      const now = new Date().toISOString();
      const ticket = this._normalise(Object.assign({}, data, {
        id: this._uid(),
        code: this.generateCode(),
        status: 'pending',
        assignee: 'Unassigned',
        notes: [],
        createdAt: now,
        updatedAt: now
      }));
      this.tickets.unshift(ticket);
      // Audit before the change is broadcast: subscribers (the activity feed)
      // must already see the new event when they re-render.
      log('info', 'store', 'Ticket created: ' + ticket.code, ticket.subject);
      audit('ticket_created', 'Ticket ' + ticket.code + ' created — ' + ticket.subject, {
        ticketId: ticket.id, code: ticket.code,
        requester: ticket.requesterName, priority: ticket.priority, category: ticket.category
      });
      this._write();
      return ticket;
    },

    getByCode(code) {
      const norm = this.normaliseCode(code);
      if (!norm) return null;
      return this.tickets.find((t) => t.code === norm) || null;
    },

    getById(id) {
      return this.tickets.find((t) => t.id === id) || null;
    },

    updateStatus(id, status, extra) {
      const ticket = this.getById(id);
      if (!ticket) return null;
      if (STATUSES.indexOf(status) === -1) return null;
      const wasTerminal = ['resolved', 'rejected'].includes(ticket.status);
      const isTerminal = ['resolved', 'rejected'].includes(status);
      const from = ticket.status;
      ticket.status = status;
      ticket.updatedAt = new Date().toISOString();
      if (extra && extra.rejectionReason) {
        ticket.rejectionReason = extra.rejectionReason;
      } else if (status !== 'rejected') {
        // Leaving the rejected state clears the previous reason.
        ticket.rejectionReason = '';
      }
      this._syncClosedList(ticket, wasTerminal, isTerminal);

      const details = 'Ticket ' + ticket.code + ' status changed from ' +
        (from || 'n/a') + ' to ' + status +
        (extra && extra.rejectionReason ? ' — reason: ' + extra.rejectionReason : '');
      log('info', 'store', details);
      if (status === 'rejected') {
        audit('ticket_rejected', details, { ticketId: ticket.id, code: ticket.code, from: from, to: status });
      } else if (wasTerminal && !isTerminal) {
        audit('ticket_reopened', details, { ticketId: ticket.id, code: ticket.code, from: from, to: status });
      } else if (status === 'resolved') {
        audit('ticket_closed', details, { ticketId: ticket.id, code: ticket.code, from: from, to: status });
      } else {
        audit('status_changed', details, { ticketId: ticket.id, code: ticket.code, from: from, to: status });
      }
      this._write();
      return ticket;
    },

    assign(id, assignee) {
      const ticket = this.getById(id);
      if (!ticket) return null;
      const from = ticket.assignee;
      ticket.assignee = assignee || 'Unassigned';
      ticket.updatedAt = new Date().toISOString();
      this._syncClosedCopy(ticket);
      const details = 'Ticket ' + ticket.code + ' assigned to ' + ticket.assignee +
        (from && from !== ticket.assignee ? ' (was ' + from + ')' : '');
      log('info', 'store', details);
      audit('assigned', details, { ticketId: ticket.id, code: ticket.code, from: from, to: ticket.assignee });
      this._write();
      return ticket;
    },

    addNote(id, text, author) {
      const ticket = this.getById(id);
      if (!ticket || !text || !String(text).trim()) return null;
      const note = {
        id: this._uid(),
        text: String(text).trim(),
        author: author || 'IT Helpdesk',
        createdAt: new Date().toISOString()
      };
      ticket.notes.push(note);
      ticket.updatedAt = note.createdAt;
      this._syncClosedCopy(ticket);
      const details = 'Note added to ticket ' + ticket.code + ' by ' + note.author;
      log('info', 'store', details, note.text);
      audit('note_added', details, { ticketId: ticket.id, code: ticket.code, author: note.author, note: note.text });
      this._write();
      return ticket;
    },

    remove(id) {
      const idx = this.tickets.findIndex((t) => t.id === id);
      if (idx === -1) return false;
      const removed = this.tickets[idx];
      this.tickets.splice(idx, 1);
      // Drop the archived copy so deleted tickets leave the closed list too.
      const closed = this.getClosedTickets().filter((t) => t.id !== id);
      localStorage.setItem(CLOSED_KEY, JSON.stringify(closed));
      this.closedTickets = closed;
      const details = 'Ticket ' + removed.code + ' deleted — ' + removed.subject;
      log('warn', 'store', details);
      audit('ticket_deleted', details, { ticketId: removed.id, code: removed.code, subject: removed.subject });
      this._write();
      return true;
    },

    clearAll() {
      this.tickets = [];
      try {
        localStorage.setItem(CLOSED_KEY, JSON.stringify([]));
      } catch (err) {
        log('warn', 'store', 'Failed to clear closed tickets', err);
      }
      this.closedTickets = [];
      this._write();
    },

    /* ---------------- analytics ---------------- */

    metrics() {
      const counts = { total: this.tickets.length, open: 0, in_progress: 0, closed: 0, rejected: 0 };
      this.tickets.forEach((t) => {
        if (t.status === 'rejected') counts.rejected += 1;
        else if (t.status === 'resolved') counts.closed += 1;
        else if (t.status === 'in_progress') counts.in_progress += 1;
        else counts.open += 1;
      });
      return counts;
    },

    /** Filter + sort the ticket list for the admin feed. */
    query(opts) {
      const o = opts || {};
      const term = (o.search || '').trim().toLowerCase();
      let list = this.tickets.slice();

      if (term) {
        list = list.filter((t) => {
          const haystack = [t.code, t.requesterName, t.subject, t.employeeId, t.department, t.category]
            .join(' ').toLowerCase();
          return haystack.indexOf(term) !== -1;
        });
      }
      if (o.status && o.status !== 'all') list = list.filter((t) => t.status === o.status);
      if (o.priority && o.priority !== 'all') list = list.filter((t) => t.priority === o.priority);

      const sort = o.sort || 'newest';
      list.sort((a, b) => {
        if (sort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
        if (sort === 'priority') {
          const diff = (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0);
          if (diff !== 0) return diff;
          return new Date(b.createdAt) - new Date(a.createdAt);
        }
        if (sort === 'code') return a.code.localeCompare(b.code);
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      return list;
    },

    /* ---------------- preferences & session ---------------- */

    getPrefs() {
      try {
        return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
      } catch (err) {
        return {};
      }
    },

    setPref(key, value) {
      const prefs = this.getPrefs();
      prefs[key] = value;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      } catch (err) {
        log('warn', 'store', 'Failed to persist preferences', err);
      }
    },

    /** Tickets created in this browser session (used by the "recent" list). */
    getSessionCodes() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (err) {
        return [];
      }
    },

    rememberSessionCode(code) {
      const list = this.getSessionCodes();
      if (list.indexOf(code) === -1) {
        list.unshift(code);
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify(list.slice(0, 8)));
        } catch (err) {
          log('warn', 'store', 'Failed to persist session codes', err);
        }
      }
    },

    /* ---------------- demo data ---------------- */

    loadDemoData() {
      const existingDemo = this.tickets.filter((t) => t.isDemo).length;
      if (existingDemo > 0) return existingDemo;

      const samples = Store.DEMO_SAMPLES.map((s, i) => {
        const created = new Date(Date.now() - (i + 1) * 3 * 3600 * 1000 - i * 900000);
        const updated = new Date(created.getTime() + (i + 1) * 25 * 60 * 1000);
        return this._normalise({
          id: this._uid(),
          code: this.generateCode(),
          requesterName: s.name,
          employeeId: s.employeeId,
          department: s.department,
          category: s.category,
          priority: s.priority,
          subject: s.subject,
          description: s.description,
          status: s.status,
          assignee: s.assignee,
          rejectionReason: s.rejectionReason || '',
          createdAt: created.toISOString(),
          updatedAt: updated.toISOString(),
          notes: s.notes.map((n) => ({
            id: this._uid(),
            text: n.text,
            author: n.author || 'IT Helpdesk',
            createdAt: new Date(created.getTime() + n.offsetMinutes * 60000).toISOString()
          })),
          isDemo: true
        });
      });

      this.tickets = samples.concat(this.tickets);
      this._write();
      return samples.length;
    },

    /* ---------------- export ---------------- */

    /**
     * Serialise tickets to JSON.
     * @param {Array} [tickets] optional subset to export (defaults to all)
     */
    toJSON(tickets) {
      const list = Array.isArray(tickets) ? tickets : this.tickets;
      return JSON.stringify(list, null, 2);
    },

    /**
     * Serialise tickets to CSV.
     * @param {Array} [tickets] optional subset to export (defaults to all)
     */
    toCSV(tickets) {
      const list = Array.isArray(tickets) ? tickets : this.tickets;
      const headers = [
        'Ticket Code', 'Created At', 'Last Updated', 'Requester', 'Employee ID',
        'Department', 'Category', 'Priority', 'Subject', 'Description',
        'Status', 'Assignee', 'Notes', 'Rejection Reason'
      ];
      const esc = (val) => {
        const s = val === null || val === undefined ? '' : String(val);
        return '"' + s.replace(/"/g, '""') + '"';
      };
      const rows = list.map((t) => [
        t.code, t.createdAt, t.updatedAt, t.requesterName, t.employeeId,
        t.department, t.category, t.priority, t.subject, t.description,
        t.status, t.assignee,
        t.notes.map((n) => n.text).join(' | '),
        t.rejectionReason
      ].map(esc).join(','));
      return [headers.map(esc).join(',')].concat(rows).join('\r\n');
    },

    /* ---------------- constants exposed ---------------- */

    STATUSES: STATUSES,
    PRIORITIES: PRIORITIES,
    CATEGORIES: CATEGORIES,
    DEPARTMENTS: DEPARTMENTS,
    TEAM: DEFAULT_TEAM.slice(),
    PIPELINE: PIPELINE,
    PRIORITY_RANK: PRIORITY_RANK,

    DEMO_SAMPLES: [
      {
        name: 'Layla Hassan', employeeId: 'EMP-2041', department: 'Finance',
        category: 'Software', priority: 'Critical',
        subject: 'ERP payroll module freezes during month-end close',
        description: 'When running the December payroll batch the ERP client becomes unresponsive after roughly 20 minutes. Only my workstation is affected; finance machines on the same floor work fine. Error "transaction timeout" appears each time.',
        status: 'in_progress', assignee: 'Sara Khalil — Software',
        notes: [
          { text: 'Thanks Layla — I can reproduce the timeout on a backup copy of the dataset. Escalating to the vendor with the ERP logs.', author: 'Sara Khalil — Software', offsetMinutes: 25 },
          { text: 'A hotfix build has been requested from the vendor, expected within 24 hours. I will keep you posted here.', author: 'Sara Khalil — Software', offsetMinutes: 90 }
        ]
      },
      {
        name: 'Omar Al-Sayed', employeeId: 'omar@corp.com', department: 'Operations',
        category: 'Network/Wi-Fi', priority: 'High',
        subject: 'Warehouse scanners disconnect from warehouse Wi-Fi',
        description: 'Zebra handheld scanners drop off the network every few minutes in aisle 3. The access points were rebooted last week but the issue returned. 12 scanners are affected and this blocks picking operations.',
        status: 'analyzing', assignee: 'Omar Farouk — Network',
        notes: [
          { text: 'Interference detected on channel 11 near the loading dock. I am moving one access point and re-running a spectrum survey.', author: 'Omar Farouk — Network', offsetMinutes: 40 }
        ]
      },
      {
        name: 'Sara Mahmoud', employeeId: 'EMP-1188', department: 'Marketing',
        category: 'Access & Passwords', priority: 'Medium',
        subject: 'Locked out of the campaign analytics dashboard',
        description: 'My password stopped working after the forced rotation last week. I am still able to sign in to email but the analytics portal returns "access denied".',
        status: 'on_hold', assignee: 'Nadia Saleh — Accounts & Access',
        notes: [
          { text: 'Your account is still tied to the legacy permissions group. Waiting for the Marketing manager to confirm the new role mapping.', author: 'Nadia Saleh — Accounts & Access', offsetMinutes: 60 }
        ]
      },
      {
        name: 'Karim Fouad', employeeId: 'EMP-3097', department: 'Sales',
        category: 'Hardware', priority: 'High',
        subject: 'Laptop battery drains within 40 minutes',
        description: 'My Dell Latitude battery drops from full to empty in under an hour even with the charger disconnected and screen brightness low. The charger LED no longer lights up.',
        status: 'pending', assignee: 'Unassigned',
        notes: []
      },
      {
        name: 'Nour El-Sayed', employeeId: 'EMP-1455', department: 'HR',
        category: 'Printer/Scanner', priority: 'Low',
        subject: 'HR scanner produces skewed PDF documents',
        description: 'The new HR scanner outputs slightly rotated PDF pages. Text is legible but the files look unprofessional when attached to employee records.',
        status: 'pending', assignee: 'Youssef Nabil — Print Services',
        notes: []
      },
      {
        name: 'Tarek Badr', employeeId: 'tarek.badr@corp.com', department: 'Executive',
        category: 'Email/Account', priority: 'Medium',
        subject: 'Shared mailbox missing new calendar invitations',
        description: 'New meeting invitations sent to the "board@corp.com" shared mailbox are not appearing in Outlook. Older messages are still received normally.',
        status: 'resolved', assignee: 'Nadia Saleh — Accounts & Access',
        notes: [
          { text: 'The mailbox had reached its 50 GB storage limit so new calendar items were silently rejected. Archive was cleared and the limit raised to 100 GB.', author: 'Nadia Saleh — Accounts & Access', offsetMinutes: 120 },
          { text: 'Confirmed working — calendar invitations are flowing again. Ticket resolved.', author: 'Nadia Saleh — Accounts & Access', offsetMinutes: 150 }
        ]
      },
      {
        name: 'Mona Adel', employeeId: 'EMP-2760', department: 'Operations',
        category: 'Software', priority: 'Low',
        subject: 'Request to install a PDF annotation tool',
        description: 'Requesting the PDF annotation utility that the audit team already uses, so that inspection reports can be marked up consistently.',
        status: 'rejected', assignee: 'Sara Khalil — Software',
        rejectionReason: 'This request is outside IT support scope. Software purchasing is handled by the Procurement department — please submit a purchase request through them.',
        notes: [
          { text: 'This request is outside IT support scope. Software purchasing is handled by the Procurement department.', author: 'IT Helpdesk', offsetMinutes: 35 }
        ]
      }
    ]
  };

  global.Store = Store;
})(window);



