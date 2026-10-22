/* ============================================================
   user-management.js — Super User: manage users & permissions
   ============================================================ */

(function (global) {
  'use strict';

  const esc = global.UI.escape;

  const UserManager = {
    init() {
      const btn = document.getElementById('btnManageUsers');
      if (btn) btn.addEventListener('click', () => this.open());
    },

    open() {
      if (!global.Auth.isSuperUser()) {
        global.UI.toast('error', global.I18n.t('auth.errorOnlySuper'));
        return;
      }
      this.render();
    },

    render() {
      const users = global.Auth.getAllUsers();
      const roles = global.Auth.getRoles();

      const roleOptions = roles.map((r) => {
        const label = r.key === 'SUPER_USER' ? global.I18n.t('auth.superuser')
          : r.key === 'ADMIN' ? global.I18n.t('auth.admin')
          : global.I18n.t('auth.user');
        return '<option value="' + r.value + '">' + label + '</option>';
      }).join('');

      const rows = users.map((u) => {
        const roleLabel = u.role === 'superuser' ? global.I18n.t('auth.superuser')
          : u.role === 'admin' ? global.I18n.t('auth.admin')
          : global.I18n.t('auth.user');
        const isSuper = u.role === 'superuser';
        return '<tr class="border-b border-white/5 last:border-0">' +
          '<td class="py-3 text-xs text-slate-300">' + esc(u.username) + '</td>' +
          '<td class="py-3 text-xs text-slate-400 truncate max-w-xs">' + esc(u.name) + '</td>' +
          '<td class="py-3 text-xs"><span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ' +
          (isSuper ? 'border-brand-500/30 bg-brand-500/10 text-brand-300' : 'border-slate-600/30 bg-slate-700/30 text-slate-300') + '">' +
          roleLabel + '</span></td>' +
          '<td class="py-3 text-xs text-slate-500">' + new Date(u.createdAt).toLocaleDateString() + '</td>' +
          '<td class="py-3 text-right">' +
          (isSuper ? '' :
            '<button class="um-edit text-xs text-brand-400 hover:text-brand-300 mr-3" data-id="' + u.id + '" title="' + global.I18n.t('auth.editUser') + '">' +
            global.I18n.t('auth.editUser') + '</button>' +
            '<button class="um-delete text-xs text-rose-400 hover:text-rose-300" data-id="' + u.id + '" title="' + global.I18n.t('auth.deleteUser') + '">' +
            global.I18n.t('auth.deleteUser') + '</button>') +
          '</td>' +
          '</tr>';
      }).join('');

      const bodyHTML =
        '<div class="space-y-4">' +
        '<div class="flex items-center justify-between mb-2">' +
        '<h3 class="text-lg font-bold text-white">' + global.I18n.t('auth.users') + '</h3>' +
        '<button id="um-btnAdd" class="btn-primary text-xs py-1.5 px-3">' + global.I18n.t('auth.addUser') + '</button>' +
        '</div>' +
        '<div class="overflow-x-auto">' +
        '<table class="w-full text-left border-collapse">' +
        '<thead>' +
        '<tr class="border-b border-white/10">' +
        '<th class="py-3 text-[10px] uppercase tracking-wider text-slate-500 font-bold">' + global.I18n.t('auth.username') + '</th>' +
        '<th class="py-3 text-[10px] uppercase tracking-wider text-slate-500 font-bold">' + global.I18n.t('auth.name') + '</th>' +
        '<th class="py-3 text-[10px] uppercase tracking-wider text-slate-500 font-bold">' + global.I18n.t('auth.role') + '</th>' +
        '<th class="py-3 text-[10px] uppercase tracking-wider text-slate-500 font-bold">تاريخ الإنشاء</th>' +
        '<th class="py-3 text-[10px] uppercase tracking-wider text-slate-500 font-bold text-right">أدوات</th>' +
        '</tr>' +
        '</thead>' +
        '<tbody class="um-table-body">' + rows + '</tbody>' +
        '</table>' +
        '</div>' +
        (users.length === 0 ? '<p class="text-xs text-slate-500 text-center py-4">' + global.I18n.t('auth.noUsers') + '</p>' : '') +
        '</div>';

      const self = this;
      global.UI.modal({
        title: global.I18n.t('auth.users'),
        bodyHTML: bodyHTML,
        confirmText: global.I18n.t('auth.close'),
        cancelText: '',
        showCancel: false,
        onOpen: (ctx) => {
          ctx.getModalEl = () => document.getElementById('modal');
          const addBtn = ctx.getInput('#um-btnAdd');
          if (addBtn) addBtn.addEventListener('click', () => self._promptAdd());

          ctx.getModalEl().querySelectorAll('.um-edit').forEach((btn) => {
            btn.addEventListener('click', (e) => self._promptEdit(e.currentTarget.getAttribute('data-id')));
          });
          ctx.getModalEl().querySelectorAll('.um-delete').forEach((btn) => {
            btn.addEventListener('click', (e) => self._confirmDelete(e.currentTarget.getAttribute('data-id')));
          });
        }
      });
    /* ---------------- add user ---------------- */

    _promptAdd() {
      const roles = global.Auth.getRoles();
      const roleOptions = roles.map((r) => {
        const label = r.key === 'SUPER_USER' ? global.I18n.t('auth.superuser')
          : r.key === 'ADMIN' ? global.I18n.t('auth.admin')
          : global.I18n.t('auth.user');
        return '<option value="' + r.value + '">' + label + '</option>';
      }).join('');

      const bodyHTML =
        '<form id="um-addForm" class="space-y-3">' +
        '<div class="field">' +
        '<label class="field-label block mb-1.5 text-xs font-medium text-slate-300">' + global.I18n.t('auth.username') + '</label>' +
        '<input id="um-newUsername" type="text" class="field-input h-9 py-1 text-xs" placeholder="username" required />' +
        '</div>' +
        '<div class="field">' +
        '<label class="field-label block mb-1.5 text-xs font-medium text-slate-300">' + global.I18n.t('auth.password') + '</label>' +
        '<input id="um-newPassword" type="password" class="field-input h-9 py-1 text-xs" placeholder="••••••••" required />' +
        '</div>' +
        '<div class="field">' +
        '<label class="field-label block mb-1.5 text-xs font-medium text-slate-300">' + global.I18n.t('auth.name') + '</label>' +
        '<input id="um-newName" type="text" class="field-input h-9 py-1 text-xs" placeholder="Full Name" />' +
        '</div>' +
        '<div class="field">' +
        '<label class="field-label block mb-1.5 text-xs font-medium text-slate-300">' + global.I18n.t('auth.role') + '</label>' +
        '<select id="um-newRole" class="field-input h-9 py-1 text-xs">' + roleOptions + '</select>' +
        '</div>' +
        '<p id="um-addError" class="field-error"></p>' +
        '</form>';

      const self = this;
      global.UI.modal({
        title: global.I18n.t('auth.addUser'),
        bodyHTML: bodyHTML,
        confirmText: global.I18n.t('auth.save'),
        cancelText: global.I18n.t('auth.cancel'),
        onConfirm: () => {
          const username = document.getElementById('um-newUsername').value.trim();
          const password = document.getElementById('um-newPassword').value;
          const name = document.getElementById('um-newName').value.trim();
          const role = document.getElementById('um-newRole').value;
          const errEl = document.getElementById('um-addError');

          if (!username || !password) {
            if (errEl) errEl.textContent = global.I18n.t('err.required');
            return false;
          }

          const result = global.Auth.addUser(username, password, role, name);
          if (result.success) {
            global.UI.toast('success', global.I18n.t('auth.userAdded'));
            self.render();
            return true;
          }
          if (errEl) errEl.textContent = result.error;
          return false;
        }
      });
    },

    /* ---------------- edit user ---------------- */

    _promptEdit(userId) {
      const user = global.Auth.getAllUsers().find((u) => u.id === userId);
      if (!user) return;

      const roles = global.Auth.getRoles();
      const roleOptions = roles.map((r) => {
        const label = r.key === 'SUPER_USER' ? global.I18n.t('auth.superuser')
          : r.key === 'ADMIN' ? global.I18n.t('auth.admin')
          : global.I18n.t('auth.user');
        const selected = r.value === user.role ? ' selected' : '';
        return '<option value="' + r.value + '"' + selected + '>' + label + '</option>';
      }).join('');

      const bodyHTML =
        '<form id="um-editForm" class="space-y-3">' +
        '<div class="field">' +
        '<label class="field-label block mb-1.5 text-xs font-medium text-slate-300">' + global.I18n.t('auth.username') + '</label>' +
        '<input id="um-editUsername" type="text" class="field-input h-9 py-1 text-xs" value="' + esc(user.username) + '" readonly />' +
        '</div>' +
        '<div class="field">' +
        '<label class="field-label block mb-1.5 text-xs font-medium text-slate-300">' + global.I18n.t('auth.password') + '</label>' +
        '<input id="um-editPassword" type="password" class="field-input h-9 py-1 text-xs" placeholder="Leave blank to keep current" />' +
        '</div>' +
        '<div class="field">' +
        '<label class="field-label block mb-1.5 text-xs font-medium text-slate-300">' + global.I18n.t('auth.name') + '</label>' +
        '<input id="um-editName" type="text" class="field-input h-9 py-1 text-xs" value="' + esc(user.name) + '" />' +
        '</div>' +
        '<div class="field">' +
        '<label class="field-label block mb-1.5 text-xs font-medium text-slate-300">' + global.I18n.t('auth.role') + '</label>' +
        '<select id="um-editRole" class="field-input h-9 py-1 text-xs">' + roleOptions + '</select>' +
        '</div>' +
        '<p id="um-editError" class="field-error"></p>' +
        '</form>';

      const self = this;
      global.UI.modal({
        title: global.I18n.t('auth.editUser') + ' — ' + user.username,
        bodyHTML: bodyHTML,
        confirmText: global.I18n.t('auth.save'),
        cancelText: global.I18n.t('auth.cancel'),
        onConfirm: () => {
          const password = document.getElementById('um-editPassword').value;
          const name = document.getElementById('um-editName').value.trim();
          const role = document.getElementById('um-editRole').value;
          const errEl = document.getElementById('um-editError');

          const updates = {};
          if (password) updates.password = password;
          if (name) updates.name = name;
          if (role) updates.role = role;

          const result = global.Auth.updateUser(userId, updates);
          if (result.success) {
            global.UI.toast('success', global.I18n.t('auth.userUpdated'));
            self.render();
            return true;
          }
          if (errEl) errEl.textContent = result.error;
          return false;
        }
      });
    },

    /* ---------------- delete user ---------------- */

    _confirmDelete(userId) {
      const user = global.Auth.getAllUsers().find((u) => u.id === userId);
      if (!user) return;

      const self = this;
      global.UI.modal({
        title: global.I18n.t('auth.deleteUser') + ' — ' + user.username,
        bodyHTML: '<p class="text-sm text-slate-300">Are you sure you want to delete this user? This cannot be undone.</p>',
        confirmText: global.I18n.t('auth.delete'),
        cancelText: global.I18n.t('auth.cancel'),
        danger: true,
        onConfirm: () => {
          const result = global.Auth.deleteUser(userId);
          if (result.success) {
            global.UI.toast('success', global.I18n.t('auth.userDeleted'));
            self.render();
            return true;
          }
          global.UI.toast('error', result.error);
          return false;
        }
      });
    },

  };

  global.UserManager = UserManager;

})(typeof globalThis !== 'undefined' ? globalThis : window);