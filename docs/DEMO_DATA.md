# Baza i dane demonstracyjne LaserCAD

Dokument opisuje bezpieczne przygotowanie osobnej bazy oraz uruchomienie deterministycznego seeda danych demonstracyjnych LaserCAD.

> [!WARNING]
> `backend/prisma/seed-demo.ts` jest skryptem destrukcyjnym. W jednej transakcji usuwa dotychczasowe raporty czasu pracy, zlecenia, pracowników, użytkowników, historię importów, logi audytu i słownik typów czasu, a następnie tworzy kompletny zestaw demo. Nie usuwa tabeli migracji Prisma.

## Zabezpieczenie bazy

Seed odczytuje `DATABASE_URL`, parsuje go jako URL PostgreSQL i uruchamia się wyłącznie wtedy, gdy nazwa bazy kończy się dokładnie `_demo`.

Przykłady:

- `time_reporting_demo` – dozwolona,
- `demo` – niedozwolona,
- `time_reporting` – niedozwolona,
- brak lub niepoprawny `DATABASE_URL` – niedozwolony.

Walidacja odbywa się przed utworzeniem połączenia z Prisma i przed czyszczeniem danych. Skrypt nie wypisuje hasła ani pełnego `DATABASE_URL`; przed rozpoczęciem pokazuje wyłącznie nazwę zatwierdzonej bazy demo. Błąd w dowolnym kroku zapisu wycofuje całą transakcję.

## Utworzenie bazy `time_reporting_demo`

Zaloguj się do PostgreSQL kontem posiadającym prawo tworzenia baz i wykonaj:

```sql
CREATE DATABASE time_reporting_demo;
```

Utworzenie osobnego użytkownika PostgreSQL o ograniczonych uprawnieniach jest zalecane. Nazwy użytkownika i hasła zależą od lokalnego środowiska i nie są przechowywane w repozytorium.

## Konfiguracja środowiska

Nie zmieniaj produkcyjnego `backend/.env`. Utwórz lokalnie ignorowany przez Git plik `backend/.env.demo`:

```env
DATABASE_URL="postgresql://<DEMO_DB_USER>:<DEMO_DB_PASSWORD>@localhost:5432/time_reporting_demo?schema=public"
JWT_SECRET="<LOKALNY_SEKRET_DEMO>"
```

Zastąp wartości w nawiasach własnymi lokalnymi danymi. Jeżeli login lub hasło zawierają znaki specjalne, zakoduj je zgodnie z regułami URL. Nie commituj pliku ani prawdziwych poświadczeń.

Z katalogu głównego repozytorium przejdź do `backend` i wczytaj konfigurację do bieżącej sesji terminala:

```bash
cd backend
set -a
. ./.env.demo
set +a
```

## Migracje i uruchomienie

Najpierw zastosuj istniejące migracje do pustej bazy demo:

```bash
npx prisma migrate deploy
```

Następnie uruchom seed deweloperski:

```bash
npm run seed:demo
```

Po wcześniejszym wykonaniu `npm run build` można użyć skompilowanej wersji:

```bash
npm run seed:demo:prod
```

Nie używaj `npx prisma db seed`, ponieważ jest on przypisany do odrębnego seeda systemowego `prisma/seed.ts`.

## Tworzone konta

Hasła są zapisywane wyłącznie jako hashe bcrypt.

| Rola | Login | Hasło demo | Nazwa |
|---|---|---|---|
| Administrator | `demo` | `LaserCAD2026!` | Administrator Demo |
| Lider | `leader` | `LaserCAD2026!` | Tomasz Maj |

Te dane są przeznaczone wyłącznie dla izolowanego środowiska demonstracyjnego.

## Zakres danych

Każde uruchomienie tworzy ten sam zestaw danych biznesowych, identyfikatorów, dat i hashy:

- 2 aktywnych użytkowników,
- 15 aktywnych, fikcyjnych pracowników z numerami `EMP-001`–`EMP-015`,
- 7 systemowych typów czasu: `G`, `NDR`, `NS`, `UW`, `UOK`, `UŻ`, `L4`,
- 30 zleceń `LC-2026-001`–`LC-2026-030`,
- 20 aktywnych zleceń (`18 OPEN`, `2 SUSPENDED`) i 10 zakończonych (`CLOSED`),
- 1886 raportów czasu pracy z okresu `2026-05-01`–`2026-07-22`.

Raporty obejmują 1729 wpisów `G`, 111 wpisów `NDR`, 15 sobotnich wpisów `NS`, 20 dni `UW`, 3 krótkie okresy `L4` (8 wpisów dziennych), 2 pojedyncze dni `UŻ` i jeden dzień `UOK`. Standardowy dzień produkcyjny ma 8 godzin rozłożonych na 1–3 zlecenia. W dniach urlopu lub L4 nie ma produkcji ani nadgodzin.

## Ponowne odtworzenie demo

1. Sprawdź, czy `DATABASE_URL` wskazuje dokładnie właściwą bazę z końcówką `_demo`.
2. Wykonaj `npx prisma migrate deploy`.
3. Ponownie uruchom `npm run seed:demo` albo `npm run seed:demo:prod`.

Nie trzeba ręcznie usuwać rekordów. Seed czyści wyłącznie wskazaną bazę demo i atomowo odtwarza pełny, deterministyczny zestaw.
