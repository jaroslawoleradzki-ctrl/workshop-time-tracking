# Konfiguracja

## Zmienne środowiskowe

| Nazwa | Wymagana | Domyślna w kodzie | Środowisko | Przeznaczenie | Bezpieczny przykład |
|---|---:|---|---|---|---|
| `DATABASE_URL` | tak | brak | backend, Prisma | połączenie PostgreSQL | `postgresql://app_user:CHANGE_ME@localhost:5432/time_reporting?schema=public` |
| `JWT_SECRET` | produkcja: tak | wbudowana wartość deweloperska | backend | podpis JWT | losowy ciąg co najmniej 32 bajtów, np. wynik menedżera sekretów |
| `PORT` | nie | `5000` | backend | port nasłuchu API | `5000` |
| `APP_VERSION` | nie | wersja z `backend/package.json` | backend/Docker | odpowiedź `/api/version` | `0.2.8` |
| `NODE_ENV` | nie | `development` w endpointzie wersji | backend | format logów i opis środowiska | `production` |

Nie znaleziono zmiennych środowiskowych frontendu (`VITE_*`); frontend korzysta ze względnych ścieżek `/api`.

## Development lokalny

Skopiuj `backend/.env.example` do `backend/.env`, ustaw własne dane PostgreSQL i unikalny sekret, następnie użyj poleceń z [README](../README.md). Przykładowy plik ma `PORT=5001`, podczas gdy kod domyślnie używa 5000 — port lokalny zależy więc od `.env`.

## Docker Compose

`docker-compose.yml` uruchamia PostgreSQL, backend i Nginx. Obecnie zawiera jawne przykładowe hasło bazy oraz sekret JWT. Przed użyciem poza izolowanym developmentem należy zastąpić je wartościami dostarczanymi spoza repozytorium. Nginx wystawia port 80, API 5000, a PostgreSQL 5432.

## Produkcja i sekrety

Procedurę wdrożenia opisuje [deployment.md](deployment.md). Produkcja powinna ustawić silny, stabilny `JWT_SECRET`, produkcyjny `DATABASE_URL`, `NODE_ENV=production` oraz właściwy `APP_VERSION`. Sekretów, tokenów, haseł i danych klienta nie należy commitować, logować ani umieszczać w dokumentacji; należy je przechowywać w pliku o ograniczonych prawach poza repozytorium albo w menedżerze sekretów i rotować po ujawnieniu.

Frontend jest statycznym buildem i nie odczytuje powyższych zmiennych w przeglądarce. Backend ładuje `.env` przez `dotenv`; Prisma wymaga `DATABASE_URL` także podczas generowania/migracji.
