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
const RESERVED = [...FILTER_CMDS, 'filter', 'stop', 'filters', 'postportal', 'start', 'help', 'buybot'];

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
      + 'Do not use /filter: that is Guardian\'s command and gives double replies.\n\n<b>Admins: buy bot</b>\n/buybot - status and settings of the buy alerts in this group.';
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
// Posts every buy of the configured token into the group, in Poof style.
// State lives in the SQL database bound as DB (tables are created on first use).
// A scheduled run (every minute) calls runBuyBot; admins configure it with /buybot in the group.

const CHAINS = {
  robinhood: {
    name: 'Robinhood Chain',
    rpc: 'https://rpc.mainnet.chain.robinhood.com',
    explorer: 'https://robinhoodchain.blockscout.com',
    ds: 'robinhood',        // DexScreener chain id
    uni: 'robinhood',       // Uniswap app chain name
  },
};
const TOPIC_V2 = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const TOPIC_V3 = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
const TIERS = [
  { key: 'spark', name: 'Spark' },
  { key: 'puff', name: 'Puff' },
  { key: 'poof', name: 'Poof' },
  { key: 'bigpoof', name: 'Big poof' },
];
const MCAP_PCT = [0.005, 0.025, 0.1];   // % of MCap where Puff, Poof and Big poof start
const FIXED_TIERS = [100, 500, 2000];   // used when MCap is unknown
const BB_DEFAULT = { enabled: true, minUsd: 10, ttl: 10, tiers: 'auto', emoji: true };
const EMOJI_SET = 'usepoof';
// positions in the usepoof emoji pack
const EM = { mark: 0, coinInk: 1, coinRust: 3, coinStone: 4, poof: 5, foxHi: 6, foxGaze: 9, foxDollar: 10 };
const MAX_ALERTS = 8;
const MAX_RANGE = 20000;                // blocks per run (about 30 min on Robinhood Chain)

