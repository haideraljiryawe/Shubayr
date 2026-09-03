# Shubayr — Backend API (Laravel)

This folder holds the Laravel 13 REST API. It is scaffolded with **Codex** using
`../prompts/BACKEND_CODEX.md`.

## Contract
- Match the database schema in `../infra/db/schema.sql` exactly.
- Follow the 18 rules in `../docs/ARCHITECTURE.md`.

## Run (after scaffolding)
```bash
cp .env.example .env         # set DB to the docker postgres (host: db)
composer install
php artisan key:generate
php artisan migrate --seed
php artisan serve --host=0.0.0.0 --port=8000
```
Or via Docker from the repo root: `docker compose --profile full up -d --build`.

API base URL: `http://localhost:8000/api/v1`
