# =====================================================================
# Shubayr API — PHP 8.3 (Laravel) development image
# Used by docker-compose service "api" once the Laravel app is scaffolded.
# =====================================================================
FROM php:8.3-cli

# System deps + PHP extensions commonly needed by Laravel + PostgreSQL
RUN apt-get update && apt-get install -y --no-install-recommends \
        git unzip libpq-dev libzip-dev libicu-dev libonig-dev \
    && docker-php-ext-install pdo pdo_pgsql pgsql bcmath intl zip opcache \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Install PHP deps if composer.json exists (safe no-op before scaffolding)
COPY composer.jso[n] composer.loc[k] ./
RUN if [ -f composer.json ]; then composer install --no-interaction --no-scripts --prefer-dist || true; fi

COPY . .

EXPOSE 8000

# Dev server. In production use php-fpm + nginx instead.
CMD ["sh", "-c", "php artisan migrate --force || true; php artisan serve --host=0.0.0.0 --port=8000"]
