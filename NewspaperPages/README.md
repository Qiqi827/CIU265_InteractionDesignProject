# Usage

## Supabase live newspaper

The newspaper display has been updated to read from Supabase Realtime.

Before opening the live newspaper page, fill:

```text
frontend/supabase-config.js
```

with:

```js
export const SUPABASE_URL = 'your project url';
export const SUPABASE_ANON_KEY = 'your anon public key';
```

The page reads the latest active `sessions` row, loads existing
`frontpage_articles`, and subscribes to new inserts. It updates without page
refresh when `submit-interview` creates a new article.

The browser never writes interviews directly. Unity should call the Supabase
Edge Function and include:

```text
x-unity-secret: <UNITY_SHARED_SECRET>
```

Do not place the real secret value in frontend files.

You can also force a session in the URL:

```text
frontend/newspaper.html?session_id=<session uuid>
```

## Local photo prototype

The commands below are ONLY for Linux / MacOS users.

Windows users please find the corresponding commands or write your own scripts :)

Preparation:

```bash
chmod +x "start_servers.sh"

```

```bash
chmod +x "clean_servers.sh"
```

Start:

```bash
./start_servers.sh
```

Then two pages are:

Newspaper (visit this page on another computer!)

[http://10.159.67.31:5500/frontend/newspaper.html](http://10.159.67.31:5500/frontend/newspaper.html)

Capturer (visit this page on this computer!)

[http://localhost:5500/frontend/index.html](http://localhost:5500/frontend/index.html)

Stop:

```bash
./clean_servers.sh
```

