// Poof Telegram bot (@usepoofbot)
// Reads the bot token (BOT_TOKEN) and the filter store (FILTERS) from its environment.
//
// Filters work like Guardian, with their own command names so Guardian does not answer too (admins only):
//   /addfilter website Visit usepoof.chat     add or update a filter, then /website answers with that text
//   reply to a message (text or photo) with /addfilter name   save that message as the filter
//   /delfilter website                        remove a filter (also turns off a built-in one)
//   /listfilters                              list all filters

const SITE = 'https://usepoof.chat';
const LINKS = {
  website: SITE,
  x: 'https://x.com/usepoofchat',
  docs: SITE + '/docs/',
  github: 'https://github.com/usepoofchat',
  telegram: 'https://t.me/usepoofchat',
};
const BOT_USERNAME = 'usepoofbot';
const OWNER_ID = 8984315558;            // Jason - can manage filters from the bot DM
const PORTAL = '@usepoofchat';          // Poof Portal channel
const VERIFY_URL = 'https://t.me/guardianapp/portal?startapp=HjxHQ5DKnoXIxGr4&mode=compact';
const IMG = 'https://raw.githubusercontent.com/usepoofchat/poof-telegram-bot/main/assets/';
const IMG_FALLBACK = 'https://raw.githubusercontent.com/usepoofchat/poof-site/main/og-image.png';

const VIDEO_META = { width: 1280, height: 720, duration: 6, supports_streaming: true };   // portal.mp4
const VIDEO_FIELDS = { width: '1280', height: '720', duration: '6', supports_streaming: 'true' };

const btn = (text, url) => ({ text, url });
const LINK_ROWS = [
  [btn('Website', LINKS.website), btn('X', LINKS.x)],
  [btn('Docs', LINKS.docs), btn('GitHub', LINKS.github)],
];

// Built-in filters (defaults). A filter saved with /addfilter under the same name replaces the built-in one.
const TEXT = {
  links: '<b>Official Poof links</b>\n\nWebsite: usepoof.chat\nX: @usepoofchat\nDocs: usepoof.chat/docs\nGitHub: github.com/usepoofchat\nTelegram: t.me/usepoofchat\n\nAdmins never DM first.',
  website: '<b>Poof</b>\nPrivate rooms in your browser. No email, no phone, no account. Nothing is kept.\n\nusepoof.chat',
  x: '<b>Poof on X</b>\nNews and updates: @usepoofchat',
  docs: '<b>Poof docs</b>\nHow rooms work, security, threat model and FAQ.\n\nusepoof.chat/docs',
  github: '<b>Poof on GitHub</b>\ngithub.com/usepoofchat',
  ca: '<b>Contract address</b>\nThere is no contract address yet. The official one will be posted here, on usepoof.chat and on X (@usepoofchat) at launch.\n\nNever trust a CA sent to you in DMs.',
  rules: '<b>Poof - Group rules</b>\n\n1. Be respectful. No hate or harassment.\n2. No spam, shilling or unsolicited promotion.\n3. No links from members. Ask an admin to share one.\n4. Admins never DM first. Anyone who does is a scammer.\n5. No financial advice. Do your own research.\n6. English in the main chat.',
  start: '<b>Hi, I\'m the Poof bot.</b>\n\nPoof is a private, temporary chatroom in your browser. Talk freely. Then poof.\n\nSend /help to see everything I can do.',
  portal: '<b>Welcome to Poof.</b>\n\nPrivate rooms in your browser. No email, no phone, no account. Nothing is kept.\n\nTap <b>Verify and join</b> to enter the community.\nAdmins never DM first.',
};

const ALIASES = {
  help: 'help', commands: 'help',
  links: 'links', link: 'links', socials: 'links', start: 'start',
  website: 'website', site: 'website', web: 'website', app: 'website',
  x: 'x', twitter: 'x',
  docs: 'docs', documentation: 'docs', doc: 'docs',
  github: 'github', git: 'github',
  ca: 'ca', contract: 'ca',
  rules: 'rules',
};

