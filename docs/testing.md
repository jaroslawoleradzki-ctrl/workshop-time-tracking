# Dokumentacja testów (Testing Documentation)

Dokument opisuje architekturę testów, strukturę katalogów, integrację z procesem wydawniczym oraz dalsze plany rozbudowy pokrycia testowego systemu.

## 1. Architektura i narzędzia

W projekcie wprowadzono pierwszą warstwę testów automatycznych (testy integracyjne API backendu).
* **Framework testowy**: **Vitest** (szybki, natywny runner TypeScript/ESM).
* **Narzędzie żądań HTTP**: **Supertest** (uruchamia aplikację Express w pamięci i wysyła zapytania bez konieczności rezerwacji portu sieciowego).

## 2. Struktura i lokalizacja testów

Wszystkie testy backendu znajdują się w katalogu:
`backend/tests/`

Aktualnie zaimplementowane pliki testowe:
* `backend/tests/version.test.ts` – weryfikacja poprawności endpointu wersji `/api/version`.
* `backend/tests/integration.test.ts` – weryfikacja poprawności endpointu zdrowia `/api/health`, zachowania logowania przy niepoprawnych danych oraz blokowania dostępu bez tokenu autoryzacyjnego.

## 3. Uruchamianie testów

Testy backendu można uruchomić lokalnie wykonując polecenia:
```bash
cd backend
npm test
```

Komenda ta uruchamia Vitest w trybie jednorazowym (`vitest run`).

## 4. Integracja z weryfikacją wydania (verify-release.sh)

Testy automatyczne są integralną częścią skryptu walidacyjnego `./scripts/verify-release.sh`.
* **Zasada**: Skrypt walidacyjny automatycznie przechodzi do katalogu `backend/` i wywołuje `npm test` po pomyślnym przebudowaniu kodu źródłowego.
* **Wpływ na Release**: Jeżeli jakikolwiek test nie powiedzie się (FAIL), cały proces walidacji wydania zostaje przerwany, skrypt zwraca kod wyjścia `1` i blokuje możliwość przygotowania nowej wersji produkcyjnej.

## 5. Dalsza rozbudowa pokrycia testowego (Roadmap)

W kolejnych etapach projektu planowane jest zaimplementowanie następujących obszarów testowych:

### Backend (Vitest + Supertest)
* **Prawidłowe logowanie**: Weryfikacja logowania z użyciem konta testowego administratora/lidera (np. konta tworzone przez `prisma/seed.ts`).
* **Testy parsera Excel (Imports)**: Symulacja przesyłania plików szablonów Excel (Orders / Employees) w celu weryfikacji poprawności parsowania oraz obsługi błędów w strukturze komórek.
* **Testy zapytań raportowych (Reports)**: Testy poprawności wyliczania oraz agregacji czasu pracy pod kątem zadanego zakresu dat i stref czasowych.

### Frontend (Vitest + React Testing Library + Happy DOM)
* **Kompilacja i renderowanie komponentów**: Podstawowe testy renderowania kluczowych formularzy i widoków (np. `LoginForm`, `ImportOrdersForm`).
* **Logika autoryzacji**: Weryfikacja czyszczenia pamięci przeglądarki (`localStorage`/`sessionStorage`) i przekierowań na ekran logowania w przypadku niezgodności wersji backendu/frontendu.

### End-to-End (Playwright)
* **Krytyczne ścieżki użytkownika**: Testy całościowego przepływu E2E (od logowania, przez import pliku zamówień, po rejestrację czasu pracy i wygenerowanie końcowego raportu).
