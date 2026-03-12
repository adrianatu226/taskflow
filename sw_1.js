// TaskFlow Service Worker — background notifications
let SB_URL = '';
let SB_KEY = '';
let USER = '';
let lastTicketIds = null;
let lastMentionIds = null;

async function fetchAndNotify(currentTicketIds, currentMentionIds) {
  if (!SB_URL || !SB_KEY || !USER) return;
  const headers = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

  try {
    const r = await fetch(SB_URL + '/rest/v1/tickets?assignee=eq.' + encodeURIComponent(USER) + '&status=neq.Listo&order=created_at.desc&limit=50', { headers });
    const tickets = await r.json();
    if (Array.isArray(tickets)) {
      const freshIds = tickets.map(t => t.doc_id);
      const knownIds = (currentTicketIds || '').split(',').filter(Boolean);
      if (knownIds.length > 0) {
        tickets.filter(t => !knownIds.includes(t.doc_id)).forEach(t => {
          const pri = t.priority === 'Alta' ? '🔴' : t.priority === 'Media' ? '🟡' : '🟢';
          self.registration.showNotification('📬 Nuevo ticket asignado', {
            body: pri + ' ' + t.title + '\nDe: ' + (t.created_by_name || '—') + ' · ' + (t.category || ''),
            tag: 'ticket-' + t.doc_id, renotify: true
          });
        });
      }
      lastTicketIds = freshIds.join(',');
    }
  } catch (e) {}

  try {
    const r = await fetch(SB_URL + '/rest/v1/mention_tasks?mentioned_user=eq.' + encodeURIComponent(USER) + '&resolved_at=is.null&order=created_at.desc&limit=20', { headers });
    const mentions = await r.json();
    if (Array.isArray(mentions)) {
      const freshIds = mentions.map(m => m.id);
      const knownIds = (currentMentionIds || '').split(',').filter(Boolean);
      if (lastMentionIds !== null) {
        mentions.filter(m => !knownIds.includes(m.id)).forEach(m => {
          self.registration.showNotification('💬 Te mencionaron', {
            body: '@' + m.mentioned_by + ' te etiquetó en un ticket',
            tag: 'mention-' + m.id, renotify: true
          });
        });
      }
      lastMentionIds = freshIds.join(',');
    }
  } catch (e) {}
}

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'INIT') {
    SB_URL = e.data.sbUrl;
    SB_KEY = e.data.sbKey;
    USER = e.data.user;
    lastTicketIds = e.data.currentTicketIds || '';
    lastMentionIds = e.data.currentMentionIds || '';
  }
  if (e.data.type === 'CHECK_NOW') {
    fetchAndNotify(e.data.currentTicketIds, e.data.currentMentionIds);
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const tf = cs.find(c => c.url.includes('TaskFlow'));
    if (tf) return tf.focus();
    return clients.openWindow('TaskFlow.html');
  }));
});
