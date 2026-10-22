/* ============================================================
   i18n.js — Bilingual (EN / AR + RTL) dictionary & DOM binding
   ============================================================ */
(function (global) {
  'use strict';

  const DICT = {
    en: {
      'brand.title': 'IT Helpdesk',
      'brand.subtitle': 'Employee Portal & Command Center',
      'nav.user': 'User Portal',
      'nav.admin': 'Admin Center',
      'nav.demo': 'Demo',

      'portal.badge': 'Support Online',
      'portal.title': 'Submit & Track IT Support Tickets',
      'portal.subtitle': 'Report any technical issue in seconds and follow its progress in real time using your unique ticket code.',
      'portal.today': 'Today',
      'portal.step1': 'Fill the form with all details',
      'portal.step2': 'Submit and save your ticket code',
      'portal.step3': 'Track progress with the code',

      'form.title': 'Create a New Ticket',
      'form.subtitle': 'All fields are mandatory',
      'form.name': 'Requester Name',
      'form.namePh': 'Jane Doe',
      'form.empId': 'Employee ID / Email',
      'form.empIdPh': 'EMP-1024 / jane@corp.com',
      'form.dept': 'Department',
      'form.category': 'Issue Category',
      'form.priority': 'Priority Level',
      'form.subject': 'Issue Subject / Title',
      'form.subjectPh': 'Laptop will not connect to Wi-Fi',
      'form.description': 'Detailed Description',
      'form.descPh': 'Describe the issue, when it started, error messages, and the device affected.',
      'form.select': 'Select…',
      'form.submit': 'Submit Ticket',
      'form.hint': 'Your unique ticket code will be generated instantly.',

      'track.title': 'Track Ticket Status',
      'track.subtitle': 'Enter your ticket code, e.g. #IT-98241',
      'track.btn': 'Track Status',
      'track.recent': 'Recently created by you',
      'track.notFound': 'No ticket found for that code. Please check the code and try again.',
      'track.requester': 'Requester',
      'track.department': 'Department',
      'track.category': 'Category',
      'track.priority': 'Priority',
      'track.created': 'Created',
      'track.updated': 'Last Updated',
      'track.assignee': 'Assigned Technician',
      'track.unassigned': 'Unassigned',
      'track.notes': 'Updates & Admin Notes',
      'track.noNotes': 'No updates yet. Our team will post progress here.',
      'track.progress': 'Progress',
      'track.copy': 'Copy Code',
      'track.copied': 'Ticket code copied to clipboard',
      'track.trackAnother': 'Track another ticket',

      'admin.badge': 'Command Center',
      'admin.title': 'IT Helpdesk Operations',
      'admin.subtitle': 'Monitor, assign and resolve every ticket across the organisation.',
      'admin.exportCsv': 'Export CSV',
      'admin.exportJson': 'Export JSON',
      'admin.search': 'Live search',
      'admin.searchPh': 'Code, name, subject…',
      'admin.filterStatus': 'Status',
      'admin.filterPriority': 'Priority',
      'admin.reset': 'Reset',
      'admin.ticketsShown': 'tickets shown',
      'admin.sort': 'Sort',
      'admin.sortNewest': 'Newest first',
      'admin.sortOldest': 'Oldest first',
      'admin.sortPriority': 'Priority',
      'admin.sortCode': 'Ticket code',
      'admin.emptyTitle': 'No tickets match your filters',
      'admin.emptySub': 'Try adjusting the search or status filters.',
      'admin.closedTickets': 'Closed Tickets',
      'admin.closedTicketsTitle': 'Closed Tickets',
      'admin.closedTicketsNoTickets': 'No closed tickets',
      'admin.closedTicketsDesc': 'There are no closed tickets yet.',
      'admin.description': 'Description',
      'admin.showDesc': 'Show description',
      'admin.hideDesc': 'Hide description',
      'admin.updateStatus': 'Update Status',
      'admin.addNote': 'Add Note',
      'admin.delete': 'Delete Ticket',
      'admin.closeTicket': 'Close Ticket',
      'admin.notePlaceholder': 'Write an internal update for the requester…',
      'admin.assignee': 'Assignee',
      'admin.unassigned': 'Unassigned',
      'admin.notes': 'Admin Notes',
      'admin.noNotes': 'No notes yet.',
      'admin.status': 'Status',
      'admin.manageTeam': 'Manage Team',

      'activity.nav': 'Activity Log',
      'activity.badge': 'Audit Trail',
      'activity.title': 'Activity Log',
      'activity.subtitle': 'Every change made to tickets and the team roster is recorded here.',
      'activity.export': 'Export CSV',
      'activity.clear': 'Clear All Logs',
      'activity.clearConfirmTitle': 'Clear Activity Log',
      'activity.clearConfirm': 'Are you sure you want to clear all activity logs? This action cannot be undone.',
      'activity.clearedTitle': 'Activity log cleared',
      'activity.clearedMsg': '{count} event(s) removed from the audit trail.',
      'activity.filterType': 'Event type',
      'activity.allTypes': 'All event types',
      'activity.search': 'Search activity',
      'activity.searchPh': 'Action, ticket code, details…',
      'activity.eventsShown': 'events shown',
      'activity.emptyTitle': 'No activity recorded yet',
      'activity.emptySub': 'Actions such as creating, updating or closing a ticket will appear here.',
      'activity.type.ticket_created': 'Ticket created',
      'activity.type.status_changed': 'Status changed',
      'activity.type.assigned': 'Ticket assigned',
      'activity.type.note_added': 'Note added',
      'activity.type.ticket_deleted': 'Ticket deleted',
      'activity.type.ticket_rejected': 'Ticket rejected',
      'activity.type.ticket_reopened': 'Ticket reopened',
      'activity.type.ticket_closed': 'Ticket closed',
      'activity.type.team_member_added': 'Team member added',
      'activity.type.team_member_removed': 'Team member removed',
      'activity.type.system': 'System event',

      'team.title': 'IT Team Members',
      'team.hint': 'Adding or removing members updates the Assignee dropdown on every ticket. Deleting a member returns their tickets to Unassigned.',
      'team.namePh': 'Full name',
      'team.rolePh': 'Role / specialty',
      'team.add': 'Add member',
      'team.remove': 'Remove',
      'team.added': 'Team member added',
      'team.addedMsg': '{name} can now be assigned tickets',
      'team.removed': 'Team member removed',
      'team.removedMsg': '{name} was removed from the team',
      'team.reassignedMsg': '{count} tickets moved back to Unassigned',
      'team.duplicate': 'This person is already on the team.',
      'team.nameShort': 'Please enter a name with at least 2 characters.',

      'm.total': 'Total Tickets',
      'm.open': 'Open / Pending',
      'm.progress': 'In Progress',
      'm.closed': 'Closed / Resolved',
      'm.rejected': 'Rejected',

      'filter.all': 'All',

      'status.pending': 'Pending / Received',
      'status.analyzing': 'Analyzing',
      'status.in_progress': 'In Progress',
      'status.on_hold': 'On Hold Temporarily',
      'status.resolved': 'Resolved / Closed',
      'status.rejected': 'Rejected',

      'status.pending.ar': 'تم الاستلام',
      'status.analyzing.ar': 'جاري التحليل',
      'status.in_progress.ar': 'جاري التنفيذ',
      'status.on_hold.ar': 'مُعلق مؤقتاً',
      'status.resolved.ar': 'تم الحل',
      'status.rejected.ar': 'مرفوض',

      'toast.created': 'Ticket created',
      'toast.createdMsg': 'Your ticket code is {code}',
      'toast.updated': 'Status updated',
      'toast.updatedMsg': '{code} is now {status}',
      'toast.noteAdded': 'Note added',
      'toast.noteAddedMsg': 'Update published on {code}',
      'toast.deleted': 'Ticket deleted',
      'toast.deletedMsg': '{code} was removed',
      'toast.error': 'Something went wrong',
      'toast.exported': 'Export ready',
      'toast.exportedMsg': '{count} tickets exported as {format}',
      'toast.demoLoaded': 'Demo data loaded',
      'toast.demoLoadedMsg': '{count} sample tickets are ready',
      'toast.demoCleared': 'Demo data cleared',
      'toast.demoClearedMsg': 'All tickets were removed',

      'err.required': 'This field is required.',
      'err.nameShort': 'Please enter at least 2 characters.',
      'err.email': 'Enter a valid email or a valid employee ID.',
      'err.subjectShort': 'Subject must be at least 5 characters.',
      'err.descShort': 'Please describe the issue in at least 10 characters.',
      'err.codeEmpty': 'Please enter a ticket code.',
      'err.codeFormat': 'Invalid code format. Use IT-12345.',

      'modal.deleteTitle': 'Delete ticket?',
      'modal.deleteBody': 'This will permanently remove {code}. This action cannot be undone.',
      'modal.rejectTitle': 'Rejection reason required',
      'modal.rejectBody': 'Please provide a reason for rejecting {code}. The requester will see this note.',
      'modal.cancel': 'Cancel',
      'modal.confirm': 'Confirm',
      'modal.deleteConfirm': 'Delete',
      'modal.rejectConfirm': 'Reject ticket',
      'modal.noteTitle': 'Add internal note',
      'modal.noteBody': 'This update will be visible to the requester when tracking {code}.',
      'modal.notePlaceholder': 'e.g. Replacement adapter shipped to reception, ETA tomorrow.',
      'modal.noteConfirm': 'Publish note',
      'modal.reasonPlaceholder': 'e.g. Request is outside IT support scope.',
      'modal.required': 'This field is required.',
      'modal.close': 'Close',
      'modal.closeTicketTitle': 'Close this ticket?',
      'modal.closeTicketBody': '{code} will be marked as resolved and closed. The requester will see the final status.',
      'modal.closeTicketConfirm': 'Close Ticket',

      'footer.note': 'Pure HTML5 · CSS3 (Tailwind) · Vanilla JS · LocalStorage persistence'
    },

    ar: {
      'brand.title': 'مكتب مساعدة تقنية',
      'brand.subtitle': 'بوابة الموظفين ومركز التحكم',
      'nav.user': 'بوابة المستخدم',
      'nav.admin': 'مركز الإدارة',
      'nav.demo': 'تجريبي',

      'portal.badge': 'الدعم متاح',
      'portal.title': 'تقديم ومتابعة تذاكر الدعم الفني',
      'portal.subtitle': 'أبلغ عن أي مشكلة تقنية خلال ثوانٍ وتابع سير العمل لحظيًا باستخدام رقم التذكرة الفريد.',
      'portal.today': 'التاريخ',
      'portal.step1': 'املأ النموذج بكل التفاصيل',
      'portal.step2': 'أرسل التذكرة واحفظ رقمها',
      'portal.step3': 'تابع التقدم باستخدام الرقم',

      'form.title': 'إنشاء تذكرة جديدة',
      'form.subtitle': 'جميع الحقول إلزامية',
      'form.name': 'اسم مقدم الطلب',
      'form.namePh': 'محمد أحمد',
      'form.empId': 'الرقم الوظيفي / البريد',
      'form.empIdPh': 'EMP-1024 / user@corp.com',
      'form.dept': 'القسم',
      'form.category': 'نوع المشكلة',
      'form.priority': 'درجة الأولوية',
      'form.subject': 'عنوان المشكلة',
      'form.subjectPh': 'الجهاز لا يتصل بشبكة الواي فاي',
      'form.description': 'وصف تفصيلي',
      'form.descPh': 'اشرح المشكلة ومتى بدأت ورسائل الخطأ والجهاز المتأثر.',
      'form.select': 'اختر…',
      'form.submit': 'إرسال التذكرة',
      'form.hint': 'سيتم توليد رقم تذكرة فريد فورًا.',

      'track.title': 'متابعة حالة التذكرة',
      'track.subtitle': 'أدخل رقم التذكرة، مثال #IT-98241',
      'track.btn': 'تتبع الحالة',
      'track.recent': 'التذاكر التي أنشأتها مؤخرًا',
      'track.notFound': 'لم يتم العثور على تذكرة بهذا الرقم. تأكد من الرقم وحاول مجددًا.',
      'track.requester': 'مقدم الطلب',
      'track.department': 'القسم',
      'track.category': 'النوع',
      'track.priority': 'الأولوية',
      'track.created': 'تاريخ الإنشاء',
      'track.updated': 'آخر تحديث',
      'track.assignee': 'الفني المسؤول',
      'track.unassigned': 'غير مُسند',
      'track.notes': 'التحديثات وملاحظات الإدارة',
      'track.noNotes': 'لا توجد تحديثات بعد. سيقوم فريقنا بنشر التقدم هنا.',
      'track.progress': 'نسبة الإنجاز',
      'track.copy': 'نسخ الرقم',
      'track.copied': 'تم نسخ رقم التذكرة',
      'track.trackAnother': 'تتبع تذكرة أخرى',

      'admin.badge': 'مركز التحكم',
      'admin.title': 'إدارة مكتب المساعدة التقنية',
      'admin.subtitle': 'راقب وأسند وحل جميع التذاكر في المؤسسة.',
      'admin.exportCsv': 'تصدير CSV',
      'admin.exportJson': 'تصدير JSON',
      'admin.search': 'بحث مباشر',
      'admin.searchPh': 'الرقم، الاسم، الموضوع…',
      'admin.filterStatus': 'الحالة',
      'admin.filterPriority': 'الأولوية',
      'admin.reset': 'إعادة تعيين',
      'admin.ticketsShown': 'تذكرة معروضة',
      'admin.sort': 'ترتيب',
      'admin.sortNewest': 'الأحدث أولًا',
      'admin.sortOldest': 'الأقدم أولًا',
      'admin.sortPriority': 'الأولوية',
      'admin.sortCode': 'رقم التذكرة',
      'admin.emptyTitle': 'لا توجد تذاكر مطابقة للفلاتر',
      'admin.emptySub': 'جرّب تعديل البحث أو فلاتر الحالة.',
      'admin.closedTickets': 'التذاكر المغلقة',
      'admin.closedTicketsTitle': 'التذاكر المغلقة',
      'admin.closedTicketsNoTickets': 'لا توجد تذاكر مغلقة',
      'admin.closedTicketsDesc': 'لا توجد تذاكر مغلقة حتى الآن.',
      'admin.description': 'الوصف',
      'admin.showDesc': 'عرض الوصف',
      'admin.hideDesc': 'إخفاء الوصف',
      'admin.updateStatus': 'تحديث الحالة',
      'admin.addNote': 'إضافة ملاحظة',
      'admin.delete': 'حذف التذكرة',
      'admin.closeTicket': 'إغلاق التذكرة',
      'admin.notePlaceholder': 'اكتب تحديثًا داخليًا لمقدم الطلب…',
      'admin.assignee': 'المسؤول',
      'admin.unassigned': 'غير مُسند',
      'admin.notes': 'ملاحظات الإدارة',
      'admin.noNotes': 'لا توجد ملاحظات بعد.',
      'admin.status': 'الحالة',
      'admin.manageTeam': 'إدارة الفريق',

      'activity.nav': 'سجل النشاط',
      'activity.badge': 'سجل التدقيق',
      'activity.title': 'سجل النشاط',
      'activity.subtitle': 'يتم تسجيل كل تغييرات التذاكر وقائمة الفريق هنا.',
      'activity.export': 'تصدير CSV',
      'activity.clear': 'مسح جميع السجلات',
      'activity.clearConfirmTitle': 'مسح سجل النشاط',
      'activity.clearConfirm': 'هل أنت متأكد أنك تريد مسح جميع سجلات النشاط؟ لا يمكن التراجع عن هذا الإجراء.',
      'activity.clearedTitle': 'تم مسح سجل النشاط',
      'activity.clearedMsg': 'تم مسح {count} حدث من سجل التدقيق.',
      'activity.filterType': 'نوع الحدث',
      'activity.allTypes': 'كل أنواع الأحداث',
      'activity.search': 'بحث في السجل',
      'activity.searchPh': 'الإجراء، رقم التذكرة، التفاصيل…',
      'activity.eventsShown': 'حدث معروض',
      'activity.emptyTitle': 'لم يتم تسجيل أي نشاط بعد',
      'activity.emptySub': 'ستظهر هنا الإجراءات مثل إنشاء أو تعديل أو إغلاق التذاكر.',
      'activity.type.ticket_created': 'إنشاء تذكرة',
      'activity.type.status_changed': 'تغيير الحالة',
      'activity.type.assigned': 'إسناد تذكرة',
      'activity.type.note_added': 'إضافة ملاحظة',
      'activity.type.ticket_deleted': 'حذف تذكرة',
      'activity.type.ticket_rejected': 'رفض تذكرة',
      'activity.type.ticket_reopened': 'إعادة فتح تذكرة',
      'activity.type.ticket_closed': 'إغلاق تذكرة',
      'activity.type.team_member_added': 'إضافة عضو للفريق',
      'activity.type.team_member_removed': 'حذف عضو من الفريق',
      'activity.type.system': 'حدث نظام',

      'team.title': 'أعضاء فريق الدعم الفني',
      'team.hint': 'الإضافة والحذف يحدّثان قائمة المسؤول في كل تذكرة. حذف عضو يعيد تذاكره إلى غير مُسند.',
      'team.namePh': 'الاسم الكامل',
      'team.rolePh': 'الوظيفة / التخصص',
      'team.add': 'إضافة عضو',
      'team.remove': 'حذف',
      'team.added': 'تمت إضافة عضو للفريق',
      'team.addedMsg': 'أصبح {name} متاحًا لاستلام التذاكر',
      'team.removed': 'تم حذف عضو من الفريق',
      'team.removedMsg': 'تمت إزالة {name} من الفريق',
      'team.reassignedMsg': 'تمت إعادة {count} تذكرة تخصّ {name} إلى غير مُسند',
      'team.duplicate': 'هذا الشخص موجود بالفعل في الفريق.',
      'team.nameShort': 'الرجاء إدخال اسم من حرفين على الأقل.',

      'm.total': 'إجمالي التذاكر',
      'm.open': 'مفتوحة / معلقة',
      'm.progress': 'قيد التنفيذ',
      'm.closed': 'مغلقة / محولة',
      'm.rejected': 'مرفوضة',

      'filter.all': 'الكل',

      'status.pending': 'معلق / تم الاستلام',
      'status.analyzing': 'جاري التحليل',
      'status.in_progress': 'جاري التنفيذ',
      'status.on_hold': 'مُعلق مؤقتاً',
      'status.resolved': 'تم الحل / مغلق',
      'status.rejected': 'مرفوض',

      'status.pending.ar': 'تم الاستلام',
      'status.analyzing.ar': 'جاري التحليل',
      'status.in_progress.ar': 'جاري التنفيذ',
      'status.on_hold.ar': 'مُعلق مؤقتاً',
      'status.resolved.ar': 'تم الحل',
      'status.rejected.ar': 'مرفوض',

      'toast.created': 'تم إنشاء التذكرة',
      'toast.createdMsg': 'رقم تذكرتك هو {code}',
      'toast.updated': 'تم تحديث الحالة',
      'toast.updatedMsg': 'أصبحت {code} {status}',
      'toast.noteAdded': 'تمت إضافة الملاحظة',
      'toast.noteAddedMsg': 'تم نشر التحديث على {code}',
      'toast.deleted': 'تم حذف التذكرة',
      'toast.deletedMsg': 'تمت إزالة {code}',
      'toast.error': 'حدث خطأ',
      'toast.exported': 'تم التصدير',
      'toast.exportedMsg': 'تم تصدير {count} تذكرة بصيغة {format}',
      'toast.demoLoaded': 'تم تحميل البيانات التجريبية',
      'toast.demoLoadedMsg': '{count} تذكرة تجريبية جاهزة',
      'toast.demoCleared': 'تم مسح البيانات التجريبية',
      'toast.demoClearedMsg': 'تمت إزالة جميع التذاكر',

      'err.required': 'هذا الحقل مطلوب.',
      'err.nameShort': 'الرجاء إدخال حرفين على الأقل.',
      'err.email': 'أدخل بريدًا إلكترونيًا صحيحًا أو رقمًا وظيفيًا صحيحًا.',
      'err.subjectShort': 'يجب ألا يقل العنوان عن 5 أحرف.',
      'err.descShort': 'الرجاء وصف المشكلة في 10 أحرف على الأقل.',
      'err.codeEmpty': 'الرجاء إدخال رقم التذكرة.',
      'err.codeFormat': 'صيغة الرقم غير صحيحة. استخدم IT-12345.',

      'modal.deleteTitle': 'حذف التذكرة؟',
      'modal.deleteBody': 'سيتم حذف {code} نهائيًا. لا يمكن التراجع عن هذا الإجراء.',
      'modal.rejectTitle': 'سبب الرفض مطلوب',
      'modal.rejectBody': 'الرجاء ذكر سبب رفض {code}. سيظهر هذا التوضيح لمقدم الطلب.',
      'modal.cancel': 'إلغاء',
      'modal.confirm': 'تأكيد',
      'modal.deleteConfirm': 'حذف',
      'modal.rejectConfirm': 'رفض التذكرة',
      'modal.noteTitle': 'إضافة ملاحظة داخلية',
      'modal.noteBody': 'سيكون هذا التحديث ظاهرًا لمقدم الطلب عند تتبع {code}.',
      'modal.notePlaceholder': 'مثال: تم إرسال محول بديل إلى الاستقبال، غدًا صباحًا.',
      'modal.noteConfirm': 'نشر الملاحظة',
      'modal.reasonPlaceholder': 'مثال: الطلب خارج نطاق الدعم التقني.',
      'modal.required': 'هذا الحقل مطلوب.',
      'modal.close': 'إغلاق',
      'modal.closeTicketTitle': 'هل تريد إغلاق التذكرة؟',
      'modal.closeTicketBody': 'سيتم تحديد {code} كمحلول ومغلق. سيظهر الحالة النهائية لمقدم الطلب.',
      'modal.closeTicketConfirm': 'إغلاق التذكرة',

      'footer.note': 'HTML5 خالص · CSS3 (Tailwind) · JavaScript خالص · حفظ محلي دائم'
    }
  };

  const I18n = {
    lang: 'en',
    dict: DICT,

    /** Translate a key with optional {token} interpolation. */
    t(key, vars) {
      const table = DICT[this.lang] || DICT.en;
      let out = table[key];
      if (out === undefined) out = DICT.en[key];
      if (out === undefined) return key;
      if (vars) {
        out = out.replace(/\{(\w+)\}/g, (m, name) =>
          Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m
        );
      }
      return out;
    },

    /** Localized status label for the current language. */
    status(statusKey) {
      const key = 'status.' + statusKey;
      return this.lang === 'ar'
        ? (DICT.ar[key] || statusKey)
        : (DICT.en[key] || statusKey);
    },

    /** Short Arabic label for a status key (used in both directions). */
    statusLabel(statusKey) {
      const key = 'status.' + statusKey + '.ar';
      const ar = DICT.en[key] || statusKey;
      return this.lang === 'ar' ? ar : (DICT.en['status.' + statusKey] || ar);
    },

    setLanguage(lang) {
      this.lang = DICT[lang] ? lang : 'en';
      document.documentElement.lang = this.lang;
      document.documentElement.dir = this.lang === 'ar' ? 'rtl' : 'ltr';
      this.apply();
    },

    toggle() {
      this.setLanguage(this.lang === 'en' ? 'ar' : 'en');
      return this.lang;
    },

    /** Apply translations to every [data-i18n] / [data-i18n-ph] node. */
    apply() {
      document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        el.textContent = this.t(key);
      });
      document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
        const key = el.getAttribute('data-i18n-ph');
        el.setAttribute('placeholder', this.t(key));
      });
      document.title = this.lang === 'ar'
        ? 'نظام تذاكر الدعم الفني'
        : 'IT Helpdesk — Ticketing System';
    }
  };

  global.I18n = I18n;
})(window);






