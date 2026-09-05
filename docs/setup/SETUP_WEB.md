# Website setup - Hiader

You own `web/`, the Next.js public website.

## 1. Prerequisites

| OS | Required tools |
|---|---|
| macOS | Git and Node.js 20+; Docker Desktop is optional for a local API |
| Windows | Git for Windows and Node.js 20+; Docker Desktop with WSL 2 is optional |
| Linux | Git and Node.js 20+; Docker Engine with Compose is optional |

Verify:

```bash
git --version
node --version
npm --version
```

## 2. Clone and configure the API URL

```bash
git clone https://github.com/haideraljiryawe/Shubayr.git
cd Shubayr
git switch main
git pull --ff-only origin main
git switch -c feature/web-<change>
```

Open a pull request into `main` when the work is ready; delete the feature branch
after it merges.

macOS/Linux:

```bash
printf 'NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1\n' > web/.env.local
```

Windows PowerShell:

```powershell
Set-Content web/.env.local 'NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1'
```

`.env.local` is ignored by Git. Never commit it.

## 3. Run the API locally when needed

Create the root environment and start shared services.

macOS/Linux:

```bash
cp .env.example .env
docker compose up -d
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up -d
```

Once Abbas has scaffolded the backend and `backend/.env` exists:

```bash
docker compose --profile full up -d --build
```

## 4. Work before the backend is live

Use [the OpenAPI contract](../../api/openapi.yaml) as the only endpoint and
payload source. Build typed fixtures and mock handlers from its examples and
schemas. Mock successful, validation, authentication, empty, and error responses.
Do not invent an endpoint; raise a contract change with Abbas instead.

## 5. Scaffold and run the website

Follow the [authoritative web build prompt](../../prompts/WEB_CLAUDE_FULL.md),
then run:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000` and confirm requests target
`http://localhost:8000/api/v1`.
