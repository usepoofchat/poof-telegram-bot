// Poof Telegram bot (@usepoofbot)
// Reads the bot token (BOT_TOKEN) and the filter store (FILTERS) from its environment.
// Buy alerts also use a SQL database bound as DB and a scheduled run every minute.
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
// Official Poof chats. Only here can admins manage filters and the buy bot; public commands answer everywhere.
// Jason adds a chat with /allowchat (sent in that chat) and removes it with /denychat.
const OFFICIAL_CHATS = [
  '-1004299037353',   // Poof Portal
  '-1003939458745',   // Poof - Group
  '-1004319092641',   // Team
  '-1004489453598',   // KOLs
  '-1003925523149',   // Poof shillers
  '-1004307056422',   // Moderators
  '-1004325014793',   // BuyBot (test)
];
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
  website: '<b>Poof</b>\nPrivate quant-rooms in your browser. No email, no phone, no account. Nothing is kept.\n\nusepoof.chat',
  x: '<b>Poof on X</b>\nNews and updates: @usepoofchat',
  docs: '<b>Poof docs</b>\nHow quant-rooms work, security, threat model and FAQ.\n\nusepoof.chat/docs',
  github: '<b>Poof on GitHub</b>\ngithub.com/usepoofchat',
  ca: '<b>Contract address</b>\nThere is no contract address yet. The official one will be posted here, on usepoof.chat and on X (@usepoofchat) at launch.\n\nNever trust a CA sent to you in DMs.',
  rules: '<b>Poof - Group rules</b>\n\n1. Be respectful. No hate or harassment.\n2. No spam, shilling or unsolicited promotion.\n3. No links from members. Ask an admin to share one.\n4. Admins never DM first. Anyone who does is a scammer.\n5. No financial advice. Do your own research.\n6. English in the main chat.',
  start: '<b>Hi, I\'m the Poof bot.</b>\n\nPoof is a private, temporary chatroom in your browser. Talk freely. Then poof.\n\nSend /help to see everything I can do.',
  portal: '<b>Welcome to Poof.</b>\n\nPrivate quant-rooms in your browser. No email, no phone, no account. Nothing is kept.\n\nTap <b>Verify and join</b> to enter the community.\nAdmins never DM first.',
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
const RESERVED = [...FILTER_CMDS, 'filter', 'stop', 'filters', 'postportal', 'start', 'help', 'buybot', 'allowchat', 'denychat'];

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

// chats added by Jason with /allowchat (kept in the filter store), plus OFFICIAL_CHATS
let allowMem = null;
async function allowedChats(env) {
  if (allowMem && Date.now() - allowMem.t < 60000) return allowMem.ids;
  let extra = [];
  try { extra = env.FILTERS ? JSON.parse((await env.FILTERS.get('allow:chats')) || '[]') : []; } catch (e) { extra = []; }
  const ids = new Set([...OFFICIAL_CHATS, ...extra.map(String)]);
  allowMem = { t: Date.now(), ids, extra };
  return ids;
}
async function setAllowed(env, chatId, on) {
  await allowedChats(env);
  const extra = new Set(allowMem.extra.map(String));
  if (on) extra.add(String(chatId)); else extra.delete(String(chatId));
  await env.FILTERS.put('allow:chats', JSON.stringify([...extra]));
  allowMem = null;
}
const isOfficial = async (env, chatId) => (await allowedChats(env)).has(String(chatId));
// admin of an official Poof chat (or Jason anywhere)
async function isAdmin(env, msg) {
  if (!msg.from) return false;
  if (msg.from.id === OWNER_ID) return true;
  if (msg.chat.type === 'private') return false;
  if (!(await isOfficial(env, msg.chat.id))) return false;
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
      + 'Do not use /filter: that is Guardian\'s command and gives double replies.\n\n<b>Admins: buy bot</b>\n/buybot - status and settings of the buy alerts in this group.';
    if (msg.chat.type === 'private' && msg.from && msg.from.id === OWNER_ID) {
      out += '\n\n<b>Owner (in this DM)</b>\n/postportal - refresh the pinned portal post in Poof Portal. Send a GIF/video or photo here with /postportal as caption to use it.'
        + '\n/allowchat - list official chats here; inside a group, make it official (admins can use filters and the buy bot)\n/denychat - inside a group, take that away';
    }
  }
  await reply(env, msg, out);
}

async function handleFilterCommand(env, msg, cmd, text, entities) {
  if (!env.FILTERS) { await reply(env, msg, 'Filter storage is not connected yet.'); return; }
  if (!(await isAdmin(env, msg))) { await reply(env, msg, (msg.chat.type === 'private' || await isOfficial(env, msg.chat.id)) ? 'Only admins can manage filters.' : 'Filters and the buy bot only work in official Poof groups.'); return; }

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

  if ((cmdRaw === 'allowchat' || cmdRaw === 'denychat') && msg.from && msg.from.id === OWNER_ID && env.FILTERS) {
    if (msg.chat.type === 'private') {
      await allowedChats(env);
      await reply(env, msg, '<b>Official chats</b>\nBuilt in: ' + OFFICIAL_CHATS.length + '\nAdded with /allowchat: ' + (allowMem.extra.length ? allowMem.extra.join(', ') : 'none') + '\n\nSend /allowchat or /denychat inside a group to change it.');
      return;
    }
    if (cmdRaw === 'denychat' && OFFICIAL_CHATS.includes(String(msg.chat.id))) { await reply(env, msg, 'This chat is built in as official. Remove it in the code.'); return; }
    await setAllowed(env, msg.chat.id, cmdRaw === 'allowchat');
    await reply(env, msg, cmdRaw === 'allowchat' ? 'This chat is now an official Poof chat: admins can use filters and the buy bot here.' : 'This chat is no longer official: filters and the buy bot are off here.');
    return;
  }

  if (FILTER_CMDS.includes(cmdRaw)) {
    await handleFilterCommand(env, msg, cmdRaw, text, entities);
    return;
  }

  if (cmdRaw === 'buybot') {
    await handleBuybot(env, msg, text);
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

// ================= Buy bot =================
// Posts every buy of the configured Solana token into the group, in Poof style:
// on the Meteora bonding curve (DBC) first, then on Meteora DAMM v2 after the token graduates.
// State lives in the SQL database bound as DB (tables are created on first use).
// Buys are checked every 3 seconds by a scheduled run (started every minute, one at a time); admins configure it with /buybot in the group.

const SOLANA = {
  name: 'Solana',
  rpcs: ['https://solana-rpc.publicnode.com'],   // used when the SOLANA_RPC_URL secret is missing or failing
  explorer: 'https://solscan.io',
};
const WSOL = 'So11111111111111111111111111111111111111112';
const SOL_DEC = 9;
// Meteora pool accounts (byte offsets in the account data)
const DBC = { program: 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN', discs: ['d5e005d16245775c', 'eddbb8172abda923'],   // SPL and Token-2022 curves share one layout
  mint: 136, baseVault: 168, quoteVault: 200, sqrt: 280, migrated: 305 };
const DAMM = { program: 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG', disc: 'f19a6d0411b16dbc', mintA: 168, mintB: 200, vaultA: 232, vaultB: 264, sqrt: 456 };
const POOL_AUTH = ['FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM', 'HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC'];   // owners of the DBC and DAMM v2 vaults
const METAPLEX = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
const MIGRATION_LOG = 'Program log: Instruction: MigrationDammV2';
const TIERS = [
  { key: 'spark', name: 'Spark' },
  { key: 'puff', name: 'Puff' },
  { key: 'poof', name: 'Poof' },
  { key: 'bigpoof', name: 'Big poof' },
];
const MCAP_PCT = [0.005, 0.025, 0.1];   // % of MCap where Puff, Poof and Big poof start
const FIXED_TIERS = [100, 500, 1500];   // floor for auto tiers (and used when MCap is unknown): launch-size buys of $20 to $4,000 spread over all tiers
const BB_DEFAULT = { enabled: true, minUsd: 20, ttl: 10, tiers: 'auto', emoji: true };   // launch-size buys of $20 and up; tiers follow the MCap by themselves
const BB_SETTINGS = ['enabled', 'minUsd', 'ttl', 'tiers', 'emoji'];
const EMOJI_SET = 'usepoof';
// positions in the usepoof emoji pack
const EM = { mark: 0, coinInk: 1, coinRust: 3, coinStone: 4, poof: 5, foxHi: 6, foxGaze: 9, foxDollar: 10 };
const POLL_MS = 3200;                   // live check about every 3 s: at most one alert per check, so at most 18 or 19 per minute (Telegram allows 20 per group)
const LOOP_MS = 300000;                 // one scheduled run keeps checking for 5 min, then hands over to the next run
const LEASE_MS = 20000;                 // the running check renews its lock every 3 s; if it dies, the lock frees itself after 20 s
const HANDOFF_MS = 70000;               // in its last 70 s a run hands over as soon as the next run is waiting
const MAX_LIST = 5;                     // extra buys listed under the main alert when several land in the same 3 s
const MAX_TX = 24;                      // transactions read per check, oldest first; a rush is read over the next checks
const RPC_RPS = 8;                      // calls per second sent to SOLANA_RPC_URL (free RPC plans usually allow about 10)
const RPC_BATCH = RPC_RPS;              // calls per JSON-RPC batch: one batch fits in one second
const GRAD_RECHECK = 300000;            // every 5 min: is the curve migrated without us seeing it (bot off, missed transaction)?
const sleep = ms => new Promise(res => setTimeout(res, ms));

// ---------- storage (SQL database) ----------
// bb_chats.last_block holds the last Solana transaction signature already read for that chat
let dbReady = false;
async function bbDb(env) {
  if (!env.DB) throw new Error('The database is not connected (binding DB).');
  if (!dbReady) {
    await env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS bb_chats (chat_id TEXT PRIMARY KEY, cfg TEXT NOT NULL, last_block INTEGER)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS bb_pending (chat_id TEXT, msg_id INTEGER, expires INTEGER)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS bb_kv (k TEXT PRIMARY KEY, v TEXT)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS bb_posted (chat_id TEXT, sig TEXT, t INTEGER, PRIMARY KEY (chat_id, sig))'),
    ]);
    dbReady = true;
  }
  return env.DB;
}
async function kvGet(D, k) {
  const r = await D.prepare('SELECT v FROM bb_kv WHERE k = ?').bind(k).first();
  return r ? JSON.parse(r.v) : null;
}
async function kvSet(D, k, v) {
  await D.prepare('INSERT INTO bb_kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, JSON.stringify(v)).run();
}
async function getChatCfg(D, chatId) {
  const r = await D.prepare('SELECT cfg, last_block FROM bb_chats WHERE chat_id = ?').bind(String(chatId)).first();
  return r ? { cfg: JSON.parse(r.cfg), last_block: r.last_block } : null;
}
async function saveChatCfg(D, chatId, cfg, cursor) {
  if (cursor === undefined) {
    await D.prepare('UPDATE bb_chats SET cfg = ? WHERE chat_id = ?').bind(JSON.stringify(cfg), String(chatId)).run();
  } else {
    await D.prepare('INSERT INTO bb_chats (chat_id, cfg, last_block) VALUES (?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET cfg = excluded.cfg, last_block = excluded.last_block')
      .bind(String(chatId), JSON.stringify(cfg), cursor).run();
  }
}

// ---------- Solana helpers ----------
const units = (v, dec) => Number(v) / Math.pow(10, dec);
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) {
  let n = 0n;
  for (const x of bytes) n = n * 256n + BigInt(x);
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const x of bytes) { if (x) break; s = '1' + s; }
  return s;
}
const isAddr = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '');
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hexOf = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
const keyAt = (d, o) => b58(d.slice(o, o + 32));
const u128At = (d, o) => { let n = 0n; for (let i = 15; i >= 0; i--) n = n * 256n + BigInt(d[o + i]); return n; };
const u64At = (d, o) => { let n = 0n; for (let i = 7; i >= 0; i--) n = n * 256n + BigInt(d[o + i]); return n; };
function unb58(s) {   // base58 text to bytes
  const out = [];
  for (const c of s) {
    let carry = B58.indexOf(c);
    if (carry < 0) throw new Error('not base58');
    for (let j = 0; j < out.length; j++) { carry += out[j] * 58; out[j] = carry & 255; carry >>= 8; }
    while (carry) { out.push(carry & 255); carry >>= 8; }
  }
  for (const c of s) { if (c !== '1') break; out.push(0); }
  return Uint8Array.from(out.reverse());
}
const TX_OPTS = { maxSupportedTransactionVersion: 1, encoding: 'jsonParsed', commitment: 'confirmed' };   // version 1 transactions are live on Solana: asking for less leaves them unreadable

