/* ============================================================
   logger.js — Unified technical logger
   Levels, console bridge and an in-memory ring buffer.
   ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'it_helpdesk_log_level_v1';
  const MAX_ENTRIES = 250;

  const LEVELS = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    silent: 100
  };

  const Log = {
    /** Current verbosity threshold. */
    level: 'info',
    /** Mirror every entry to the browser console. */
    mirrorToConsole: true,
    /** In-memory ring buffer (oldest first). */
    entries: [],

    /* ---------------- lifecycle ---------------- */

    init() {
      this.level = this._readLevel();
      this.info('logger', 'Logger initialised at level "' + this.level + '"');
      return this.level;
    },

    /* ---------------- configuration ---------------- */

    _readLevel() {
      try {
        const raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
        if (raw && LEVELS[raw] !== undefined) return raw;
      } catch (err) {
        /* storage unavailable — fall back to the default level */
      }
      return 'info';
    },

    /** Change the verbosity threshold (persisted). */
    setLevel(level) {
      if (!LEVELS[level]) return this.level;
      this.level = level;
      try {
        if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, level);
      } catch (err) {
        /* ignore persistence failures */
      }
      return this.level;
    },

    getLevel() {
      return this.level;
    },

    /** True when a message of that level would be recorded. */
    isEnabled(level) {
      const min = LEVELS[this.level];
      const value = LEVELS[level];
      if (value === undefined) return false;
      return value >= (min === undefined ? LEVELS.info : min);
    },

    /* ---------------- recording ---------------- */

    debug(scope, message, extra) { return this._write('debug', scope, message, extra); },
    info(scope, message, extra) { return this._write('info', scope, message, extra); },
    warn(scope, message, extra) { return this._write('warn', scope, message, extra); },
    error(scope, message, extra) { return this._write('error', scope, message, extra); },

    _write(level, scope, message, extra) {
      if (!this.isEnabled(level)) return null;
      const entry = {
        at: new Date().toISOString(),
        level: level,
        scope: scope || 'app',
        message: message === undefined || message === null ? '' : String(message),
        extra: extra === undefined ? null : extra
      };

      this.entries.push(entry);
      if (this.entries.length > MAX_ENTRIES) {
        this.entries.splice(0, this.entries.length - MAX_ENTRIES);
      }

      this._forward(entry);
      return entry;
    },

    /** Send an entry to the matching console method. */
    _forward(entry) {
      if (!this.mirrorToConsole || !global.console) return;
      const methods = {
        debug: global.console.debug || global.console.log,
        info: global.console.info || global.console.log,
        warn: global.console.warn,
        error: global.console.error
      };
      const fn = methods[entry.level] || global.console.log;
      if (typeof fn !== 'function') return;
      const prefix = '[' + entry.scope + ']';
      try {
        if (entry.extra === null) fn.call(global.console, prefix, entry.message);
        else fn.call(global.console, prefix, entry.message, entry.extra);
      } catch (err) {
        /* never let logging break the app */
      }
    },

    /* ---------------- inspection ---------------- */

    /** Most recent entries first (newest last in the buffer order). */
    history(limit) {
      const list = this.entries.slice();
      const n = limit && limit > 0 ? limit : list.length;
      return list.slice(Math.max(0, list.length - n));
    },

    clear() {
      this.entries = [];
    }
  };

  global.Log = Log;
})(window);