// ---------- storage (SQL database) ----------
let dbReady = false;
async function bbDb(env) {
  if (!env.DB) throw new Error('The database is not connected (binding DB).');
  if (!dbReady) {
    await env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS bb_chats (chat_id TEXT PRIMARY KEY, cfg TEXT NOT NULL, last_block INTEGER)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS bb_pending (chat_id TEXT, msg_id INTEGER, expires INTEGER)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS bb_kv (k TEXT PRIMARY KEY, v TEXT)'),
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
async function saveChatCfg(D, chatId, cfg, lastBlock) {
  if (lastBlock === undefined) {
    await D.prepare('UPDATE bb_chats SET cfg = ? WHERE chat_id = ?').bind(JSON.stringify(cfg), String(chatId)).run();
  } else {
    await D.prepare('INSERT INTO bb_chats (chat_id, cfg, last_block) VALUES (?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET cfg = excluded.cfg, last_block = excluded.last_block')
      .bind(String(chatId), JSON.stringify(cfg), lastBlock).run();
  }
}

// ---------- chain helpers ----------
const hex = n => '0x' + n.toString(16);
const word = (data, i) => BigInt('0x' + (data.slice(2 + i * 64, 2 + (i + 1) * 64) || '0'));
const sword = (data, i) => { let v = word(data, i); if (v >= (1n << 255n)) v -= (1n << 256n); return v; };
const units = (v, dec) => Number(v) / Math.pow(10, dec);
const pad32 = a => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

async function rpc(chain, calls) {
  const body = calls.map((c, i) => ({ jsonrpc: '2.0', id: i, method: c[0], params: c[1] }));
  const r = await fetch(CHAINS[chain].rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  const out = [];
  for (const x of (Array.isArray(j) ? j : [j])) out[x.id] = x.error ? null : x.result;
  return out;
}

async function dexPair(cfg) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/pairs/${CHAINS[cfg.chain].ds}/${cfg.pair}`);
    const j = await r.json();
    const p = (j.pairs || [])[0] || j.pair;
    if (!p) return null;
    return { priceUsd: +p.priceUsd || 0, mcap: +(p.marketCap || p.fdv) || 0 };
  } catch (e) { return null; }
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
const fmtPct = n => (n >= 1000 ? Math.round(n).toLocaleString('en-US') : n >= 10 ? Math.round(n) : n.toFixed(1)) + '%';
const shortAddr = a => a.slice(0, 6) + '…' + a.slice(-4);
const quoteName = s => /^W?ETH$/i.test(s || '') ? 'ETH' : (s || '');

async function emojiIds(env, D) {
  const c = await kvGet(D, 'emoji');
  if (c && Date.now() - c.t < 6 * 3600e3) return c.ids;
  const r = await tg(env, 'getStickerSet', { name: EMOJI_SET });
  const ids = r.ok ? r.result.stickers.map(s => s.custom_emoji_id) : (c ? c.ids : null);
  await kvSet(D, 'emoji', { t: Date.now(), ids });
  return ids;
}
const emojiFn = ids => (i, fallback) => (ids && ids[i]) ? `<tg-emoji emoji-id="${ids[i]}">${fallback}</tg-emoji>` : fallback;

function tierFor(cfg, usd, mcap) {
  const t = Array.isArray(cfg.tiers) ? cfg.tiers : (mcap ? MCAP_PCT.map(p => mcap * p / 100) : FIXED_TIERS);
  return TIERS[usd >= t[2] ? 3 : usd >= t[1] ? 2 : usd >= t[0] ? 1 : 0];
}

function buyCaption(cfg, b, tier, mcap, E, test) {
  const ch = CHAINS[cfg.chain];
  const sym = esc(cfg.sym || 'TOKEN');
  let s = `${E(EM.mark, '🟧')} <b>$${sym} buy</b> · ${tier.name}${test ? ' <i>(test)</i>' : ''}\n\n`;
  s += `${E(EM.foxDollar, '💸')} <b>${fmtAmt(b.quote)} ${esc(quoteName(b.qsym))}</b> (${fmtUsd(b.usd)})\n`;
  s += `${E(EM.coinInk, '🪙')} <b>${fmtCompact(b.tokens)} ${sym}</b> · <a href="${ch.explorer}/tx/${b.tx}">Tx</a>\n`;
  if (b.from) s += `${E(EM.foxHi, '👤')} <a href="${ch.explorer}/address/${b.from}">${shortAddr(b.from)}</a> · ${b.newHolder ? 'New holder' : 'Position +' + fmtPct(b.pos)}\n`;
  if (mcap) s += `${E(EM.coinStone, '📊')} MCap ${fmtUsd(mcap)}\n`;
  if (cfg.ttl > 0) s += tier.key === 'bigpoof' ? `\n${E(EM.foxGaze, '🦊')} <i>big poofs stay</i>` : `\n${E(EM.poof, '💨')} <i>poofs in ${cfg.ttl} min</i>`;
  return s;
}

function buyButtons(cfg, ids) {
  const ch = CHAINS[cfg.chain];
  const chart = { text: 'Chart', url: `https://dexscreener.com/${ch.ds}/${cfg.pair}` };
  const buy = { text: 'Buy', url: `https://app.uniswap.org/swap?chain=${ch.uni}&inputCurrency=ETH&outputCurrency=${cfg.token}` };
  const site = { text: 'usepoof.chat', url: SITE };
  if (ids) {
    if (ids[EM.coinStone]) chart.icon_custom_emoji_id = ids[EM.coinStone];
    if (ids[EM.foxDollar] || ids[EM.coinRust]) buy.icon_custom_emoji_id = ids[EM.foxDollar] || ids[EM.coinRust];
    if (ids[EM.mark]) site.icon_custom_emoji_id = ids[EM.mark];
  }
  return { inline_keyboard: [[chart, buy, site]] };
}

// sends one alert; falls back to plain emoji, then to text, if Telegram refuses something
async function sendBuy(env, D, chatId, cfg, b, mcap, test) {
  const tier = tierFor(cfg, b.usd, mcap);
  const ids = cfg.emoji ? await emojiIds(env, D) : null;
  const cached = await kvGet(D, 'media:' + tier.key);
  const media = cached || (IMG + 'buybot/' + tier.key + '.mp4');
  const attempt = async (useIds, withMedia) => {
    const caption = buyCaption(cfg, b, tier, mcap, emojiFn(useIds), test);
    const reply_markup = buyButtons(cfg, useIds);
    return withMedia
      ? tg(env, 'sendAnimation', { chat_id: chatId, animation: media, caption, parse_mode: 'HTML', reply_markup })
      : tg(env, 'sendMessage', { chat_id: chatId, text: caption, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup });
  };
  let r = await attempt(ids, true);
  if (!r.ok && ids) r = await attempt(null, true);
  if (!r.ok) r = await attempt(null, false);
  if (r.ok) {
    if (!cached && r.result.animation) await kvSet(D, 'media:' + tier.key, r.result.animation.file_id);
    if (cfg.ttl > 0 && tier.key !== 'bigpoof') {
      await D.prepare('INSERT INTO bb_pending (chat_id, msg_id, expires) VALUES (?, ?, ?)').bind(String(chatId), r.result.message_id, Date.now() + cfg.ttl * 60000).run();
    }
  }
  return r;
}

// ---------- polling ----------
async function pollChat(env, D, row) {
  const cfg = Object.assign({}, BB_DEFAULT, JSON.parse(row.cfg));
  if (!cfg.enabled || !cfg.pools || !cfg.pools.length) return;
  const poolMap = {};
  for (const p of cfg.pools) poolMap[p.a.toLowerCase()] = p;
  const last = row.last_block || 0;
  const [bnHex] = await rpc(cfg.chain, [['eth_blockNumber', []]]);
  const latest = parseInt(bnHex, 16);
  if (!latest) return;
  let from = last ? last + 1 : latest;
  if (latest - from > MAX_RANGE) from = latest - MAX_RANGE;
  if (from > latest) return;
  const [logs] = await rpc(cfg.chain, [['eth_getLogs', [{ address: cfg.pools.map(p => p.a), fromBlock: hex(from), toBlock: hex(latest), topics: [[TOPIC_V2, TOPIC_V3]] }]]]);
  if (!Array.isArray(logs)) return;   // RPC hiccup: try the same range next minute
  await D.prepare('UPDATE bb_chats SET last_block = ? WHERE chat_id = ?').bind(latest, row.chat_id).run();

  const byTx = {};
  for (const l of logs) {
    const p = poolMap[l.address.toLowerCase()];
    if (!p) continue;
    let tokOut = 0n, qIn = 0n;
    if (l.topics[0] === TOPIC_V2) {
      const a0In = word(l.data, 0), a1In = word(l.data, 1), a0Out = word(l.data, 2), a1Out = word(l.data, 3);
      if (p.t0) { tokOut = a0Out; qIn = a1In; } else { tokOut = a1Out; qIn = a0In; }
    } else {
      const a0 = sword(l.data, 0), a1 = sword(l.data, 1);
      const tokD = p.t0 ? a0 : a1, qD = p.t0 ? a1 : a0;
      if (tokD < 0n && qD > 0n) { tokOut = -tokD; qIn = qD; }
    }
    if (tokOut <= 0n || qIn <= 0n) continue;
    const b = byTx[l.transactionHash] || (byTx[l.transactionHash] = { tx: l.transactionHash, tokens: 0, quote: 0, qsym: p.qsym });
    b.tokens += units(tokOut, cfg.dec);
    b.quote += units(qIn, p.qdec);
  }
  let buys = Object.values(byTx);
  if (!buys.length) return;

  const px = await dexPair(cfg);
  const priceUsd = px ? px.priceUsd : 0, mcap = px ? px.mcap : 0;
  for (const b of buys) b.usd = b.tokens * priceUsd;
  buys = buys.filter(b => b.usd >= cfg.minUsd || !priceUsd).sort((a, b) => b.usd - a.usd);
  if (!buys.length) return;
  const shown = buys.slice(0, MAX_ALERTS), rest = buys.slice(MAX_ALERTS);

  // buyer = sender of the transaction; position from its balance right after the buy
  const txs = await rpc(cfg.chain, shown.map(b => ['eth_getTransactionByHash', [b.tx]]));
  shown.forEach((b, i) => { b.from = txs[i] && txs[i].from; });
  const withFrom = shown.filter(b => b.from);
  if (withFrom.length) {
    const bals = await rpc(cfg.chain, withFrom.map(b => ['eth_call', [{ to: cfg.token, data: '0x70a08231' + pad32(b.from) }, 'latest']]));
    withFrom.forEach((b, i) => {
      const bal = bals[i] ? units(BigInt(bals[i]), cfg.dec) : 0;
      b.newHolder = bal <= b.tokens * 1.001;
      b.pos = b.newHolder ? 0 : (b.tokens / Math.max(bal - b.tokens, 1e-18)) * 100;
    });
  }

  for (const b of shown) await sendBuy(env, D, row.chat_id, cfg, b, mcap, false);
  if (rest.length) {
    const sum = rest.reduce((s, b) => s + b.usd, 0);
    const r = await tg(env, 'sendMessage', { chat_id: row.chat_id, text: `+${rest.length} more buys this minute (${fmtUsd(sum)})`, disable_notification: true });
    if (r.ok && cfg.ttl > 0) await D.prepare('INSERT INTO bb_pending (chat_id, msg_id, expires) VALUES (?, ?, ?)').bind(row.chat_id, r.result.message_id, Date.now() + cfg.ttl * 60000).run();
  }
}

async function runBuyBot(env) {
  const D = await bbDb(env);
  const due = await D.prepare('SELECT rowid AS id, chat_id, msg_id FROM bb_pending WHERE expires <= ? LIMIT 25').bind(Date.now()).all();
  for (const r of due.results) await tg(env, 'deleteMessage', { chat_id: r.chat_id, message_id: r.msg_id });
  if (due.results.length) await D.prepare(`DELETE FROM bb_pending WHERE rowid IN (${due.results.map(r => r.id).join(',')})`).run();
  const chats = await D.prepare('SELECT chat_id, cfg, last_block FROM bb_chats').all();
  for (const row of chats.results) {
    try { await pollChat(env, D, row); } catch (e) { console.log('buybot', row.chat_id, e && e.message); }
  }
}

// ---------- /buybot command (admins) ----------
async function setupToken(cfgOld, ca, chain) {
  const ch = CHAINS[chain];
  const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/${ch.ds}/${ca}`);
  const pairs = await r.json();
  const list = (Array.isArray(pairs) ? pairs : (pairs.pairs || []))
    .filter(p => p.chainId === ch.ds && p.baseToken && p.baseToken.address.toLowerCase() === ca.toLowerCase())
    .filter(p => (p.labels || []).some(l => l === 'v2' || l === 'v3') && !/^0x[0-9a-f]{64}$/i.test(p.pairAddress))
    .filter(p => ((p.liquidity && p.liquidity.usd) || 0) >= 500)
    .sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0))
    .slice(0, 3);
  if (!list.length) return { error: 'No Uniswap v2/v3 pool with liquidity found for this token on ' + ch.name + '.' };
  const quotes = [...new Set(list.map(p => p.quoteToken.address.toLowerCase()))];
  const dec = await rpc(chain, [ca, ...quotes].map(a => ['eth_call', [{ to: a, data: '0x313ce567' }, 'latest']]));
  const decOf = i => dec[i] ? parseInt(dec[i], 16) : 18;
  const pools = list.map(p => {
    const q = p.quoteToken.address.toLowerCase();
    return { a: p.pairAddress, v: (p.labels || []).includes('v2') ? 'v2' : 'v3', dex: p.dexId, q, qsym: p.quoteToken.symbol, qdec: decOf(1 + quotes.indexOf(q)), t0: ca.toLowerCase() < q };
  });
  const cfg = Object.assign({}, BB_DEFAULT, cfgOld || {}, { chain, token: ca, sym: list[0].baseToken.symbol, dec: decOf(0), pools, pair: list[0].pairAddress, enabled: true });
  return { cfg };
}

function bbStatus(cfg, lastBlock) {
  if (!cfg) return '<b>Poof buy bot</b>\nNot set up in this chat yet.\n\n' + BB_HELP;
  const ch = CHAINS[cfg.chain];
  const tiers = Array.isArray(cfg.tiers) ? cfg.tiers.map(fmtUsd).join(' / ') : 'auto (' + MCAP_PCT.join('% / ') + '% of MCap)';
  return `<b>Poof buy bot</b> · ${cfg.enabled ? 'on' : 'off'}\n\n`
    + `Token: <b>$${esc(cfg.sym)}</b> on ${ch.name}\n<code>${cfg.token}</code>\n`
    + `Pools: ${cfg.pools.map(p => `${p.dex} ${p.v} (${esc(quoteName(p.qsym))})`).join(', ')}\n`
    + `Min buy: ${fmtUsd(cfg.minUsd)} · Alerts poof after: ${cfg.ttl ? cfg.ttl + ' min' : 'never'}\n`
    + `Tiers: ${tiers}\nCustom emoji: ${cfg.emoji ? 'on' : 'off'}\n\n` + BB_HELP;
}
const BB_HELP = '<b>Commands</b>\n'
  + '/buybot set &lt;contract&gt; - track this token here (Robinhood Chain)\n'
  + '/buybot on | off\n'
  + '/buybot min 25 - smallest buy shown, in $\n'
  + '/buybot ttl 10 - minutes before small alerts poof (0 = keep)\n'
  + '/buybot tiers auto | 100 500 2000 - where Puff, Poof, Big poof start\n'
  + '/buybot emoji on | off\n'
  + '/buybot test - post sample alerts\n'
  + '/buybot remove';

async function handleBuybot(env, msg, text) {
  if (!(await isAdmin(env, msg))) { await reply(env, msg, 'Only admins can set up the buy bot.'); return; }
  if (msg.chat.type === 'private' && !/^\/buybot\s+(poll)\b/i.test(text)) { await reply(env, msg, 'Use /buybot inside the group where the alerts should go.'); return; }
  let D;
  try { D = await bbDb(env); } catch (e) { await reply(env, msg, e.message); return; }
  const args = text.trim().split(/\s+/).slice(1);
  const sub = (args[0] || '').toLowerCase();
  const cur = await getChatCfg(D, msg.chat.id);
  const cfg = cur ? Object.assign({}, BB_DEFAULT, cur.cfg) : null;
  const need = async () => { if (!cfg) { await reply(env, msg, 'Set a token first: /buybot set &lt;contract&gt;'); return false; } return true; };

  if (!sub) { await reply(env, msg, bbStatus(cfg, cur && cur.last_block)); return; }

  if (sub === 'set') {
    const ca = args[1] || '';
    const chain = (args[2] || 'robinhood').toLowerCase();
    if (!/^0x[0-9a-fA-F]{40}$/.test(ca)) { await reply(env, msg, 'Use: /buybot set 0x... (token contract address)'); return; }
    if (!CHAINS[chain]) { await reply(env, msg, 'Supported chains: ' + Object.keys(CHAINS).join(', ')); return; }
    const res = await setupToken(cfg, ca, chain);
    if (res.error) { await reply(env, msg, res.error); return; }
    const [bn] = await rpc(chain, [['eth_blockNumber', []]]);
    await saveChatCfg(D, msg.chat.id, res.cfg, parseInt(bn, 16) || 0);
    await reply(env, msg, 'Buy bot is tracking this token now.\n\n' + bbStatus(res.cfg));
    return;
  }
  if (sub === 'remove') { await D.prepare('DELETE FROM bb_chats WHERE chat_id = ?').bind(String(msg.chat.id)).run(); await reply(env, msg, 'Buy bot removed from this chat.'); return; }
  if (sub === 'poll' && msg.from && msg.from.id === OWNER_ID) { await runBuyBot(env); await reply(env, msg, 'Checked for new buys.'); return; }
  if (!(await need())) return;

  if (sub === 'on' || sub === 'off') cfg.enabled = sub === 'on';
  else if (sub === 'min' && !isNaN(+args[1])) cfg.minUsd = Math.max(0, +args[1]);
  else if (sub === 'ttl' && !isNaN(+args[1])) cfg.ttl = Math.max(0, Math.min(2880, Math.round(+args[1])));
  else if (sub === 'emoji' && /^(on|off)$/i.test(args[1] || '')) cfg.emoji = args[1].toLowerCase() === 'on';
  else if (sub === 'tiers' && (args[1] || '').toLowerCase() === 'auto') cfg.tiers = 'auto';
  else if (sub === 'tiers' && args.length >= 4 && args.slice(1, 4).every(x => +x > 0)) cfg.tiers = args.slice(1, 4).map(Number).sort((a, b) => a - b);
  else if (sub === 'test') {
    const px = await dexPair(cfg);
    const mcap = px ? px.mcap : 2000000;
    const t = Array.isArray(cfg.tiers) ? cfg.tiers : MCAP_PCT.map(p => mcap * p / 100);
    const price = px && px.priceUsd ? px.priceUsd : 0.0016;
    const fake = '0x' + 'f'.repeat(64), who = '0x8f10b468b06c6fd214b65f87778827f7d113f996';
    const samples = [t[0] * 0.5, t[1] * 1.2, t[2] * 1.5].map((usd, i) => ({ tx: fake, usd, tokens: usd / price, quote: usd / 2600, qsym: cfg.pools[0].qsym, from: who, newHolder: i !== 1, pos: 96 }));
    for (const s of samples) {
      const r = await sendBuy(env, D, msg.chat.id, cfg, s, mcap, true);
      if (!r.ok) { await reply(env, msg, 'Test alert failed: ' + r.description); break; }
    }
    return;
  } else { await reply(env, msg, BB_HELP); return; }

  await saveChatCfg(D, msg.chat.id, cfg);
  await reply(env, msg, bbStatus(cfg));
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runBuyBot(env).catch(e => console.log('buybot run', e && e.message)));
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

    return new Response('Poof bot is running.');
  },
};