// SOLANA_RPC_URL (Worker secret) is tried first, then the public endpoint.
let rpcOverride = null;
let rpcLastError = '';
const rpcDown = {};
async function rpcOnce(url, calls) {
  const body = calls.map((c, i) => ({ jsonrpc: '2.0', id: i, method: c[0], params: c[1] }));
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body.length === 1 ? body[0] : body) });
  if (!r.ok) throw new Error(new URL(url).host + ' ' + r.status + ' ' + calls.map(c => c[0]).join(',') + ' ' + (await r.text()).slice(0, 140));
  const j = JSON.parse(await r.text());
  const out = [];
  for (const x of (Array.isArray(j) ? j : [j])) {
    out[x.id] = x.error ? null : x.result;
    if (x.error) {
      rpcLastError = new URL(url).host + ': ' + (x.error.message || x.error.code);
      if (x.error.code === 429 || /rate.?limit|too many/i.test(x.error.message || '')) out.throttled = true;
    }
  }
  return out;
}
// keeps calls to SOLANA_RPC_URL under RPC_RPS per second: waits until n more calls fit in the last second
const rpcSent = [];
async function rpcSlot(n) {
  for (;;) {
    const now = Date.now();
    while (rpcSent.length && now - rpcSent[0] >= 1000) rpcSent.shift();
    if (!rpcSent.length || rpcSent.length + n <= RPC_RPS) { for (let i = 0; i < n; i++) rpcSent.push(now); return; }
    await sleep(Math.max(50, 1000 - (now - rpcSent[0]) + 20));
  }
}
async function rpc(calls) {
  const urls = [...(rpcOverride ? [rpcOverride] : []), ...SOLANA.rpcs];
  const out = [];
  for (let i = 0; i < calls.length; i += RPC_BATCH) {
    const part = calls.slice(i, i + RPC_BATCH);
    let res = null;
    const errs = [];
    for (const u of urls) {
      if (rpcDown[u] && Date.now() - rpcDown[u] < 120000 && u !== urls[urls.length - 1] && u !== rpcOverride) { errs.push(new URL(u).host + ' skipped'); continue; }
      try {
        if (u === rpcOverride) {
          // paced under the plan's limit; told to slow down: wait a second and send again (twice at most)
          for (let tries = 0; ; tries++) {
            await rpcSlot(part.length);
            try { res = await rpcOnce(u, part); } catch (e) { if (/ 429 /.test(String(e && e.message)) && tries < 2) { await sleep(1100); continue; } throw e; }
            if (res.throttled && tries < 2) { await sleep(1100); continue; }
            break;
          }
        } else {   // the public endpoint takes one heavy call per request: one after another
          res = [];
          for (const c of part) res.push((await rpcOnce(u, [c]))[0]);
        }
        delete rpcDown[u]; break;
      } catch (e) { errs.push(String(e && e.message).replace(/https?:\/\/\S+/g, '[url]').slice(0, 260)); rpcDown[u] = Date.now(); }
    }
    if (!res) throw new Error('RPC unavailable (' + errs.join(' | ') + ')');
    res.forEach((v, j) => { out[i + j] = v; });
    for (let j = res.length; j < part.length; j++) out[i + j] = null;
  }
  return out;
}
const signatures = async (addr, opts) => (await rpc([['getSignaturesForAddress', [addr, Object.assign({ commitment: 'confirmed' }, opts)]]]))[0];
let accSlot = 0;   // slot the last accounts() answer was read at (0 when unknown)
async function accounts(list) {   // { owner, d } or null for each address
  if (!list.length) return [];
  const conv = v => v ? { owner: v.owner, d: fromB64(v.data[0]) } : null;
  const opts = { encoding: 'base64', commitment: 'confirmed' };
  if (list.length > 1) {   // one call for all (the public endpoint refuses it: then one by one)
    try { const [r] = await rpc([['getMultipleAccounts', [list, opts]]]); if (r && Array.isArray(r.value)) { accSlot = (r.context && r.context.slot) || 0; return r.value.map(conv); } } catch (e) { /* one by one */ }
  }
  const res = await rpc(list.map(a => ['getAccountInfo', [a, opts]]));
  accSlot = Math.min(...res.map(r => (r && r.context && r.context.slot) || 0));
  return res.map(r => (r && r.value) ? conv(r.value) : null);
}
// both pool vault balances as one string: when it has not changed, nobody traded since the last check
async function vaultState(P) {
  try {
    const [t, s] = await accounts([P.tokVault, P.solVault]);
    if (!t || !s || t.d.length < 72 || s.d.length < 72) return null;
    const amount = d => { let n = 0n; for (let i = 7; i >= 0; i--) n = n * 256n + BigInt(d[64 + i]); return n; };   // token account amount (u64 at byte 64)
    return P.a + ':' + amount(t.d) + ':' + amount(s.d);
  } catch (e) { return null; }
}
const cleanSym = s => String(s || '').replace(/[^\x20-\x7e]/g, '').trim().slice(0, 20);
async function tokenInfo(mint) {   // decimals, supply and (Token-2022) symbol of the mint, null while it does not exist
  const [r] = await rpc([['getAccountInfo', [mint, { encoding: 'jsonParsed', commitment: 'confirmed' }]]]);
  const info = r && r.value && r.value.data && r.value.data.parsed && r.value.data.parsed.info;
  if (!info || info.decimals === undefined) return null;
  const md = (info.extensions || []).find(e => e.extension === 'tokenMetadata');
  return { dec: info.decimals, supply: units(BigInt(info.supply), info.decimals), sym: cleanSym(md && md.state && md.state.symbol) };
}
// token symbol from the RPC provider's asset index; empty when the provider has none
async function assetSymbol(mint) {
  if (!rpcOverride) return '';
  try {
    await rpcSlot(1);
    const [a] = await rpcOnce(rpcOverride, [['getAsset', { id: mint }]]);
    return cleanSym(a && ((a.content && a.content.metadata && a.content.metadata.symbol) || (a.token_info && a.token_info.symbol)));
  } catch (e) { return ''; }
}
// a Meteora pool of this token paired with SOL: which vault holds the token and which holds the SOL
function readPool(addr, acc, mint) {
  if (!acc || acc.d.length < 300) return null;
  const disc = hexOf(acc.d.slice(0, 8));
  if (acc.owner === DBC.program && DBC.discs.includes(disc)) {
    if (keyAt(acc.d, DBC.mint) !== mint) return null;
    return { a: addr, kind: 'dbc', tokVault: keyAt(acc.d, DBC.baseVault), solVault: keyAt(acc.d, DBC.quoteVault), tokA: true, migrated: acc.d[DBC.migrated] === 1 };
  }
  if (acc.owner === DAMM.program && disc === DAMM.disc && acc.d.length >= DAMM.sqrt + 16) {
    const ma = keyAt(acc.d, DAMM.mintA), mb = keyAt(acc.d, DAMM.mintB);
    if (ma === mint && mb === WSOL) return { a: addr, kind: 'damm', tokVault: keyAt(acc.d, DAMM.vaultA), solVault: keyAt(acc.d, DAMM.vaultB), tokA: true };
    if (mb === mint && ma === WSOL) return { a: addr, kind: 'damm', tokVault: keyAt(acc.d, DAMM.vaultB), solVault: keyAt(acc.d, DAMM.vaultA), tokA: false };
  }
  return null;
}
// current price in SOL per token, from the pool's square-root price (Q64.64)
function spotSol(P, acc, dec) {
  if (!acc) return 0;
  const s = Number(u128At(acc.d, P.kind === 'dbc' ? DBC.sqrt : DAMM.sqrt)) / 2 ** 64;
  let p = s * s;
  if (!(p > 0) || !isFinite(p)) return 0;
  if (!P.tokA) p = 1 / p;
  return p * Math.pow(10, dec - SOL_DEC);
}
function readMeta(d, mint) {   // name and symbol from the token's Metaplex metadata account
  try {
    if (keyAt(d, 33) !== mint) return null;
    let o = 65;
    const str = () => { const n = d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24); o += 4; const s = new TextDecoder().decode(d.slice(o, o + n)).replace(/\0/g, '').trim(); o += n; return s; };
    const name = str(), symbol = str();
    return { name, symbol: symbol.replace(/[^\x20-\x7e]/g, '').slice(0, 20) };
  } catch (e) { return null; }
}
const txKeys = tx => {   // every account of a transaction, lookup-table addresses included (parsed keys already carry them)
  const ks = tx.transaction.message.accountKeys;
  const keys = ks.map(k => (typeof k === 'string' ? k : k.pubkey));
  const la = tx.meta && tx.meta.loadedAddresses;
  if (la && !(ks[0] && typeof ks[0] === 'object' && 'source' in ks[0])) keys.push(...(la.writable || []), ...(la.readonly || []));
  return keys;
};
// the Meteora pool of this token that a transaction writes to (launch, swap or migration), plus the token's metadata when the transaction created it
async function poolFromTx(tx, mint, kinds) {
  const m = tx.meta || {};
  const tokenAccts = new Set([...(m.preTokenBalances || []), ...(m.postTokenBalances || [])].map(e => e.accountIndex));
  const all = tx.transaction.message.accountKeys;
  const cand = all.map((k, i) => ({ a: typeof k === 'string' ? k : k.pubkey, w: typeof k === 'string' ? true : k.writable, i }))
    .filter(k => k.w && !tokenAccts.has(k.i) && k.a !== mint && !POOL_AUTH.includes(k.a) && k.i !== 0)   // the payer is a wallet, not a pool
    .map(k => k.a).slice(0, 24);
  const accs = await accounts(cand);
  let pool = null, meta = null;
  cand.forEach((a, i) => {
    const p = readPool(a, accs[i], mint);
    if (p && kinds.includes(p.kind) && !pool) pool = p;
    if (accs[i] && accs[i].owner === METAPLEX && !meta) meta = readMeta(accs[i].d, mint);
  });
  return { pool, meta };
}

