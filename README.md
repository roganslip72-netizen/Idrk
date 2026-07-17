# StreamCheck

Find exactly where to stream any movie — with a residential-proxy second opinion.

## Setup

### 1. TMDB API key (free)
1. Sign up at [themoviedb.org](https://www.themoviedb.org/signup)
2. Settings → API → request a Developer key
3. Copy the **API Read Access Token** (long JWT starting with `eyJ…`)
4. Paste it into the app when prompted

### 2. Backend (for residential-proxy verification)

```bash
npm install
```

Copy `.env.example` to `.env` and fill in your IPRoyal credentials:

```
PROXY_USER=your_username
PROXY_PASS=your_password
PROXY_HOST=geo.iproyal.com
PROXY_PORT=22225
PORT=3001
```

Then start the backend:

```bash
node server.js
# or for auto-restart on save:
npm run dev
```

### 3. Open the frontend

Open `index.html` in your browser (or serve it from the same Express server at `http://localhost:3001`).

## How it works

- **Primary data**: TMDB API — streaming providers, age ratings, cast, runtime, sequels/collections
- **Second opinion**: Click "Verify via Proxy" on any movie result — the backend queries **JustWatch** through your residential proxy (so results reflect a real browser in that country, not a datacenter IP) and cross-checks against TMDB's data
- If the two sources disagree, a warning is shown explaining the discrepancy
