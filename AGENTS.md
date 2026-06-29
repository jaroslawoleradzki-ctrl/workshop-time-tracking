# Zasady prowadzenia projektu (AGENTS.md)

Dokument ten opisuje stałe zasady deweloperskie oraz standardy pracy dla wszystkich deweloperów i agentów programistycznych pracujących przy projekcie **workshop-time-tracking**.

## 1. Przepływ pracy Git (Git Workflow)
* **Zawsze pracujemy na branchu `development`** – codzienne prace programistyczne i testowe odbywają się wyłącznie na tej gałęzi.
* **Stabilne wersje produkcyjne (`main`)** – gałąź `main` zawiera wyłącznie stabilne wersje aplikacji przekazane i wdrożone u klienta.

## 2. Cykl wprowadzania zmian (Scope Control)
1. **Analiza i plan zmian** – przed modyfikacją kodu należy przeprowadzić analizę zadania, zlokalizować pliki i przedstawić plan do akceptacji.
2. **Akceptacja użytkownika** – implementację można rozpocząć **dopiero po zatwierdzeniu** planu zmian przez użytkownika.
3. **Praca po zakończeniu każdej większej funkcjonalności**:
   - **Build**: Upewnij się, że zarówno backend (`npm run build`), jak i frontend (`npm run build`) kompilują się bez błędów.
   - **Test**: Przeprowadź testy wdrożonych zmian w środowisku lokalnym.
   - **Commit**: Zaproponuj commit (z podbiciem wersji SemVer w package.json) i zaczekaj na decyzję użytkownika (nie commituj automatycznie).

## 3. Zmiany w bazie danych (Database Migrations)
* Każda zmiana modelu danych (Prisma) wymaga:
  - utworzenia migracji,
  - aktualizacji dokumentacji architektury (`docs/architecture.md`),
  - wpisu w `CHANGELOG.md` w katalogu głównym.

## 4. Utrzymanie dokumentacji i Changelog
* **Aktualizacja na bieżąco** – dokumentacja techniczna w katalogu `docs/` oraz w katalogu głównym musi być utrzymywana na bieżąco.
* **Aktualny stan projektu** – dokumentacja musi odzwierciedlać wyłącznie aktualny stan projektu. Nie należy opisywać funkcjonalności, które nie zostały jeszcze zaimplementowane.
* **Aktualizacja po zakończeniu sprintu** – po zakończeniu każdego etapu/sprintu należy zaktualizować odpowiednie pliki (np. `docs/roadmap.md`, `docs/architecture.md`).
* **Keep a Changelog** – każda wersja wydana i przekazana klientowi musi zostać szczegółowo opisana w pliku `CHANGELOG.md` w katalogu głównym.

## 5. Ignorowanie plików (Git Hygiene)
* **Pliki generowane automatycznie** – pod żadnym pozorem nie commitujemy plików generowanych automatycznie, takich jak:
  - `node_modules/`
  - skompilowany build produkcyjny backendu (`backend/dist/`)
  - pliki wygenerowane przez Prisma Client (`node_modules/@prisma/client` itp.)
  - lokalne pliki konfiguracyjne `.env` oraz archiwa baz danych z katalogu `backups/`.
