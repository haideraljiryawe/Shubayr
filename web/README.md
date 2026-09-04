# Shubayr — Web Storefront (Next.js)

Public, SEO-friendly, Arabic-first storefront. Scaffolded with **Claude Code**
using `../prompts/WEB_CLAUDE_FULL.md`. See
`../docs/setup/SETUP_WEB.md` for complete environment setup.

## Run (after scaffolding)
```bash
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
npm install
npm run dev                        # http://localhost:3000
```

Branding (name/logo/colors/currency) is loaded at runtime from the API's
`store_settings` — the site is white-label.
