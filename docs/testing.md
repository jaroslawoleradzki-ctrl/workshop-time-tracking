# Dokumentacja testów (Testing Documentation)

Dokument opisuje architekturę testów, strukturę katalogów, integrację z procesem wydawniczym oraz dalsze plany rozbudowy pokrycia testowego systemu.

## 1. Architektura i narzędzia

W projekcie zaimplementowano dwie warstwy testów automatycznych: testy integracyjne API backendu oraz testy jednostkowe/renderowania komponentów frontendu.

### Backend
* **Framework testowy**: **Vitest** (szybki, natywny runner TypeScript/ESM).
* **Narzędzie żądań HTTP**: **Supertest** (uruchamia aplikację Express w pamięci i wysyła zapytania bez konieczności rezerwacji portu sieciowego).

### Frontend
* **Framework testowy**: **Vitest** (dzieli konfigurację z Vite, zapewniając szybką kompilację i spójność).
* **Środowisko DOM**: **Happy DOM** (lekka, szybka biblioteka emulująca przeglądarkowe API w pamięci Node.js).
* **Biblioteka testowa**: **React Testing Library** (umożliwia testowanie komponentów w sposób zbliżony do interakcji użytkownika).
* **Dodatkowe narzędzia**: `@testing-library/jest-dom` (dodatkowe asercje DOM, np. `.toBeInTheDocument()`), `@testing-library/user-event` (symulacja rzeczywistych zdarzeń użytkownika).

---

## 2. Struktura i lokalizacja testów

### Backend
Wszystkie testy backendu znajdują się w katalogu:
`backend/tests/`

Aktualnie zaimplementowane pliki testowe:
* `backend/tests/version.test.ts` – weryfikacja poprawności endpointu wersji `/api/version`.
* `backend/tests/integration.test.ts` – weryfikacja poprawności endpointu zdrowia `/api/health`, zachowania logowania przy niepoprawnych danych oraz blokowania dostępu bez tokenu autoryzacyjnego.

### Frontend
Wszystkie testy frontendu oraz pliki konfiguracyjne znajdują się w katalogach:
* `frontend/src/test/` – testy jednostkowe oraz testy komponentów.
* `frontend/src/test/setup.ts` – plik inicjalizacyjny (mockuje globalne obiekty `localStorage` oraz `sessionStorage` w celu unikania konfliktów ze środowiskiem Node.js i importuje asercje Jest DOM).
* `frontend/vitest.config.ts` – konfiguracja runnera łącząca standardowe wtyczki Vite z parametrami Happy DOM.

Aktualnie zaimplementowane pliki testowe:
* `frontend/src/test/App.test.tsx` – weryfikacja poprawnego renderowania głównego kontenera aplikacji, pól formularza logowania (login, hasło, przycisk wysyłania) oraz poprawnego pobierania i wyświetlania wersji systemu (w tym obsługa błędów połączenia).

---

## 3. Uruchamianie testów

### Uruchomienie testów backendu
```bash
cd backend
npm test
```

### Uruchomienie testów frontendu
```bash
cd frontend
npm test
```

Oba polecenia uruchamiają runner Vitest w trybie jednorazowym (`vitest run`).

---

## 4. Integracja z weryfikacją wydania (verify-release.sh)

Testy automatyczne (zarówno backendu, jak i frontendu) są integralną częścią skryptu walidacyjnego `./scripts/verify-release.sh`.

### Kolejność etapów walidacji:
1. **Git** – weryfikacja czystości repozytorium oraz aktywnej gałęzi.
2. **Versions** – weryfikacja spójności wersji w 7 kluczowych plikach projektu.
3. **Backend Build** – kompilacja kodu źródłowego backendu.
4. **Frontend Build** – kompilacja kodu źródłowego frontendu.
5. **Backend Tests** – uruchomienie testów backendu za pomocą `npm test`.
6. **Frontend Tests** – uruchomienie testów frontendu za pomocą `npm test`.
7. **Docker (opcjonalnie)** – walidacja konfiguracji kontenerów (przy przełączniku `--with-docker`).
8. **Documentation** – weryfikacja spójności wersji w dokumentacji (`README.md` oraz `CHANGELOG.md`).

* **Wpływ na Release**: Jeżeli jakikolwiek etap walidacji (w tym testy backendowe lub frontendowe) zakończy się błędem (FAIL), skrypt natychmiast przerywa działanie, zwraca kod błędu `1` i blokuje proces wydawniczy.

---

## 5. Dalsza rozbudowa pokrycia testowego (Roadmap)

W kolejnych etapach projektu planowane jest zaimplementowanie następujących obszarów testowych:

### Backend (Vitest + Supertest)
* **Prawidłowe logowanie**: Weryfikacja logowania z użyciem konta testowego administratora/lidera (np. konta tworzone przez `prisma/seed.ts`).
* **Testy parsera Excel (Imports)**: Symulacja przesyłania plików szablonów Excel (Orders / Employees) w celu weryfikacji poprawności parsowania oraz obsługi błędów w strukturze komórek.
* **Testy zapytań raportowych (Reports)**: Testy poprawności wyliczania oraz agregacji czasu pracy pod kątem zadanego zakresu dat i stref czasowych.

### Frontend (Vitest + React Testing Library + Happy DOM)
* **Walidacja formularza logowania**: Testy sprawdzające wyświetlanie błędów walidacyjnych przy braku wpisania hasła lub loginu przed wysłaniem formularza.
* **Filtrowanie tabel i nawigacja**: Symulacja interakcji użytkownika przy przełączaniu zakładek raportowania, sortowaniu tabel oraz wprowadzaniu godzin czasu pracy.
* **Komponenty raportowe**: Testy renderowania podsumowań czasu pracy w tabelach oraz generowania arkuszy.

### End-to-End (Playwright)
* **Krytyczne ścieżki użytkownika**: Testy całościowego przepływu E2E (od logowania, przez import pliku zamówień, po rejestrację czasu pracy i wygenerowanie końcowego raportu).