// one buy from a transaction: the pool's token vault goes down and its SOL vault goes up
// (sells, liquidity changes and fee claims move them some other way and are left out)
function decodeBuy(tx, sig, P, cfg) {
  const m = tx && tx.meta;
  if (!m || m.err) return null;
  const keys = txKeys(tx);
  const ti = keys.indexOf(P.tokVault), si = keys.indexOf(P.solVault);
  if (ti < 0 || si < 0) return null;
  const amt = (list, i) => { const e = (list || []).find(x => x.accountIndex === i); return e ? BigInt(e.uiTokenAmount.amount) : null; };
  const sPre = amt(m.preTokenBalances, si) || 0n, sPost = amt(m.postTokenBalances, si);
  const tPre = amt(m.preTokenBalances, ti), tPost = amt(m.postTokenBalances, ti);
  if (sPost === null || tPost === null) return null;
  const solIn = sPost - sPre;
  // what each wallet gained (or lost) of the token in this transaction, pool vaults left out
  const gain = {};
  for (const [list, sign] of [[m.postTokenBalances, 1n], [m.preTokenBalances, -1n]]) {
    for (const e of list || []) {
      if (e.mint !== cfg.token || POOL_AUTH.includes(e.owner) || e.accountIndex === ti) continue;
      gain[e.owner] = (gain[e.owner] || 0n) + sign * BigInt(e.uiTokenAmount.amount);
    }
  }
  // no vault balance before: the pool was created in this transaction (launch with a first buy)
  const tokOut = tPre === null ? Object.values(gain).reduce((a, v) => a + (v > 0n ? v : 0n), 0n) : tPre - tPost;
  if (solIn <= 0n || tokOut <= 0n) return null;
  // the same row as DexScreener shows for this pool: what went through this pool, made by the wallet that signed
  // (a routed swap shows only its part in this pool; arbitrage bots buying here show up too, like on DexScreener)
  const from = keys[0];
  const ev = swapEvent(tx, P);   // the pool's own swap record: amounts before fees, as DexScreener shows them
  const held = list => (list || []).filter(e => e.mint === cfg.token && e.owner === from).reduce((a, e) => a + BigInt(e.uiTokenAmount.amount), 0n);
  const before = held(m.preTokenBalances), after = held(m.postTokenBalances);
  return {
    tx: sig, tokens: units(ev ? ev.tok : tokOut, cfg.dec), quote: units(ev ? ev.sol : solIn, SOL_DEC), qsym: 'SOL', from,
    kept: after > before, newHolder: before === 0n && after > 0n, pos: before > 0n ? Number(after - before) / Number(before) * 100 : 0,
  };
}

// The buys a Meteora pool recorded in a transaction (its EvtSwap2 event, emitted as an inner instruction), summed:
// SOL without the fee when the fee is taken from the SOL paid, tokens with the fee when it is taken from the tokens.
// Those are the amounts DexScreener shows. null when the transaction carries no readable event (vault balances are used).
const EVT_SWAP2 = 'e445a52e51cb9a1dbd4233a826507599';
function swapEvent(tx, P) {
  const prog = P.kind === 'dbc' ? DBC.program : DAMM.program;
  let sol = 0n, tok = 0n, n = 0;
  for (const g of (tx.meta && tx.meta.innerInstructions) || []) {
    for (const ix of g.instructions || []) {
      if (ix.programId !== prog || !ix.data) continue;
      let d;
      try { d = unb58(ix.data); } catch (e) { continue; }
      if (d.length < 148 || hexOf(d.slice(0, 16)) !== EVT_SWAP2 || keyAt(d, 16) !== P.a) continue;
      let inc, exc, out, fee;
      if (P.kind === 'dbc') {   // pool, config, direction (1 = SOL to token), referral, params, result
        if (d.length < 171 || d[80] !== 1) continue;
        inc = u64At(d, 99); exc = u64At(d, 107); out = u64At(d, 123); fee = u64At(d, 147) + u64At(d, 155) + u64At(d, 163);
      } else {                  // pool, direction (0 = A to B), fee mode, referral, params, result
        if (d[48] !== (P.tokA ? 1 : 0)) continue;
        inc = u64At(d, 68); exc = u64At(d, 76); out = u64At(d, 92); fee = u64At(d, 116) + u64At(d, 124) + u64At(d, 132) + u64At(d, 140);
      }
      sol += exc; tok += inc > exc ? out : out + fee; n++;
    }
  }
  return n && sol > 0n && tok > 0n ? { sol, tok } : null;
}

const DS_HEADERS = { accept: 'application/json', 'user-agent': 'poof-bot/1.0 (+https://usepoof.chat)' };
// SOL in dollars: Coinbase, then Kraken, cached in the database so a bad minute still has numbers
let solMem = null;
async function solUsd(D) {
  if (solMem && Date.now() - solMem.t < 60000) return solMem.usd;
  let usd = 0;
  try { const r = await fetch('https://api.coinbase.com/v2/prices/SOL-USD/spot'); if (r.ok) usd = +JSON.parse(await r.text()).data.amount || 0; } catch (e) { /* next source */ }
  if (!usd) { try { const r = await fetch('https://api.kraken.com/0/public/Ticker?pair=SOLUSD'); if (r.ok) { const j = JSON.parse(await r.text()); const k = j.result && Object.values(j.result)[0]; usd = k ? +k.c[0] || 0 : 0; } } catch (e) { /* cache */ } }
  if (usd > 0) { solMem = { usd, t: Date.now() }; if (D) await kvSet(D, 'px:solusd', solMem); return usd; }
  const c = D ? await kvGet(D, 'px:solusd') : null;
  return c && Date.now() - c.t < 3600e3 ? c.usd : 0;
}
// price and MCap from the pool itself (no waiting for DexScreener at launch)
async function priceOf(cfg, D) {
  const usd = await solUsd(D);
  let px = 0;
  if (cfg.pool) { try { const [acc] = await accounts([cfg.pool.a]); px = spotSol(cfg.pool, acc, cfg.dec); } catch (e) { /* fallback below */ } }
  return { solUsd: usd, priceSol: px, mcap: px * usd * (cfg.supply || 1e9) };
}
async function sendGraduation(env, D, chatId, cfg) {
  const ids = cfg.emoji ? await emojiIds(env, D) : null, E = emojiFn(ids);
  const sym = esc(cfg.sym || 'TOKEN');
  const caption = `${E(EM.mark, '🟧')} <b>$${sym} graduated</b>\n\n${E(EM.foxGaze, '🦊')} The bonding curve is full. $${sym} now trades on Meteora DAMM v2 and the buy alerts continue from the new pool.`;
  const media = mediaMem.bigpoof || (IMG + 'buybot/bigpoof.mp4');
  let r = await tgWait(env, 'sendAnimation', { chat_id: chatId, animation: media, caption, parse_mode: 'HTML', reply_markup: buyButtons(cfg, ids) });
  if (!r.ok) r = await tgWait(env, 'sendMessage', { chat_id: chatId, text: caption, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: buyButtons(cfg, null) });
  return r;
}