const BUTTONS = {
  links: LINK_ROWS,
  start: LINK_ROWS,
  website: [[btn('Open usepoof.chat', LINKS.website)]],
  x: [[btn('Open @usepoofchat', LINKS.x)]],
  docs: [[btn('Read the docs', LINKS.docs)]],
  github: [[btn('Open GitHub', LINKS.github)]],
  ca: [[btn('Follow @usepoofchat', LINKS.x)]],
  rules: null,
};

// Shown in the "/" menu. Custom filters are added automatically.
const MENU = [
  ['help', 'All commands and how to use them'],
  ['links', 'All official Poof links'],
  ['website', 'Poof website'],
  ['x', 'Poof on X'],
  ['docs', 'Documentation'],
  ['github', 'Source on GitHub'],
  ['ca', 'Contract address'],
  ['rules', 'Group rules'],
];
const FILTER_CMDS = ['addfilter', 'delfilter', 'listfilters'];
const RESERVED = [...FILTER_CMDS, 'filter', 'stop', 'filters', 'postportal', 'start', 'help'];

async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function hookSecret(env) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('poof:' + env.BOT_TOKEN));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

async function imageUrl(name) {
  const r = await fetch(IMG + name, { method: 'HEAD' });
  return r.ok ? IMG + name : IMG_FALLBACK;
}

// multipart call, used to upload the portal video from the repo
async function tgForm(env, method, fields, file) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  if (file) fd.append(file.field, file.blob, file.name);
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, { method: 'POST', body: fd });
  return r.json();
}

// Updates the pinned portal post in place. Media, in order: a file Jason sent to the bot with /postportal as caption,
// else assets/portal.mp4 from this repo (sent as a video, so Telegram shows it full width), else the portal image.
// If the pinned post can't be edited (none yet, or not from the bot), publishes a new one and pins it.
async function postPortal(env, given) {
  const markup = { inline_keyboard: [[btn('Verify and join', VERIFY_URL)], ...LINK_ROWS] };
  let blob = null;
  if (!given) {
    const vid = await fetch(IMG + 'portal.mp4');
    blob = vid.ok ? await vid.blob() : null;
  }
  const media = given
    ? { type: given.type, media: given.id, caption: TEXT.portal, parse_mode: 'HTML' }
    : blob
      ? { type: 'video', media: 'attach://vid', ...VIDEO_META, caption: TEXT.portal, parse_mode: 'HTML' }
      : { type: 'photo', media: await imageUrl('portal.jpg'), caption: TEXT.portal, parse_mode: 'HTML' };
  const file = blob ? { field: 'vid', blob, name: 'portal.mp4' } : null;

  const chat = await tg(env, 'getChat', { chat_id: PORTAL });
  const pinned = chat.ok && chat.result.pinned_message;
  if (pinned) {   // channel posts have no 'from', so just try: Telegram only lets the bot edit its own posts
    const r = await tgForm(env, 'editMessageMedia', { chat_id: PORTAL, message_id: String(pinned.message_id), media, reply_markup: markup }, file);
    if (r.ok || /not modified/.test(r.description || '')) return { ok: true, edited: true };
  }
  const sendMethod = { photo: 'sendPhoto', animation: 'sendAnimation', video: 'sendVideo' }[media.type];
  const sent = given
    ? await tg(env, sendMethod, { chat_id: PORTAL, [media.type]: given.id, caption: TEXT.portal, parse_mode: 'HTML', reply_markup: markup })
    : blob
    ? await tgForm(env, 'sendVideo', { chat_id: PORTAL, ...VIDEO_FIELDS, caption: TEXT.portal, parse_mode: 'HTML', reply_markup: markup }, { field: 'video', blob, name: 'portal.mp4' })
    : await tg(env, 'sendPhoto', { chat_id: PORTAL, photo: media.media, caption: TEXT.portal, parse_mode: 'HTML', reply_markup: markup });
  if (sent.ok) {
    await tg(env, 'pinChatMessage', { chat_id: PORTAL, message_id: sent.result.message_id, disable_notification: true });
  }
  return sent;
}

