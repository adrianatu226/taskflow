// TaskFlow Service Worker — background notifications
let SB_URL = '';
let SB_KEY = '';
let USER = '';
let lastTicketIds = null;
let lastMentionIds = null;
let pollInterval = null;

async function fetchNew() {
  if (!SB_URL || !SB_KEY || !USER) return;
  const headers = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

  // Nuevos tickets asignados a mí
  try {
    const r = await fetch(SB_URL + '/rest/v1/tickets?assignee=eq.' + encodeURIComponent(USER) + '&status=neq.Listo&order=created_at.desc&limit=50', { headers });
    const tickets = await r.json();
    const ids = tickets.map(t => t.doc_id).join(',');
    if (lastTicketIds !== null && ids !== lastTicketIds) {
      const prev = lastTicketIds ? lastTicketIds.split(',') : [];
      tickets.filter(t => !prev.includes(t.doc_id)).forEach(t => {
        self.registration.showNotification('📬 Nuevo ticket asignado', {
          body: (t.priority === 'Alta' ? '🔴' : t.priority === 'Media' ? '🟡' : '🟢') + ' ' + t.title + '\nDe: ' + (t.created_by_name || '—') + ' · ' + t.category,
          tag: 'ticket-' + t.doc_id,
          renotify: true
        });
      });
    }
    lastTicketIds = ids;
  } catch (e) {}

  // Nuevas menciones
  try {
    const r = await fetch(SB_URL + '/rest/v1/mention_tasks?mentioned_user=eq.' + encodeURIComponent(USER) + '&resolved_at=is.null&order=created_at.desc&limit=20', { headers });
    const mentions = await r.json();
    const ids = mentions.map(m => m.id).join(',');
    if (lastMentionIds !== null && ids !== lastMentionIds) {
      const prev = lastMentionIds ? lastMentionIds.split(',') : [];
      mentions.filter(m => !prev.includes(m.id)).forEach(m => {
        self.registration.showNotification('💬 Te mencionaron', {
          body: '@' + m.mentioned_by + ' te etiquetó en un ticket',
          tag: 'mention-' + m.id,
          renotify: true
        });
      });
    }
    lastMentionIds = ids;
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
    // Inicializar IDs actuales sin notificar
    lastTicketIds = e.data.currentTicketIds || '';
    lastMentionIds = e.data.currentMentionIds || '';
    // Arrancar polling cada 15 segundos
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(fetchNew, 15000);
  }
  if (e.data.type === 'CHECK_NOW') {
    fetchNew();
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(cs => {
    const tf = cs.find(c => c.url.includes('TaskFlow'));
    if (tf) return tf.focus();
    return clients.openWindow('TaskFlow.html');
  }));
});