// ---------- formatting ----------
function fmtCompact(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e4) return Math.round(n).toLocaleString('en-US');
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return n.toPrecision(3);
}
const fmtUsd = n => '$' + (n >= 1e6 ? fmtCompact(n) : n >= 1 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2));
const fmtAmt = n => n >= 100 ? Math.round(n).toLocaleString('en-US') : n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(3) : n.toPrecision(2);
// a trade written the way DexScreener writes its rows (cut, not rounded): SOL with 2 decimals, or 4 significant digits
// under 1; dollars with cents; tokens whole from 10,000, with 2 decimals under that
const cutTo = (n, d) => Math.floor(n * 10 ** d + 1e-9) / 10 ** d;
const sig4 = n => { if (!(n > 0)) return '0'; const d = Math.max(0, 3 - Math.floor(Math.log10(n))); return cutTo(n, d).toFixed(d); };
const dec2 = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSolDs = n => (n >= 1 ? dec2(cutTo(n, 2)) : sig4(n));
const fmtUsdDs = n => '$' + dec2(n);
const fmtTokDs = n => (n >= 10000 ? Math.floor(n).toLocaleString('en-US') : n >= 1 ? dec2(cutTo(n, 2)) : sig4(n));
const fmtPct = n => (n >= 1000 ? Math.round(n).toLocaleString('en-US') : n >= 10 ? Math.round(n) : n.toFixed(1)) + '%';
const shortAddr = a => a.slice(0, 6) + '…' + a.slice(-4);
const quoteName = s => /^W?SOL$/i.test(s || '') ? 'SOL' : (s || '');

let emojiMem = null;
async function emojiIds(env, D) {
  if (emojiMem && Date.now() - emojiMem.t < 600000) return emojiMem.ids;
  const c = await kvGet(D, 'emoji');
  if (c) emojiMem = { t: Date.now(), ids: c.ids };
  if (c && Date.now() - c.t < 6 * 3600e3) return c.ids;
  const r = await tg(env, 'getStickerSet', { name: EMOJI_SET });
  const ids = r.ok ? r.result.stickers.map(s => s.custom_emoji_id) : (c ? c.ids : null);
  await kvSet(D, 'emoji', { t: Date.now(), ids });
  return ids;
}
const emojiFn = ids => (i, fallback) => (ids && ids[i]) ? `<tg-emoji emoji-id="${ids[i]}">${fallback}</tg-emoji>` : fallback;

const tierLimits = (cfg, mcap) => Array.isArray(cfg.tiers) ? cfg.tiers : (mcap ? MCAP_PCT.map((p, i) => Math.max(mcap * p / 100, FIXED_TIERS[i])) : FIXED_TIERS);
function tierFor(cfg, usd, mcap) {
  const t = tierLimits(cfg, mcap);
  const i = usd >= t[2] ? 3 : usd >= t[1] ? 2 : usd >= t[0] ? 1 : 0;
  return Object.assign({ i }, TIERS[i]);
}
// row of emoji that grows with the square root of the buy: plenty for small and mid buys, full (60) at twice the Big poof start; the emoji changes with the tier
const ROW_EM = [EM.mark, EM.coinInk, EM.poof, EM.foxDollar];
const ROW_MAX = 60;
function buyRow(cfg, usd, mcap, tier, E) {
  const full = Math.max(tierLimits(cfg, mcap)[2] * 2, 1);
  const n = Math.max(1, Math.min(ROW_MAX, Math.round(ROW_MAX * Math.sqrt(usd / full))));
  return E(ROW_EM[tier.i], '🟧').repeat(n);
}

function buyCaption(cfg, b, tier, mcap, E, test, rest = []) {
  const ex = SOLANA.explorer;
  const sym = esc(cfg.sym || 'TOKEN');
  let s = `${E(EM.mark, '🟧')} <b>$${sym} buy</b> · ${tier.name}${test ? ' <i>(test)</i>' : ''}\n\n`;
  s += buyRow(cfg, b.usd, mcap, tier, E) + '\n\n';
  s += `${E(EM.foxDollar, '💸')} <b>${fmtSolDs(b.quote)} ${esc(quoteName(b.qsym))}</b> (${fmtUsdDs(b.usd)})\n`;
  s += `${E(EM.coinInk, '🪙')} <b>${fmtTokDs(b.tokens)} ${sym}</b> · <a href="${ex}/tx/${b.tx}">Tx</a>\n`;
  if (b.from) s += `${E(EM.foxHi, '👤')} <a href="${ex}/account/${b.from}">${shortAddr(b.from)}</a>${b.kept === false ? '' : ' · ' + (b.newHolder ? 'New holder' : 'Position +' + fmtPct(b.pos))}\n`;
  if (mcap) s += `${E(EM.coinStone, '📊')} MCap ${fmtUsd(mcap)}${cfg.pool && cfg.pool.kind === 'dbc' ? ' · bonding curve' : ''}\n`;
  if (rest.length) {
    const sum = rest.reduce((a, x) => a + x.usd, 0);
    s += `\n<b>+${rest.length} more ${rest.length === 1 ? 'buy' : 'buys'}</b> · ${fmtUsd(sum)}\n`;
    for (const x of rest.slice(0, MAX_LIST)) {
      s += `${E(ROW_EM[tierFor(cfg, x.usd, mcap).i], '🟧')} ${fmtSolDs(x.quote)} ${esc(quoteName(x.qsym))} (${fmtUsdDs(x.usd)}) · <a href="${ex}/tx/${x.tx}">Tx</a>\n`;
    }
    if (rest.length > MAX_LIST) s += `<i>and ${rest.length - MAX_LIST} more</i>\n`;
  }
  if (cfg.ttl > 0) s += tier.key === 'bigpoof' ? `\n${E(EM.foxGaze, '🦊')} <i>big poofs stay</i>` : `\n${E(EM.poof, '💨')} <i>poofs in ${cfg.ttl} min</i>`;
  return s;
}

function buyButtons(cfg, ids) {
  const chart = { text: 'Chart', url: `https://dexscreener.com/solana/${cfg.token}` };
  const buy = { text: 'Buy', url: `https://jup.ag/swap/SOL-${cfg.token}` };
  const site = { text: 'usepoof.chat', url: SITE };
  if (ids) {
    if (ids[EM.coinStone]) chart.icon_custom_emoji_id = ids[EM.coinStone];
    if (ids[EM.foxDollar] || ids[EM.coinRust]) buy.icon_custom_emoji_id = ids[EM.foxDollar] || ids[EM.coinRust];
    if (ids[EM.mark]) site.icon_custom_emoji_id = ids[EM.mark];
  }
  return { inline_keyboard: [[chart, buy, site]] };
}

// sends one alert; falls back to plain emoji, then to text, if Telegram refuses something
const mediaMem = {};
async function tgWait(env, method, body) {
  let r = await tg(env, method, body);
  const wait = r && r.error_code === 429 ? ((r.parameters && r.parameters.retry_after) || 3) : 0;
  if (wait && wait <= 10) { await sleep(wait * 1000 + 250); r = await tg(env, method, body); }
  return r;
}
async function sendBuy(env, D, chatId, cfg, b, mcap, test, rest = []) {
  const tier = tierFor(cfg, b.usd, mcap);
  const ids = cfg.emoji ? await emojiIds(env, D) : null;
  const cached = mediaMem[tier.key] || (mediaMem[tier.key] = await kvGet(D, 'media:' + tier.key));
  const media = cached || (IMG + 'buybot/' + tier.key + '.mp4');
  const attempt = async (useIds, withMedia) => {
    const caption = buyCaption(cfg, b, tier, mcap, emojiFn(useIds), test, rest);
    const reply_markup = buyButtons(cfg, useIds);
    return withMedia
      ? tgWait(env, 'sendAnimation', { chat_id: chatId, animation: media, caption, parse_mode: 'HTML', reply_markup })
      : tgWait(env, 'sendMessage', { chat_id: chatId, text: caption, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup });
  };
  let r = await attempt(ids, true);
  // the group was upgraded to a supergroup: follow it to its new id
  const moved = r && !r.ok && r.parameters && r.parameters.migrate_to_chat_id;
  if (moved) {
    await D.prepare('UPDATE bb_chats SET chat_id = ? WHERE chat_id = ?').bind(String(moved), String(chatId)).run();
    chatId = moved;
    r = await attempt(ids, true);
  }
  if (!r.ok && r.error_code !== 429 && ids) r = await attempt(null, true);
  if (!r.ok && r.error_code !== 429) r = await attempt(null, false);
  if (r.ok) {
    if (!cached && r.result.animation) await kvSet(D, 'media:' + tier.key, r.result.animation.file_id);
    if (cfg.ttl > 0 && tier.key !== 'bigpoof') {
      await D.prepare('INSERT INTO bb_pending (chat_id, msg_id, expires) VALUES (?, ?, ?)').bind(String(chatId), r.result.message_id, Date.now() + cfg.ttl * 60000).run();
    }
  }
  return r;
}