// ---------- formatting: Telegram entities -> HTML, so links and bold survive ----------
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => esc(s).replace(/"/g, '&quot;');

function toHtml(text, entities, from = 0) {
  if (!text) return '';
  const opens = {}, closes = {};
  const add = (map, i, tag, front) => { (map[i] = map[i] || [])[front ? 'unshift' : 'push'](tag); };
  for (const e of entities || []) {
    const s = e.offset - from, t = e.offset + e.length - from;
    if (t <= 0 || s >= text.length) continue;
    const a = Math.max(0, s), b = Math.min(text.length, t);
    let open = null, close = null;
    if (e.type === 'bold') { open = '<b>'; close = '</b>'; }
    else if (e.type === 'italic') { open = '<i>'; close = '</i>'; }
    else if (e.type === 'underline') { open = '<u>'; close = '</u>'; }
    else if (e.type === 'strikethrough') { open = '<s>'; close = '</s>'; }
    else if (e.type === 'spoiler') { open = '<tg-spoiler>'; close = '</tg-spoiler>'; }
    else if (e.type === 'code') { open = '<code>'; close = '</code>'; }
    else if (e.type === 'pre') { open = '<pre>'; close = '</pre>'; }
    else if (e.type === 'text_link') { open = `<a href="${escAttr(e.url)}">`; close = '</a>'; }
    if (open) { add(opens, a, open, false); add(closes, b, close, true); }
  }
  let out = '';
  for (let i = 0; i <= text.length; i++) {
    if (closes[i]) out += closes[i].join('');
    if (opens[i]) out += opens[i].join('');
    if (i < text.length) out += esc(text[i]);
  }
  return out;
}

// ---------- filters storage ----------
const cleanName = s => (s || '').replace(/^\//, '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);

async function getFilter(env, name) {
  if (!env.FILTERS) return null;
  const v = await env.FILTERS.get('f:' + name);
  return v ? JSON.parse(v) : null;
}

async function listFilters(env) {
  if (!env.FILTERS) return [];
  const out = [];
  let cursor;
  do {
    const r = await env.FILTERS.list({ prefix: 'f:', cursor });
    for (const k of r.keys) out.push(k.name.slice(2));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}

// override = { name: filterObject | null } for a change the store may not list yet (listing can lag behind writes)
async function syncMenu(env, override = {}) {
  let custom = await listFilters(env);
  for (const [n, v] of Object.entries(override)) {
    custom = custom.filter(c => c !== n);
    if (v) custom.push(n);
  }
  const disabled = new Set();
  const commands = [];
  const live = [];
  for (const name of custom) {
    const f = name in override ? override[name] : await getFilter(env, name);
    if (!f) continue;
    live.push(name);
    if (f.disabled) disabled.add(name);
  }
  custom = live;
  for (const [c, d] of MENU) if (!disabled.has(c)) commands.push({ command: c, description: d });
  for (const name of custom) {
    if (disabled.has(name) || MENU.some(m => m[0] === name)) continue;
    commands.push({ command: name, description: 'Poof: ' + name });
  }
  await tg(env, 'setMyCommands', { commands: commands.slice(0, 100) });
}

async function isAdmin(env, msg) {
  if (!msg.from) return false;
  if (msg.from.id === OWNER_ID) return true;
  if (msg.chat.type === 'private') return false;
  if (msg.sender_chat && msg.sender_chat.id === msg.chat.id) return true; // anonymous admin
  const r = await tg(env, 'getChatMember', { chat_id: msg.chat.id, user_id: msg.from.id });
  return r.ok && (r.result.status === 'administrator' || r.result.status === 'creator');
}

async function reply(env, msg, text, extra = {}) {
  const body = { chat_id: msg.chat.id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra };
  if (msg.chat.type !== 'private') body.reply_parameters = { message_id: msg.message_id, allow_sending_without_reply: true };
  return tg(env, 'sendMessage', body);
}

async function sendFilter(env, msg, f) {
  const base = {};
  if (msg.chat.type !== 'private') base.reply_parameters = { message_id: msg.message_id, allow_sending_without_reply: true };
  if (f.photo) {
    return tg(env, 'sendPhoto', { chat_id: msg.chat.id, photo: f.photo, caption: f.html || undefined, parse_mode: 'HTML', ...base });
  }
  return tg(env, 'sendMessage', { chat_id: msg.chat.id, text: f.html, parse_mode: 'HTML', disable_web_page_preview: !f.preview, ...base });
}

async function sendHelp(env, msg) {
  const custom = await listFilters(env);
  const off = new Set(), on = [];
  for (const n of custom) { const f = await getFilter(env, n); if (!f) continue; if (f.disabled) off.add(n); else if (!MENU.some(m => m[0] === n)) on.push(n); }
  let out = '<b>Poof bot - how to use it</b>\n\n<b>Commands for everyone</b>\n';
  for (const [c, d] of MENU) if (!off.has(c)) out += `/${c} - ${d}\n`;
  if (on.length) out += '\n<b>Extra filters</b>\n' + on.map(n => '/' + n).join(' ') + '\n';
  out += '\nAdmins never DM first.';
  if (await isAdmin(env, msg)) {
    out += '\n\n<b>Admins: filters</b>\n'
      + '/addfilter name text - add or update a filter. After that /name answers with the text. Links and bold are kept.\n'
      + 'Reply to a message (text or photo) with /addfilter name - save that message as the filter.\n'
      + '/delfilter name - remove a filter. Built-in ones can be turned off the same way, and /addfilter brings them back with your text.\n'
      + '/listfilters - list all filters.\n'
      + 'Do not use /filter: that is Guardian\'s command and gives double replies.';
    if (msg.chat.type === 'private' && msg.from && msg.from.id === OWNER_ID) {
      out += '\n\n<b>Owner (in this DM)</b>\n/postportal - refresh the pinned portal post in Poof Portal. Send a GIF/video or photo here with /postportal as caption to use it.';
    }
  }
  await reply(env, msg, out);
}

async function handleFilterCommand(env, msg, cmd, text, entities) {
  if (!env.FILTERS) { await reply(env, msg, 'Filter storage is not connected yet.'); return; }
  if (!(await isAdmin(env, msg))) { await reply(env, msg, 'Only admins can manage filters.'); return; }

  if (cmd === 'listfilters') {
    const custom = await listFilters(env);
    const off = [], on = [];
    for (const n of custom) { const f = await getFilter(env, n); if (f) (f.disabled ? off : on).push(n); }
    const builtIn = MENU.map(m => m[0]).filter(a => !custom.includes(a));
    let out = '<b>Filters</b>\n\nCustom: ' + (on.length ? on.map(n => '/' + n).join(' ') : 'none');
    out += '\nBuilt-in: ' + builtIn.map(n => '/' + n).join(' ');
    if (off.length) out += '\nTurned off: ' + off.map(n => '/' + n).join(' ');
    out += '\n\nAdd or update: /addfilter name text\nRemove: /delfilter name';
    await reply(env, msg, out);
    return;
  }

  // split "/addfilter name rest of text" keeping exact offsets for formatting
  const m = text.match(/^\/\S+\s+(\S+)(\s+)?/);
  const name = m ? cleanName(m[1]) : '';
  if (!name) {
    await reply(env, msg, cmd === 'addfilter' ? 'Use: /addfilter name text\nOr reply to a message with /addfilter name' : 'Use: /delfilter name');
    return;
  }
  if (RESERVED.includes(name)) { await reply(env, msg, `/${name} is reserved and can't be a filter.`); return; }

  if (cmd === 'delfilter') {
    if (ALIASES[name]) {
      await env.FILTERS.put('f:' + name, JSON.stringify({ disabled: true }));
      await syncMenu(env, { [name]: { disabled: true } });
    } else {
      await env.FILTERS.delete('f:' + name);
      await syncMenu(env, { [name]: null });
    }
    await reply(env, msg, `Filter /${name} removed.`);
    return;
  }

  // cmd === 'addfilter'
  const contentStart = m[0].length;
  let f = null;
  if (contentStart < text.length && text.slice(contentStart).trim()) {
    f = { html: toHtml(text.slice(contentStart), entities, contentStart).trim() };
  } else if (msg.reply_to_message) {
    const r = msg.reply_to_message;
    if (r.photo && r.photo.length) {
      f = { photo: r.photo[r.photo.length - 1].file_id, html: toHtml(r.caption || '', r.caption_entities) };
    } else if (r.text) {
      f = { html: toHtml(r.text, r.entities) };
    }
  }
  if (!f || (!f.html && !f.photo)) {
    await reply(env, msg, 'Use: /addfilter name text\nOr reply to a message with /addfilter name');
    return;
  }
  const existed = !!(await getFilter(env, name)) || !!ALIASES[name];
  await env.FILTERS.put('f:' + name, JSON.stringify(f));
  await syncMenu(env, { [name]: f });
  await reply(env, msg, `Filter /${name} ${existed ? 'updated' : 'saved'}.`);
}

async function handle(env, update) {
  const msg = update.message;
  if (!msg) return;
  const text = msg.text || msg.caption || '';
  const entities = msg.text ? msg.entities : msg.caption_entities;
  if (!text.startsWith('/')) return;
  const [raw] = text.trim().split(/\s+/);
  const [cmdRaw, target] = raw.slice(1).toLowerCase().split('@');
  if (target && target !== BOT_USERNAME) return;

  if (cmdRaw === 'postportal' && msg.chat.type === 'private' && msg.from && msg.from.id === OWNER_ID) {
    let given = null;
    if (msg.animation) given = { type: 'animation', id: msg.animation.file_id };
    else if (msg.video) given = { type: 'video', id: msg.video.file_id };
    else if (msg.photo && msg.photo.length) given = { type: 'photo', id: msg.photo[msg.photo.length - 1].file_id };
    else if (msg.document && /^video\//.test(msg.document.mime_type || '')) given = { type: 'animation', id: msg.document.file_id };
    const r = await postPortal(env, given);
    await tg(env, 'sendMessage', { chat_id: msg.chat.id, text: r.ok ? (r.edited ? 'Portal post updated.' : 'Portal post published and pinned.') : 'Portal post failed: ' + r.description });
    return;
  }

  if (FILTER_CMDS.includes(cmdRaw)) {
    await handleFilterCommand(env, msg, cmdRaw, text, entities);
    return;
  }

  const name = cleanName(cmdRaw);
  if (!name) return;
  if (ALIASES[name] === 'help') { await sendHelp(env, msg); return; }
  const key = ALIASES[name] || name;          // /site, /twitter etc. follow their main filter
  const custom = await getFilter(env, key);
  if (custom) {
    if (!custom.disabled) await sendFilter(env, msg, custom);
    return;
  }
  if (!ALIASES[name]) return;
  await reply(env, msg, TEXT[key], BUTTONS[key] ? { reply_markup: { inline_keyboard: BUTTONS[key] } } : {});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.BOT_TOKEN) return new Response('BOT_TOKEN secret is missing', { status: 500 });

    if (url.pathname === '/setup') {
      const secret = await hookSecret(env);
      const r = await tg(env, 'setWebhook', {
        url: `${url.origin}/tg`,
        secret_token: secret,
        allowed_updates: ['message'],
        drop_pending_updates: true,
      });
      if (env.FILTERS) await syncMenu(env);
      return Response.json(r);
    }

    if (url.pathname === '/tg' && request.method === 'POST') {
      if (request.headers.get('x-telegram-bot-api-secret-token') !== await hookSecret(env)) {
        return new Response('forbidden', { status: 403 });
      }
      const update = await request.json();
      try { await handle(env, update); } catch (e) { console.log('error', e && e.message); }
      return new Response('ok');
    }

    return new Response('Poof bot is running.');
  },
};
