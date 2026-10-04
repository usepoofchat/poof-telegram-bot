# Poof Telegram bot

The official bot for the Poof community on Telegram ([@usepoofbot](https://t.me/usepoofbot)).
Poof is a private, temporary chatroom in your browser: [usepoof.chat](https://usepoof.chat).

The whole bot is one file, `worker.js`, with no dependencies.

## What it does
- Answers `/help`, `/links`, `/website`, `/x`, `/docs`, `/github`, `/ca` and `/rules` with the official links and texts.
- Admins can add their own commands (filters) from the chat:
  - `/addfilter name text` adds or updates a filter; after that `/name` answers with the text.
  - Reply to a message (text or photo) with `/addfilter name` to save that message as the filter.
  - `/delfilter name` removes a filter (built-in ones are turned off the same way).
  - `/listfilters` lists all filters.
- Keeps the pinned welcome post in the Poof Portal channel up to date (owner only).
- Posts buy alerts for the Poof token in the group (/buybot, admins only). Needs a SQL database bound as DB and a scheduled run every minute.

The bot token is never stored in this repository.

## Assets
`assets/` holds the media the bot uses (portal and welcome animations, avatars).
The bot loads them from this repository's `main` branch.

## Links
Website: [usepoof.chat](https://usepoof.chat) · Docs: [usepoof.chat/docs](https://usepoof.chat/docs/) · X: [@usepoofchat](https://x.com/usepoofchat) · Telegram: [t.me/usepoofchat](https://t.me/usepoofchat)
