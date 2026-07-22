# Konfiguracja

Konfiguracja produkcyjna i konfiguracja lokalnego backendu są celowo rozdzielone. Docker Compose czyta wyłącznie plik `.env` z katalogu głównego, natomiast backend uruchamiany poza Dockerem może używać `backend/.env`. Oba pliki są ignorowane przez Git; repozytorium zawiera tylko bezpieczne przykłady.

## Docker Compose

Przed pierwszym uruchomieniem:

```bash
cp .env.example .env
chmod 600 .env
```

Uzupełnij wszystkie wymagane wartości. Dla sekretów używaj znaków bezpiecznych w URL, np. wyniku `openssl rand -hex 32`, ponieważ dane PostgreSQL są składane w `DATABASE_URL`.

| Nazwa | Wymagana | Domyślna | Przeznaczenie |
|---|---:|---|---|
| `WTT_POSTGRES_USER` | tak | brak | użytkownik PostgreSQL i składnik `DATABASE_URL` |
| `WTT_POSTGRES_PASSWORD` | tak | brak | hasło PostgreSQL i składnik `DATABASE_URL` |
| `WTT_POSTGRES_DB` | tak | brak | nazwa bazy i składnik `DATABASE_URL` |
| `WTT_JWT_SECRET` | tak | brak | podpisywanie i weryfikowanie JWT |
| `WTT_POSTGRES_VOLUME` | tak | brak | dokładna nazwa zewnętrznego wolumenu danych |
| `WTT_HTTP_PORT` | nie | `80` | port Nginx publikowany na hoście |
| `WTT_BACKEND_HOST_PORT` | nie | `5000` | port API publikowany na hoście |
| `WTT_POSTGRES_HOST_PORT` | nie | `5432` | port PostgreSQL publikowany na hoście |
| `WTT_LOG_LEVEL` | nie | `info` | poziom logowania backendu |

Brak wymaganej wartości zatrzymuje `docker compose config` i `docker compose up` z komunikatem wskazującym jej nazwę. `APP_VERSION` pozostaje śledzoną, literalną wartością wydania w `docker-compose.yml`, a `NODE_ENV=production` jest ustawiane wyłącznie w finalnym etapie `backend/Dockerfile`.

### Istniejący wolumen PostgreSQL

`WTT_POSTGRES_VOLUME` musi wskazywać dokładną nazwę wolumenu zawierającego dane. Zmiana tej wartości może podłączyć pusty lub inny wolumen. Ustawienie nowych wartości `WTT_POSTGRES_USER`, `WTT_POSTGRES_PASSWORD` lub `WTT_POSTGRES_DB` nie zmienia danych dostępowych zapisanych w już zainicjalizowanym PostgreSQL; przy migracji istniejącej instalacji należy zachować dotychczasowe wartości. Rotacja danych dostępowych jest osobną operacją bazodanową.

Zmiana `WTT_JWT_SECRET` natychmiast unieważnia istniejące sesje i wymaga ponownego logowania użytkowników.

## Development lokalny

Backend uruchamiany bez Compose ładuje `backend/.env` przez `dotenv`:

```bash
cp backend/.env.example backend/.env
chmod 600 backend/.env
```

| Nazwa | Wymagana | Domyślna w kodzie | Przeznaczenie |
|---|---:|---|---|
| `DATABASE_URL` | tak | brak | bezpośrednie połączenie Prisma z PostgreSQL |
| `JWT_SECRET` | tak | brak | podpis JWT; backend nie ma sekretu awaryjnego |
| `PORT` | nie | `5000` | port lokalnego API |
| `LOG_LEVEL` | nie | zależna od środowiska | poziom logowania |

Plik `backend/.env` nie jest używany przez Docker Compose. Analogicznie, rootowy `.env` nie jest automatycznie ładowany przez backend uruchomiony bez Compose. Frontend nie wymaga zmiennych `VITE_*`; używa względnych ścieżek `/api`.

## Bezpieczeństwo i kopie

Nie commituj, nie wklejaj do zgłoszeń ani nie pokazuj w logach zawartości `.env`, tokenów lub pełnego `DATABASE_URL`. Przechowuj szyfrowaną kopię produkcyjnego `.env` poza repozytorium i ogranicz uprawnienia pliku do właściciela (`chmod 600 .env`). Szczegółowa procedura znajduje się w [deployment.md](deployment.md).