// ---------- polling ----------
const missMem = {};   // checks in a row where a transaction was listed but not readable yet
const gradMem = {};   // safety check for a graduation the live check did not see
const vaultMem = {};  // pool vault balances at the last check, per chat
const afterMem = {};  // pool vault balances left by the last transaction read, per chat
const gapMem = {};    // checks in a row that stopped at a gap in the vault balances, per chat
// a transaction's pool vault balances before and after it, as 'pool:token:sol' strings (null when it does not carry them)
function vaultsOf(tx, P) {
  const m = tx && tx.meta;
  if (!m) return null;
  const keys = txKeys(tx), ti = keys.indexOf(P.tokVault), si = keys.indexOf(P.solVault);
  if (ti < 0 || si < 0) return null;
  const at = (list, i) => { const e = (list || []).find(x => x.accountIndex === i); return e ? e.uiTokenAmount.amount : null; };
  const pt = at(m.postTokenBalances, ti), ps = at(m.postTokenBalances, si);
  if (pt === null || ps === null) return null;
  const bt = at(m.preTokenBalances, ti), bs = at(m.preTokenBalances, si);
  return { pre: bt !== null && bs !== null ? P.a + ':' + bt + ':' + bs : null, post: P.a + ':' + pt + ':' + ps };
}
const setCursor = (D, row, sig) => { row.last_block = sig; return D.prepare('UPDATE bb_chats SET last_block = ? WHERE chat_id = ?').bind(sig, row.chat_id).run(); };

async function pollChat(env, D, row) {
  const cfg = Object.assign({}, BB_DEFAULT, JSON.parse(row.cfg));
  if (!cfg.enabled || cfg.chain !== 'solana') return;   // an older Robinhood setup stays quiet until /buybot set
  if (!cfg.pool) return armCheck(env, D, row, cfg);
  const P = cfg.pool;
  // trading bots also list the pool in many transactions that trade nothing: read the transactions only when the vaults moved.
  // The newest transaction is listed first, then the vaults are read: when they did not move and were read at or after
  // that transaction's slot, nothing up to it traded, so the cursor skips ahead past the bots' empty transactions.
  // (The RPC answers can come from servers a few slots apart: without the slot check a fresh trade could be skipped.)
  const head = row.last_block ? await signatures(P.a, { limit: 1 }) : null;
  const vs = await vaultState(P);
  const vslot = accSlot;
  if (vs && vaultMem[row.chat_id] === vs) {
    const h = Array.isArray(head) && head[0];
    if (h && h.signature !== row.last_block && h.slot && vslot >= h.slot) await setCursor(D, row, h.signature);
    if (P.kind === 'dbc') await gradSafety(env, D, row, cfg);
    return;
  }
  let sigs = await signatures(P.a, Object.assign({ limit: 100 }, row.last_block ? { until: String(row.last_block) } : {}));
  if (!Array.isArray(sigs)) { console.log('buybot signatures failed', rpcLastError); return; }
  for (let p = 0; row.last_block && p < 4 && sigs.length && sigs.length % 100 === 0; p++) {   // more than one page since the cursor
    const more = await signatures(P.a, { limit: 100, until: String(row.last_block), before: sigs[sigs.length - 1].signature });
    if (!Array.isArray(more) || !more.length) break;
    sigs = sigs.concat(more);
  }
  if (!sigs.length) { if (vs && afterMem[row.chat_id] === vs) vaultMem[row.chat_id] = vs; return; }   // nothing new listed: in sync, or the trade is not listed yet
  // oldest first, at most MAX_TX per check: a rush is read over the next checks, nothing is skipped
  const ok = [];
  let upto = null;
  for (const s of sigs.slice().reverse()) {
    if (!s.err) { if (ok.length === MAX_TX) break; ok.push(s); }
    upto = s.signature;
  }
  const txs = ok.length ? await rpc(ok.map(s => ['getTransaction', [s.signature, TX_OPTS]])) : [];
  if (txs.some(t => !t)) {   // listed but not readable yet on this node: try again, at most 3 times
    missMem[row.chat_id] = (missMem[row.chat_id] || 0) + 1;
    if (missMem[row.chat_id] < 3) return;
    console.log('buybot transactions not readable', txs.filter(t => !t).length, 'of', txs.length, rpcLastError);
  }
  // Read in order, following the vault balances from one transaction to the next (the trading bots' empty transactions
  // carry them too). A transaction that starts from other balances than the last one left means a trade in between is
  // not listed yet (RPC servers a few slots apart): stop before it and read on from there at the next check.
  // Within one slot the list order is not always the run order, so a slot is matched up by its balances.
  let after0 = afterMem[row.chat_id] || null;
  if (after0 && !after0.startsWith(P.a + ':')) after0 = null;   // a new pool (graduation, new token): nothing to follow yet
  const V = txs.map(t => vaultsOf(t, P));
  const slotOf = i => (txs[i] && txs[i].slot) || 0;
  const chain = n => {
    let a = after0;
    const rem = [], seen = new Set();
    for (let i = 0; i < n; i++) rem.push(i);
    while (rem.length) {
      const s = Math.min(...rem.map(slotOf));
      const pick = rem.find(i => slotOf(i) === s && (!V[i] || !V[i].pre || !a || V[i].pre === a));
      if (pick === undefined) break;
      seen.add(pick);
      if (V[pick]) a = V[pick].post;
      rem.splice(rem.indexOf(pick), 1);
    }
    return { a, seen };
  };
  const all = ok.length;
  let k = all, after;
  for (;;) {   // the longest start of the list that follows on without a gap
    const r = chain(k);
    let j = 0;
    while (j < k && r.seen.has(j)) j++;
    if (j === k) { after = r.a; break; }
    k = j;
  }
  if (k < all && (gapMem[row.chat_id] || 0) < 5) {
    gapMem[row.chat_id] = (gapMem[row.chat_id] || 0) + 1;
    ok.length = k; txs.length = k;
    upto = k ? ok[k - 1].signature : null;
    if (!upto) return;
  } else {
    if (k < all) { after = V.reduce((a, v) => (v ? v.post : a), after); k = -1; }   // still a gap after 5 checks: go on
    gapMem[row.chat_id] = 0;
  }
  const newest = upto;
  // the vaults count as seen only when everything listed was read and the last transaction left them as they are now
  const synced = vs && k === all && upto === sigs[0].signature && after === vs;
  const done = async sig => { await setCursor(D, row, sig); if (after) afterMem[row.chat_id] = after; if (synced) vaultMem[row.chat_id] = vs; else delete vaultMem[row.chat_id]; };
  missMem[row.chat_id] = 0;

  const buys = [];
  let grad = null;
  for (let i = 0; i < ok.length; i++) {
    const tx = txs[i];
    if (!tx) continue;
    if (P.kind === 'dbc' && ((tx.meta && tx.meta.logMessages) || []).includes(MIGRATION_LOG)) { grad = { sig: ok[i].signature, tx }; break; }
    const b = decodeBuy(tx, ok[i].signature, P, cfg);
    if (b) buys.push(b);
  }
  // graduated: the new DAMM v2 pool is created in the migration transaction
  if (grad) {
    const f = await poolFromTx(grad.tx, cfg.token, ['damm']);
    if (f.pool) { await graduate(env, D, row, cfg, f.pool, grad.sig, buys); return; }
    console.log('buybot migration seen, DAMM v2 pool not found', grad.sig);   // the safety check finds it later
  }
  if (!buys.length) { await done(newest); return; }
  await postBuys(env, D, row, cfg, buys, () => done(newest));
}

// waiting for launch: watch the token's own transactions until one of them writes to its Meteora pool
async function armCheck(env, D, row, cfg) {
  const sigs = await signatures(cfg.token, Object.assign({ limit: 25 }, row.last_block ? { until: String(row.last_block) } : {}));
  if (!Array.isArray(sigs) || !sigs.length) return;
  const ok = sigs.filter(s => !s.err).reverse().slice(0, 4);   // oldest first: the launch transaction comes first
  for (const s of ok) {
    const [tx] = await rpc([['getTransaction', [s.signature, TX_OPTS]]]);
    if (!tx) return;   // not readable yet: next check
    const f = await poolFromTx(tx, cfg.token, ['dbc', 'damm']);
    if (!f.pool) continue;
    const info = await tokenInfo(cfg.token).catch(() => null);
    const sym = (f.meta && f.meta.symbol) || (info && info.sym) || (await assetSymbol(cfg.token)) || cfg.sym || 'TOKEN';
    const next = Object.assign({}, cfg, { pool: f.pool, sym }, info ? { dec: info.dec, supply: info.supply } : {});
    delete next.arm;
    // read the pool from its first transaction on, so the launch buys are posted too
    row.cfg = JSON.stringify(next);
    await saveChatCfg(D, row.chat_id, next, null);
    row.last_block = null;
    return;
  }
  await setCursor(D, row, sigs[0].signature);
}

