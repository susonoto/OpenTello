# OpenTello

Minimalist real-time web chat.

A clean, distraction-free chat application running on Netlify Functions and Netlify Database.  
No icons, no clutter — just a simple and modern interface.

## Features

- Live messaging (new messages appear within ~2 seconds)
- Recent message history is kept
- Optional display name
- Multi-user support
- Minimalist, generic UI
- Works on desktop and mobile

## Requirements

- Node.js 18 or later
- Netlify CLI (`npm install -g netlify-cli`)

## Quick Start

```bash
npm install
netlify dev
```

Open the URL printed by `netlify dev`. Database migrations in
`netlify/database/migrations/` are applied automatically on deploy.

## Project Structure

```
OpenTello-Web/
├── package.json
├── netlify.toml
├── db/                # Drizzle schema + database client
├── netlify/
│   ├── functions/relay.ts      # GET/POST /api/relay (encrypted relay)
│   └── database/migrations/    # SQL migrations
├── public/
│   ├── index.html     # UI
│   ├── style.css      # Minimalist styles
│   └── client.js      # Frontend logic
├── README.md
└── LICENSE
```

## Usage

1. Open the page in a browser.
2. Enter a name (or leave blank for “Anonymous”) and click **Join**.
3. Type a message and press Enter or click **Send**.
4. Open the same URL in another tab/window or device to chat with multiple users.

## License

MIT License – see [LICENSE](LICENSE).
