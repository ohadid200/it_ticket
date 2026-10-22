/* ============================================================
   auth.js — Authentication & Role-Based Access Control (Part 1)
   ============================================================ */

(function (global) {
  'use strict';

  const USERS_KEY = 'it_helpdesk_users_v1';
  const SESSION_KEY = 'it_helpdesk_session_v1';

  const ROLES = {
    SUPER_USER: 'superuser',
    ADMIN: 'admin',
    USER: 'user',
  };

  const ROLE_PERMISSIONS = {
    [ROLES.SUPER_USER]: [
      'view_admin',
      'view_closed',
      'view_activity',
      'manage_users',
      'manage_roles',
    ],
    [ROLES.ADMIN]: [
      'view_admin',
      'view_closed',
      'view_activity',
    ],
    [ROLES.USER]: [
      'view_portal',
    ],
  };

  const DEFAULT_SUPER_USER = {
    id: 'su-0000000001',
    username: 'admin',
    password: 'admin123',
    role: ROLES.SUPER_USER,
    name: 'Super User / المشرف العام',
    createdAt: new Date().toISOString(),
    permissions: ROLE_PERMISSIONS[ROLES.SUPER_USER].slice(),
  };

  const Auth = {
    users: [],
    currentUser: null,

    init() {
      this.users = this._loadUsers();

      // تأكد دائمًا من وجود المستخدم الافتراضي (سوبر يوزر) حتى لو كانت هناك مستخدمين آخرون مخزنين سابقًا.
      const hasDefaultSuper = this.users.some(
        (u) => u.username === DEFAULT_SUPER_USER.username && u.role === ROLES.SUPER_USER
      );
      if (!hasDefaultSuper) {
        this.users.push(DEFAULT_SUPER_USER);
        this._saveUsers();
      }

      this._restoreSession();
    },

    _loadUsers() {
      try {
        const raw = localStorage.getItem(USERS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (err) {
        console.warn('auth: failed to read users', err);
      }
      return [];
    },

    _saveUsers() {
      try {
        localStorage.setItem(USERS_KEY, JSON.stringify(this.users));
      } catch (err) {
        console.warn('auth: failed to save users', err);
      }
    },

    _loadSession() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.username && parsed.expires) {
            if (Date.now() < parsed.expires) {
              return parsed;
            }
            localStorage.removeItem(SESSION_KEY);
          }
        }
      } catch (err) {
        console.warn('auth: failed to read session', err);
      }
      return null;
    },

    _saveSession(user) {
      try {
        const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          username: user.username,
          role: user.role,
          name: user.name,
          expires,
        }));
      } catch (err) {
        console.warn('auth: failed to save session', err);
      }
    },

    _clearSession() {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch (err) {
        // ignore
      }
    },

    _restoreSession() {
      const session = this._loadSession();
      if (session) {
        const user = this.users.find((u) => u.username === session.username);
        if (user) {
          this.currentUser = user;
          return true;
        }
      }
      this.currentUser = null;
      return false;
    },

    login(username, password) {
      const user = this.users.find(
        (u) => u.username === username && u.password === password
      );
      if (!user) return { success: false, error: 'Invalid username or password' };

      this.currentUser = user;
      this._saveSession(user);
      return { success: true, user };
    },

    logout() {
      this.currentUser = null;
      this._clearSession();
      if (global.App) global.App.setView('portal');
    },

    isAuthenticated() {
      return !!this.currentUser;
    },

    hasPermission(permission) {
      if (!this.currentUser) return false;
      return this.currentUser.permissions.includes(permission);
    },

    isRole(role) {
      return !!this.currentUser && this.currentUser.role === role;
    },

    isSuperUser() {
      return this.isRole(ROLES.SUPER_USER);
    },

    isAdmin() {
      return this.isRole(ROLES.ADMIN) || this.isSuperUser();
    },

    /* ---------------- user management (super user only) ---------------- */

    /** إضافة مستخدم جديد (فقط للسوبر يوزر) */
    addUser(username, password, role, name) {
      if (!this.isSuperUser()) {
        return { success: false, error: 'Only Super User can add users' };
      }

      if (this.users.some((u) => u.username === username)) {
        return { success: false, error: 'Username already exists' };
      }

      const newUser = {
        id: 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        username,
        password,
        role: role || ROLES.USER,
        name: name || username,
        createdAt: new Date().toISOString(),
        permissions: ROLE_PERMISSIONS[role || ROLES.USER] ? ROLE_PERMISSIONS[role || ROLES.USER].slice() : [],
      };

      this.users.push(newUser);
      this._saveUsers();
      return { success: true, user: newUser };
    },

    /** تعديل مستخدم موجود (فقط للسوبر يوزر) */
    updateUser(userId, updates) {
      if (!this.isSuperUser()) {
        return { success: false, error: 'Only Super User can update users' };
      }

      const idx = this.users.findIndex((u) => u.id === userId);
      if (idx === -1) {
        return { success: false, error: 'User not found' };
      }

      if (this.users[idx].role === ROLES.SUPER_USER && updates.role && updates.role !== ROLES.SUPER_USER) {
        return { success: false, error: 'Cannot change Super User role' };
      }

      if (updates.password) this.users[idx].password = updates.password;
      if (updates.role) {
        this.users[idx].role = updates.role;
        this.users[idx].permissions = ROLE_PERMISSIONS[updates.role] ? ROLE_PERMISSIONS[updates.role].slice() : [];
      }
      if (updates.name) this.users[idx].name = updates.name;

      this._saveUsers();
      return { success: true, user: this.users[idx] };
    },

    /** حذف مستخدم (فقط للسوبر يوزر) */
    deleteUser(userId) {
      if (!this.isSuperUser()) {
        return { success: false, error: 'Only Super User can delete users' };
      }

      const idx = this.users.findIndex((u) => u.id === userId);
      if (idx === -1) {
        return { success: false, error: 'User not found' };
      }

      if (this.users[idx].role === ROLES.SUPER_USER) {
        return { success: false, error: 'Cannot delete Super User' };
      }

      const deleted = this.users.splice(idx, 1)[0];
      this._saveUsers();
      return { success: true, user: deleted };
    },

    /** جلب جميع المستخدمين (فقط للسوبر يوزر) */
    getAllUsers() {
      if (!this.isSuperUser()) return [];
      return this.users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        name: u.name,
        createdAt: u.createdAt,
      }));
    },

    /** جلب الصلاحيات المتاحة لكل دور */
    getRolePermissions(role) {
      return ROLE_PERMISSIONS[role] ? ROLE_PERMISSIONS[role].slice() : [];
    },

    /** جلب جميع الأدوار */
    getRoles() {
      return Object.entries(ROLES).map(([key, value]) => ({ key, value }));
    },

    /** تحديث صلاحيات مستخدم (فقط للسوبر يوزر) */
    updateUserPermissions(userId, permissions) {
      if (!this.isSuperUser()) {
        return { success: false, error: 'Only Super User can update permissions' };
      }

      const idx = this.users.findIndex((u) => u.id === userId);
      if (idx === -1) {
        return { success: false, error: 'User not found' };
      }

      this.users[idx].permissions = permissions || [];
      this._saveUsers();
      return { success: true, user: this.users[idx] };
    },
  };

  global.Auth = Auth;
  global.ROLES = ROLES;

})(typeof globalThis !== 'undefined' ? globalThis : window);