// moves the alerts to the DAMM v2 pool: curve buys first, then the graduation alert
async function graduate(env, D, row, cfg, pool, fromSig, curveBuys) {
  const next = Object.assign({}, cfg, { pool });
  row.cfg = JSON.stringify(next);
  let cursor = fromSig;   // the DAMM v2 pool is read from the migration on
  if (!cursor) { const s = await signatures(pool.a, { limit: 1 }); cursor = Array.isArray(s) && s[0] ? s[0].signature : null; }
  await saveChatCfg(D, row.chat_id, next, cursor);
  row.last_block = cursor;
  if (curveBuys && curveBuys.length) await postBuys(env, D, row, cfg, curveBuys, null);
  await sendGraduation(env, D, row.chat_id, next);
}
async function gradSafety(env, D, row, cfg) {
  const g = gradMem[row.chat_id] || (gradMem[row.chat_id] = { t: 0, since: 0 });
  if (Date.now() - g.t < (g.since ? 60000 : GRAD_RECHECK)) return;
  g.t = Date.now();
  const [acc] = await accounts([cfg.pool.a]);
  const p = readPool(cfg.pool.a, acc, cfg.token);
  if (!p || !p.migrated) { g.since = 0; return; }
  if (!g.since) { g.since = Date.now(); return; }   // give the live check a minute to see the migration itself
  // missed: find the migration among the curve's latest transactions, else ask DexScreener
  const sigs = await signatures(cfg.pool.a, { limit: 15 });
  for (const s of (Array.isArray(sigs) ? sigs : []).filter(x => !x.err)) {
    const [tx] = await rpc([['getTransaction', [s.signature, TX_OPTS]]]);
    if (!tx || !((tx.meta && tx.meta.logMessages) || []).includes(MIGRATION_LOG)) continue;
    const f = await poolFromTx(tx, cfg.token, ['damm']);
    if (f.pool) { delete gradMem[row.chat_id]; await graduate(env, D, row, cfg, f.pool, null, []); return; }
  }
  const pool = await dexDammPool(cfg.token);
  if (pool) { delete gradMem[row.chat_id]; await graduate(env, D, row, cfg, pool, null, []); }
}

// prices the buys, keeps those above the minimum and posts one alert (the biggest buy, with the others listed under it)
async function postBuys(env, D, row, cfg, buys, advance) {
  const px = await priceOf(cfg, D);
  if (!px.solUsd) return;   // no SOL price yet: keep these transactions for the next check
  if (advance) await advance();
  let mcap = px.mcap;
  if (!mcap) { const l = buys[buys.length - 1]; mcap = l.tokens ? (l.quote / l.tokens) * px.solUsd * (cfg.supply || 1e9) : 0; }   // pool not readable: last trade price
  for (const b of buys) b.usd = b.quote * px.solUsd;
  buys = buys.filter(b => b.usd >= cfg.minUsd).sort((a, b) => b.usd - a.usd);
  // the live stream and the poller both see each buy: whoever posts it first claims it
  const mine = [];
  for (const b of buys) {
    const r = await D.prepare('INSERT OR IGNORE INTO bb_posted (chat_id, sig, t) VALUES (?, ?, ?)').bind(String(row.chat_id), b.tx, Date.now()).run();
    if (r.meta && r.meta.changes) mine.push(b);
  }
  if (!mine.length) return;
  await sendSlot(D, row.chat_id);
  // one alert at a time: the biggest buy gets the full alert, the others are listed under it
  await sendBuy(env, D, row.chat_id, cfg, mine[0], mcap, false, mine.slice(1));
}
// at most one alert per POLL_MS per group, shared by the live stream and the poller (Telegram allows 20 a minute)
async function sendSlot(D, chatId) {
  const k = 'sent:' + chatId;
  for (let i = 0; i < 30; i++) {
    const now = Date.now();
    const r = await D.prepare("INSERT INTO bb_kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v WHERE CAST(bb_kv.v AS INTEGER) <= ?")
      .bind(k, String(now), now - POLL_MS).run();
    if (r.meta && r.meta.changes) return;
    await sleep(400);
  }
}

async function deleteExpired(env, D) {
  const due = await D.prepare('SELECT rowid AS id, chat_id, msg_id FROM bb_pending WHERE expires <= ? LIMIT 25').bind(Date.now()).all();
  for (const r of due.results) await tg(env, 'deleteMessage', { chat_id: r.chat_id, message_id: r.msg_id });
  if (due.results.length) await D.prepare(`DELETE FROM bb_pending WHERE rowid IN (${due.results.map(r => r.id).join(',')})`).run();
  await D.prepare('DELETE FROM bb_posted WHERE t < ?').bind(Date.now() - 6 * 3600000).run();
}
const kvNum = async (D, k) => { const r = await D.prepare('SELECT v FROM bb_kv WHERE k = ?').bind(k).first(); return r ? Number(r.v) || 0 : 0; };
const kvPut = (D, k, v) => D.prepare('INSERT INTO bb_kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v)).run();
async function takeLock(D) {
  const now = Date.now();
  const r = await D.prepare("INSERT INTO bb_kv (k, v) VALUES ('lock', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v WHERE CAST(bb_kv.v AS INTEGER) < ?")
    .bind(String(now + LEASE_MS), now).run();
  return !!(r.meta && r.meta.changes);
}
// One run at a time checks every POLL_MS (loopMs = 0: a single check). Scheduled runs start every minute:
// while a run is checking, the new ones stop at once; near the end of its 5 min the next run waits and takes over.
async function runBuyBot(env, loopMs = LOOP_MS) {
  rpcOverride = (env.SOLANA_RPC_URL || '').trim() || null;
  const D = await bbDb(env);
  const start = Date.now();
  if (!(await takeLock(D))) {
    if (!loopMs) return false;
    if (start - (await kvNum(D, 'lock_start')) < loopMs - HANDOFF_MS) return false;   // the running check keeps going
    await kvPut(D, 'lock_want', start);
    let got = false;
    while (!got && Date.now() - start < 50000) { await sleep(1000); got = await takeLock(D); }
    if (!got) return false;
  }
  const mine = Date.now();
  await kvPut(D, 'lock_start', mine);
  try {
    let rows = [];
    for (let tick = 0; ; tick++) {
      const t0 = Date.now();
      if (tick % 5 === 0) { const ok = await allowedChats(env); rows = (await D.prepare('SELECT chat_id, cfg, last_block FROM bb_chats').all()).results.filter(x => ok.has(String(x.chat_id))); }   // settings changes count within 15 s; official chats only
      if (tick % 5 === 0) await deleteExpired(env, D);
      for (const row of rows) {
        try { await pollChat(env, D, row); } catch (e) { console.log('buybot', row.chat_id, e && e.message); }
      }
      if (t0 + POLL_MS > mine + loopMs) break;
      if (t0 - mine > loopMs - HANDOFF_MS && (await kvNum(D, 'lock_want')) > mine) break;   // the next run is waiting: hand over
      await D.prepare("UPDATE bb_kv SET v = ? WHERE k = 'lock'").bind(String(Date.now() + LEASE_MS)).run();
      await sleep(Math.max(0, t0 + POLL_MS - Date.now()));
    }
  } finally {
    await D.prepare("UPDATE bb_kv SET v = '0' WHERE k = 'lock'").run();
  }
  return true;
}

// ---------- /buybot command (admins) ----------
async function dsJson(url, tries = 3) {   // DexScreener sometimes refuses a request: try again a second later
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: DS_HEADERS }); if (r.ok) return JSON.parse(await r.text()); } catch (e) { /* retry */ }
    if (i < tries - 1) await sleep(1000);
  }
  return null;
}
// Meteora pools of the token listed on DexScreener (bonding curve and DAMM v2), checked on chain; biggest liquidity first
async function dexPools(mint) {
  const j = await dsJson(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
  const pairs = ((j && j.pairs) || []).filter(p => p.chainId === 'solana' && p.baseToken && p.baseToken.address === mint);
  const cand = pairs.filter(p => p.dexId === 'meteoradbc' || (p.dexId === 'meteora' && (p.labels || []).includes('DYN2')))
    .sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0)).slice(0, 4);
  const accs = await accounts(cand.map(p => p.pairAddress));
  return { sym: pairs[0] && pairs[0].baseToken.symbol, pools: cand.map((p, i) => readPool(p.pairAddress, accs[i], mint)).filter(Boolean) };
}
async function dexDammPool(mint) {
  try { const p = (await dexPools(mint)).pools.find(x => x.kind === 'damm'); if (p) return p; } catch (e) { /* ask the chain */ }
  return (await chainPools(mint)).find(p => p.kind === 'damm') || null;
}
// Meteora pools of the token read straight from the chain (DexScreener often refuses the Worker):
// the bonding curve first, then the DAMM v2 pools paired with SOL, the one holding the most SOL first
async function chainPools(mint) {
  const keysOf = async (program, filters) => {
    try {
      const [r] = await rpc([['getProgramAccounts', [program, { encoding: 'base64', commitment: 'confirmed', dataSlice: { offset: 0, length: 0 }, filters }]]]);
      return Array.isArray(r) ? r.map(x => x.pubkey).slice(0, 8) : [];
    } catch (e) { return []; }
  };
  const at = (offset, bytes) => ({ memcmp: { offset, bytes } });
  const list = [
    ...(await keysOf(DBC.program, [at(DBC.mint, mint)])),
    ...(await keysOf(DAMM.program, [at(DAMM.mintA, mint), at(DAMM.mintB, WSOL)])),
    ...(await keysOf(DAMM.program, [at(DAMM.mintA, WSOL), at(DAMM.mintB, mint)])),
  ];
  if (!list.length) return [];
  const accs = await accounts(list);
  const pools = list.map((a, i) => readPool(a, accs[i], mint)).filter(Boolean);
  const vaults = await accounts(pools.map(p => p.solVault));
  const sol = v => { if (!v || v.d.length < 72) return 0n; let n = 0n; for (let i = 7; i >= 0; i--) n = n * 256n + BigInt(v.d[64 + i]); return n; };
  const rank = p => (p.kind === 'dbc' && !p.migrated ? 2 : p.kind === 'damm' ? 1 : 0);
  return pools.map((p, i) => ({ p, s: sol(vaults[i]) }))
    .sort((a, b) => rank(b.p) - rank(a.p) || (b.s > a.s ? 1 : b.s < a.s ? -1 : 0)).map(x => x.p);
}
async function setupToken(cfgOld, mint, poolArg) {
  const keep = {};
  for (const k of BB_SETTINGS) if (cfgOld && cfgOld[k] !== undefined) keep[k] = cfgOld[k];
  const info = await tokenInfo(mint);
  let pool = null, sym = null;
  if (poolArg) {
    const [acc] = await accounts([poolArg]);
    pool = readPool(poolArg, acc, mint);
    if (!pool) return { error: 'That pool is not a Meteora bonding curve (DBC) or DAMM v2 pool of this token paired with SOL.' };
  } else if (info) {
    const ds = await dexPools(mint).catch(() => ({ pools: [] }));
    sym = ds.sym || null;
    pool = ds.pools.find(p => p.kind === 'dbc' && !p.migrated) || ds.pools.find(p => p.kind === 'damm') || null;
    if (!pool) {   // DexScreener did not answer: read the pools from the chain
      const cp = await chainPools(mint);
      pool = cp.find(p => p.kind === 'dbc' && !p.migrated) || cp.find(p => p.kind === 'damm') || null;
    }
    if (!pool) {   // not found yet: look at the token's latest transactions
      const sigs = await signatures(mint, { limit: 10 });
      for (const s of (Array.isArray(sigs) ? sigs : []).filter(x => !x.err).slice(0, 6)) {
        const [tx] = await rpc([['getTransaction', [s.signature, TX_OPTS]]]);
        if (!tx) continue;
        const f = await poolFromTx(tx, mint, ['dbc', 'damm']);
        if (f.meta && f.meta.symbol) sym = sym || f.meta.symbol;
        if (f.pool && !(f.pool.kind === 'dbc' && f.pool.migrated)) { pool = f.pool; break; }
      }
    }
  }
  if (pool && pool.kind === 'dbc' && pool.migrated) return { error: 'This token already left its bonding curve, but its DAMM v2 pool was not found. Add it by hand: /buybot set &lt;mint&gt; &lt;pool&gt;' };
  if (pool) {   // only SOL pairs
    const [v] = await rpc([['getAccountInfo', [pool.solVault, { encoding: 'jsonParsed', commitment: 'confirmed' }]]]);
    const vm = v && v.value && v.value.data && v.value.data.parsed && v.value.data.parsed.info && v.value.data.parsed.info.mint;
    if (vm !== WSOL) return { error: 'Only pools paired with SOL are supported.' };
  }
  if (info && !pool) return { error: 'No Meteora bonding curve or DAMM v2 pool found for this token on Solana yet. If it just launched or graduated, try again in a minute.' };
  if (pool && !sym) sym = (info && info.sym) || (await assetSymbol(mint)) || null;   // DexScreener did not answer: ask the chain
  const sameToken = cfgOld && cfgOld.token === mint;
  const cfg = Object.assign({}, BB_DEFAULT, keep, {
    chain: 'solana', token: mint, sym: sym || (sameToken && cfgOld.sym) || 'TOKEN',
    dec: info ? info.dec : 6, supply: info ? info.supply : 1e9, pool, enabled: true,
  });
  if (!pool) cfg.arm = true;   // the token does not exist yet: alerts start with its launch
  return { cfg };
}

