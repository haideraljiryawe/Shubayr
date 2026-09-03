# Shubayr — common commands
.PHONY: up down infra full logs db psql schema seed reset

infra: ## start infrastructure only (db, redis, search, adminer, mailpit)
	docker compose up -d

full: ## start everything incl. the API (needs backend scaffolded)
	docker compose --profile full up -d --build

down: ## stop everything
	docker compose down

logs:
	docker compose logs -f

psql: ## open a psql shell on the dev database
	docker compose exec db psql -U $${DB_USERNAME:-shubayr} -d $${DB_DATABASE:-shubayr}

reset: ## DANGER: wipe db volume and reload schema+seed
	docker compose down -v && docker compose up -d db
