# Poof Telegram bot

The official bot for the Poof community on Telegram ([@usepoofbot](https://t.me/usepoofbot)).
Poof is a private, temporary chatroom in your browser: [usepoof.chat](https://usepoof.chat).

It runs as a single Cloudflare Worker (`worker.js`) with no other dependencies.

## What it does
- Answers `/help`, `/links`, `/website`, `/x`, `/docs`, `/github`, `/ca` and `/rules` with the official links and texts.
- Admins can add their own commands (filters) from the chat:
  - `/addfilter name text` adds or updates a filter; after that `/name` answers with the text.
  - Reply to a message (text or photo) with `/addfilter name` to save that message as the filter.
  - `/delfilter name` removes a filter (built-in ones are turned off the same way).
  - `/listfilters` lists all filters.
- Keeps the pinned welcome post in the Poof Portal channel up to date (`/postportal`, owner only, in the bot DM).

## Setup
1. Create a Cloudflare Worker and paste `worker.js`.
2. In the Worker settings add:
   - a secret `BOT_TOKEN` (from @BotFather)
   - a KV namespace binding named `FILTERS`
3. Deploy, then open `https://<worker-url>/setup` once to connect the webhook and the command menu.

The token only lives in the Worker secrets, never in this repo.

## Assets
`assets/` holds the media the bot uses (portal and welcome animations, avatars).
The bot loads them from this repo's `main` branch, so a change here shows up the next time the post is refreshed.

## Links
Website: [usepoof.chat](https://usepoof.chat) · Docs: [usepoof.chat/docs](https://usepoof.chat/docs/) · X: [@usepoofchat](https://x.com/usepoofchat) · Telegram: [t.me/usepoofchat](https://t.me/usepoofchat)