function bbStatus(cfg) {
  if (!cfg) return '<b>Poof buy bot</b>\nNot set up in this chat yet.\n\n' + BB_HELP;
  if (cfg.chain !== 'solana') return '<b>Poof buy bot</b>\nThe buy bot runs on Solana now. Set the token again with /buybot set &lt;mint&gt;.\n\n' + BB_HELP;
  const tiers = Array.isArray(cfg.tiers) ? cfg.tiers.map(fmtUsd).join(' / ') : 'auto (' + MCAP_PCT.join('% / ') + '% of MCap, at least ' + FIXED_TIERS.map(fmtUsd).join(' / ') + ')';
  const where = !cfg.pool
    ? 'Waiting for launch: alerts start by themselves with the first trade on Meteora. The address stays hidden here until then.\n'
    : `Pool: ${cfg.pool.kind === 'dbc' ? 'Meteora bonding curve' : 'Meteora DAMM v2'} (SOL)\n<code>${cfg.pool.a}</code>\n`
      + (cfg.pool.kind === 'dbc' ? 'When the curve fills, alerts move to Meteora DAMM v2 by themselves.\n' : '');
  return `<b>Poof buy bot</b> · ${cfg.enabled ? 'on' : 'off'}\n\n`
    + (cfg.pool ? `Token: <b>$${esc(cfg.sym || 'TOKEN')}</b> on Solana\n<code>${cfg.token}</code>\n` : 'Token: on Solana\n')
    + where
    + `Min buy: ${fmtUsd(cfg.minUsd)} · Alerts poof after: ${cfg.ttl ? cfg.ttl + ' min' : 'never'}\n`
    + `Tiers: ${tiers}\nCustom emoji: ${cfg.emoji ? 'on' : 'off'}\n\n` + BB_HELP;
}
const BB_HELP = '<b>Commands</b>\n'
  + '/buybot set &lt;mint&gt; [pool] - track this Solana token here (Meteora bonding curve, then DAMM v2)\n'
  + '/buybot on | off\n'
  + '/buybot min 25 - smallest buy shown, in $\n'
  + '/buybot ttl 10 - minutes before small alerts poof (0 = keep)\n'
  + '/buybot tiers auto | 100 500 2000 - where Puff, Poof, Big poof start\n'
  + '/buybot emoji on | off\n'
  + '/buybot test - post sample alerts\n'
  + '/buybot remove';

async function handleBuybot(env, msg, text) {
  rpcOverride = (env.SOLANA_RPC_URL || '').trim() || null;
  if (!(await isAdmin(env, msg))) { await reply(env, msg, (msg.chat.type === 'private' || await isOfficial(env, msg.chat.id)) ? 'Only admins can set up the buy bot.' : 'Filters and the buy bot only work in official Poof groups.'); return; }
  if (msg.chat.type === 'private' && !/^\/buybot\s+(poll)\b/i.test(text)) { await reply(env, msg, 'Use /buybot inside the group where the alerts should go.'); return; }
  let D;
  try { D = await bbDb(env); } catch (e) { await reply(env, msg, e.message); return; }
  const args = text.trim().split(/\s+/).slice(1);
  const sub = (args[0] || '').toLowerCase();
  const cur = await getChatCfg(D, msg.chat.id);
  const cfg = cur ? Object.assign({}, BB_DEFAULT, cur.cfg) : null;
  const need = async () => { if (!cfg || cfg.chain !== 'solana') { await reply(env, msg, 'Set a token first: /buybot set &lt;mint&gt;'); return false; } return true; };

  if (!sub) { await reply(env, msg, bbStatus(cfg)); return; }

  if (sub === 'set') {
    const mint = args[1] || '';
    const poolArg = args.slice(2).find(isAddr) || null;
    if (!isAddr(mint)) { await reply(env, msg, 'Use: /buybot set &lt;mint&gt; (Solana token address)'); return; }
    let res, cursor = null;
    try {
      res = await setupToken(cfg, mint, poolArg);
      if (!res.error) {
        // start from now: no old buys (while waiting for launch, from the token's newest transaction)
        const s = await signatures(res.cfg.pool ? res.cfg.pool.a : mint, { limit: 1 });
        if (!Array.isArray(s)) throw new Error('no answer');
        cursor = s[0] ? s[0].signature : null;
      }
    } catch (e) { await reply(env, msg, 'Could not reach Solana right now. Try again in a minute.'); return; }
    if (res.error) { await reply(env, msg, res.error); return; }
    await saveChatCfg(D, msg.chat.id, res.cfg, cursor);
    await reply(env, msg, (res.cfg.pool ? 'Buy bot is tracking this token now.' : 'Buy bot is armed. Alerts start by themselves with the launch.') + '\n\n' + bbStatus(res.cfg));
    return;
  }
  if (sub === 'remove') { await D.prepare('DELETE FROM bb_chats WHERE chat_id = ?').bind(String(msg.chat.id)).run(); await reply(env, msg, 'Buy bot removed from this chat.'); return; }
  if (sub === 'poll' && msg.from && msg.from.id === OWNER_ID) { const ran = await runBuyBot(env, 0); await reply(env, msg, ran ? 'Checked for new buys.' : 'The live check is already running.'); return; }
  if (!(await need())) return;

  if (sub === 'on' || sub === 'off') cfg.enabled = sub === 'on';
  else if (sub === 'min' && !isNaN(+args[1])) cfg.minUsd = Math.max(0, +args[1]);
  else if (sub === 'ttl' && !isNaN(+args[1])) cfg.ttl = Math.max(0, Math.min(2880, Math.round(+args[1])));
  else if (sub === 'emoji' && /^(on|off)$/i.test(args[1] || '')) cfg.emoji = args[1].toLowerCase() === 'on';
  else if (sub === 'tiers' && (args[1] || '').toLowerCase() === 'auto') cfg.tiers = 'auto';
  else if (sub === 'tiers' && args.length >= 4 && args.slice(1, 4).every(x => +x > 0)) cfg.tiers = args.slice(1, 4).map(Number).sort((a, b) => a - b);
  else if (sub === 'test') {
    const px = await priceOf(cfg, D).catch(() => ({ solUsd: 0, mcap: 0, priceSol: 0 }));
    const mcap = px.mcap || 2000000;
    const sol = px.solUsd || 150;
    const price = px.priceSol ? px.priceSol * sol : 0.0016;
    const t = tierLimits(cfg, mcap);
    const fake = '1'.repeat(64), who = '1'.repeat(32);
    const samples = [t[0] * 0.5, t[1] * 1.2, t[2] * 1.5].map((usd, i) => ({ tx: fake, usd, tokens: usd / price, quote: usd / sol, qsym: 'SOL', from: who, newHolder: i !== 1, pos: 96 }));
    for (const s of samples) {
      const r = await sendBuy(env, D, msg.chat.id, cfg, s, mcap, true);
      if (!r.ok) { await reply(env, msg, 'Test alert failed: ' + r.description); break; }
    }
    return;
  } else { await reply(env, msg, BB_HELP); return; }

  await saveChatCfg(D, msg.chat.id, cfg);
  await reply(env, msg, bbStatus(cfg));
}

