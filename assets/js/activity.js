/* ============================================================
   activity.js — Persistent activity / audit log
   Records admin-visible events in localStorage and exposes
   filtering plus CSV export helpers.
   ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'it_helpdesk_activity_v1';
  const MAX_EVENTS = 500;

  const Activity = {
    /** Known event types (also used to build the admin filter). */
    TYPES: [
      'ticket_created',
      'status_changed',
      'assigned',
      'note_added',
      'ticket_deleted',
      'ticket_rejected',
      'ticket_reopened',
      'ticket_closed',
      'team_member_added',
      'team_member_removed',
      'system'
    ],

    /* ---------------- persistence ---------------- */

    _read() {
      try {
        const raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        if (global.Log) global.Log.warn('activity', 'Failed to read activity log', err);
        return [];
      }
    },

    _write(list) {
      try {
        if (global.localStorage) {
          global.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        }
        return true;
      } catch (err) {
        if (global.Log) global.Log.warn('activity', 'Failed to persist activity log', err);
        return false;
      }
    },

    /* ---------------- recording ---------------- */

    /**
     * Record an event.
     * @param {string} action   Event type (see Activity.TYPES).
     * @param {string} details  Human readable description.
     * @param {object} [meta]   Optional metadata (ticketId, code, from, to...).
     */
    record(action, details, meta) {
      const entry = {
        id: 'EV-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
        at: new Date().toISOString(),
        action: action || 'system',
        details: details === undefined || details === null ? '' : String(details),
        ticketId: (meta && meta.ticketId) || null,
        code: (meta && meta.code) || null,
        meta: meta || null
      };

      const list = this._read();
      list.push(entry);
      if (list.length > MAX_EVENTS) {
        list.splice(0, list.length - MAX_EVENTS);
      }
      this._write(list);

      if (global.Log) global.Log.info('activity', entry.action + ' — ' + entry.details, entry.code ? entry.code : null);
      return entry;
    },

    /* ---------------- querying ---------------- */

    /** All events, newest first. */
    all() {
      return this._read().slice().reverse();
    },

    /**
     * Filter events.
     * @param {object} [opts] { action, code, search, from, to, limit }
     */
    query(opts) {
      const o = opts || {};
      let list = this._read().slice().reverse();

      if (o.action && o.action !== 'all') {
        list = list.filter((e) => e.action === o.action);
      }
      if (o.code) {
        list = list.filter((e) => e.code === o.code);
      }
      if (o.search) {
        const term = String(o.search).toLowerCase();
        list = list.filter((e) =>
          (e.details || '').toLowerCase().indexOf(term) !== -1 ||
          (e.code || '').toLowerCase().indexOf(term) !== -1 ||
          (e.action || '').toLowerCase().indexOf(term) !== -1
        );
      }
      if (o.from) {
        const from = new Date(o.from).getTime();
        list = list.filter((e) => new Date(e.at).getTime() >= from);
      }
      if (o.to) {
        const to = new Date(o.to).getTime();
        list = list.filter((e) => new Date(e.at).getTime() <= to);
      }
      if (o.limit && o.limit > 0) list = list.slice(0, o.limit);

      return list;
    },

    /** Distinct action types actually present in the log. */
    usedTypes() {
      const seen = {};
      this._read().forEach((e) => { seen[e.action] = true; });
      return Object.keys(seen);
    },

    count() {
      return this._read().length;
    },

    clear() {
      this._write([]);
    },

    /* ---------------- export ---------------- */

    /** CSV representation of the given events (or all events). */
    toCSV(events) {
      const list = Array.isArray(events) ? events : this.all();
      const escape = (value) => {
        const s = value === null || value === undefined ? '' : String(value);
        return '"' + s.replace(/"/g, '""') + '"';
      };
      const rows = [['Timestamp', 'Action', 'Ticket', 'Details'].map(escape).join(',')];
      list.forEach((e) => {
        rows.push([
          escape(e.at),
          escape(e.action),
          escape(e.code || ''),
          escape(e.details || '')
        ].join(','));
      });
      return rows.join('\n');
    }
  };

  global.Activity = Activity;
})(window);