// ---------- live buys: transactionSubscribe on the tracked pools ----------
// A long-lived connection object keeps one WebSocket to the RPC provider open and gets every confirmed transaction that touches a tracked
// pool the moment it lands, read the same way as the poller reads them. The poller keeps running as a safety net;
// each buy is posted once (bb_posted). The scheduled run wakes the stream every minute, its alarm every 30 s.
const streamStub = env => env.BUYSTREAM.get(env.BUYSTREAM.idFromName('main'));
export class BuyStream {
  constructor(state, env) {
    this.state = state; this.env = env;
    this.ws = null; this.pools = ''; this.subReq = 0; this.subId = null; this.reqId = 1;
    this.last = 0; this.opened = 0; this.stats = { msgs: 0, buys: 0, connects: 0, errors: 0 };
    this.rows = []; this.queue = {}; this.timers = {}; this.subAt = 0;
  }
  async fetch() { await this.ensure(); return Response.json(this.status()); }
  async alarm() { await this.ensure(); }
  status() {
    return { open: !!this.ws, subscribed: !!this.subId, pools: this.pools ? this.pools.split(',').length : 0,
      last_msg_s: this.last ? Math.round((Date.now() - this.last) / 1000) : null, up_s: this.opened ? Math.round((Date.now() - this.opened) / 1000) : 0, ...this.stats };
  }
  async ensure() {
    try { await this.state.storage.setAlarm(Date.now() + 30000); } catch (e) { /* next wake */ }
    rpcOverride = (this.env.SOLANA_RPC_URL || '').trim() || null;
    if (!rpcOverride) return;
    try {
      const D = await bbDb(this.env);
      const ok = await allowedChats(this.env);
      this.rows = (await D.prepare('SELECT chat_id, cfg, last_block FROM bb_chats').all()).results
        .filter(x => ok.has(String(x.chat_id)))
        .map(r => ({ row: r, cfg: Object.assign({}, BB_DEFAULT, JSON.parse(r.cfg)) }))
        .filter(x => x.cfg.enabled && x.cfg.chain === 'solana' && x.cfg.pool);
    } catch (e) { this.stats.errors++; console.log('buystream rows', e && e.message); return; }
    const pools = [...new Set(this.rows.map(x => x.cfg.pool.a))].sort().join(',');
    // pings are answered, and a busy pool streams all the time: 90 s of silence means the link is gone
    if (this.ws && Date.now() - this.last > 90000) this.close();
    if (!pools) { this.close(); return; }
    if (!this.ws) await this.open();
    if (!this.ws) return;
    if (pools !== this.pools || !this.subId) { if (Date.now() - this.subAt > 20000 || pools !== this.pools) this.subscribe(pools); }
    this.send({ method: 'ping' });
  }
  async open() {
    try {
      const r = await fetch(rpcOverride, { headers: { Upgrade: 'websocket' } });
      const ws = r.webSocket;
      if (!ws) { this.stats.errors++; console.log('buystream no websocket', r.status); return; }
      ws.accept();
      this.ws = ws; this.last = Date.now(); this.opened = Date.now(); this.pools = ''; this.subId = null; this.subAt = 0;
      this.stats.connects++;
      ws.addEventListener('message', e => this.onMessage(e.data));
      const gone = () => { if (this.ws === ws) { this.ws = null; this.subId = null; this.pools = ''; } };
      ws.addEventListener('close', gone);
      ws.addEventListener('error', gone);
    } catch (e) { this.stats.errors++; console.log('buystream open', String(e && e.message).replace(/https?:\/\/\S+/g, '[url]')); }
  }
  close() { const ws = this.ws; this.ws = null; this.subId = null; this.pools = ''; try { if (ws) ws.close(1000, 'reconnect'); } catch (e) { /* gone */ } }
  send(o) {
    if (!this.ws) return 0;
    const id = this.reqId++;
    try { this.ws.send(JSON.stringify(Object.assign({ jsonrpc: '2.0', id }, o))); } catch (e) { this.close(); return 0; }
    return id;
  }
  subscribe(pools) {
    if (this.subId) this.send({ method: 'transactionUnsubscribe', params: [this.subId] });
    this.subId = null; this.pools = pools; this.subAt = Date.now();
    this.subReq = this.send({ method: 'transactionSubscribe', params: [
      { accountInclude: pools.split(','), failed: false, vote: false },
      { commitment: 'confirmed', encoding: 'jsonParsed', transactionDetails: 'full', showRewards: false, maxSupportedTransactionVersion: 1 },
    ] });
  }
  onMessage(data) {
    this.last = Date.now();
    let m;
    try { m = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)); } catch (e) { return; }
    if (m.id && m.id === this.subReq) {
      if (typeof m.result === 'number') this.subId = m.result;
      else { this.stats.errors++; this.pools = ''; console.log('buystream subscribe', JSON.stringify(m.error || m).slice(0, 200)); }
      return;
    }
    if (m.method !== 'transactionNotification') return;
    this.stats.msgs++;
    const r = m.params && m.params.result;
    if (!r || !r.transaction || !r.signature) return;
    const tx = Object.assign({}, r.transaction, { slot: r.slot });
    try { this.take(tx, r.signature); } catch (e) { this.stats.errors++; console.log('buystream read', e && e.message); }
  }
  take(tx, sig) {
    if (!tx.meta || tx.meta.err || !tx.transaction || !tx.transaction.message) return;
    const keys = txKeys(tx);
    for (const x of this.rows) {
      if (!keys.includes(x.cfg.pool.a)) continue;
      const b = decodeBuy(tx, sig, x.cfg.pool, x.cfg);
      if (!b) continue;
      this.stats.buys++;
      const id = x.row.chat_id;
      (this.queue[id] = this.queue[id] || []).push(b);
      if (!this.timers[id]) this.timers[id] = setTimeout(() => { this.timers[id] = null; this.flush(id); }, 700);   // gather buys landing together
    }
  }
  async flush(id) {
    const buys = this.queue[id] || [];
    this.queue[id] = [];
    const x = this.rows.find(r => r.row.chat_id === id);
    if (!buys.length || !x) return;
    try { await postBuys(this.env, await bbDb(this.env), x.row, x.cfg, buys, null); }
    catch (e) { this.stats.errors++; console.log('buystream post', e && e.message); }
    if ((this.queue[id] || []).length && !this.timers[id]) this.timers[id] = setTimeout(() => { this.timers[id] = null; this.flush(id); }, 100);
  }
}

export default {
  async scheduled(event, env, ctx) {
    if (env.BUYSTREAM) ctx.waitUntil(streamStub(env).fetch('https://stream/ensure').catch(e => console.log('buystream wake', e && e.message)));
    try { await runBuyBot(env); } catch (e) { console.log('buybot run', e && e.message); }
  },

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

    if (url.pathname === '/health') {
      const out = {};
      const t = async (k, u, o) => { try { const r = await fetch(u, o); out[k] = r.status; } catch (e) { out[k] = 'error'; } };
      const slot = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"getSlot","params":[]}' };
      for (const u of SOLANA.rpcs) await t(new URL(u).host, u, slot);
      await t('dexscreener', 'https://api.dexscreener.com/latest/dex/tokens/' + WSOL);
      await t('coinbase', 'https://api.coinbase.com/v2/prices/SOL-USD/spot');
      if (env.SOLANA_RPC_URL) {
        const u = env.SOLANA_RPC_URL.trim();
        const why = () => (rpcLastError.split(': ').slice(1).join(': ') || 'no answer').slice(0, 120);
        try { const [s] = await rpcOnce(u, [['getSlot', []]]); out.solana_rpc = s ? 'ok' : why(); } catch (e) { out.solana_rpc = 'failing ' + String(e && e.message).replace(/https?:\/\/\S+/g, '').slice(0, 80); }
        // the calls the buy bot lives on: a transaction list and a transaction
        try {
          const [l] = await rpcOnce(u, [['getSignaturesForAddress', [WSOL, { limit: 1, commitment: 'confirmed' }]]]);
          out.solana_rpc_list = Array.isArray(l) ? 'ok' : why();
          if (Array.isArray(l) && l[0]) { const [t] = await rpcOnce(u, [['getTransaction', [l[0].signature, TX_OPTS]]]); out.solana_rpc_tx = t ? 'ok' : why(); }
        } catch (e) { out.solana_rpc_list = 'failing ' + String(e && e.message).replace(/https?:\/\/\S+/g, '').slice(0, 80); }
      } else out.solana_rpc = 'missing';
      if (env.BUYSTREAM) { try { out.stream = await (await streamStub(env).fetch('https://stream/ensure')).json(); } catch (e) { out.stream = 'error ' + (e && e.message); } }
      return Response.json(out);
    }

    return new Response('Poof bot is running.');
  },
};
