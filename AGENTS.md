# Project Development Policy (Zasady Pracy Nad Projektem)

Niniejszy plik definiuje stałe standardy deweloperskie i wytyczne architektoniczne dla projektu **workshop-time-tracking**. Każda sesja z agentem AI musi bezwzględnie przestrzegać poniższych reguł.

---

## 1. Wersjonowanie (Versioning)

Aplikacja stosuje wersjonowanie semantyczne (SemVer).
* **Aktualny stan**: Aplikacja znajduje się w fazie ciągłego rozwoju (development).
* **Blokada wersji produkcyjnej**: Wersja `1.0.0` lub wyższa **nie może** zostać użyta ani zadeklarowana bez wyraźnej zgody użytkownika.

### Reguły aktualizacji wersji:

* **PATCH (np. 0.1.2 → 0.1.3)**:
  Stosuj do: poprawek błędów (bug fixes), łatek bezpieczeństwa, drobnych ulepszeń interfejsu (UI improvements), optymalizacji wydajności, refaktoryzacji, czyszczenia kodu oraz aktualizacji dokumentacji.
* **MINOR (np. 0.1.3 → 0.2.0)**:
  Stosuj do: nowych funkcjonalności, zmian w schemacie bazy danych, nowych raportów, nowych modułów, nowych endpointów API, nowych ekranów oraz integracji.
* **MAJOR (np. 0.x.x → 1.0.0)**:
  Wymaga bezwzględnej zgody użytkownika przed utworzeniem wersji `1.0.0` lub wyższej.

### Procedura commitowania i podnoszenia wersji:
1. Przed każdym commitem przeanalizuj wszystkie wprowadzone zmiany.
2. Zdefiniuj i zaproponuj następną wersję (PATCH lub MINOR) wraz z uzasadnieniem.
3. **Zatrzymaj się i poproś użytkownika o zatwierdzenie wersji.**
4. Po uzyskaniu zgody zaktualizuj wersję automatycznie w `frontend/package.json`. Aplikacja automatycznie wyświetli nową wersję.
5. Stwórz commit z zatwierdzoną wersją w tytule. Użytkownik nie powinien ręcznie edytować `package.json`.

---

## 2. Przepływ pracy Git (Git Workflow)

* Wszystkie prace programistyczne muszą być prowadzone **wyłącznie** na branchu: `development`.
* **Przed rozpoczęciem jakichkolwiek prac** automatycznie wykonaj następujące polecenia:
  - `pwd`
  - `git branch --show-current`
  - `git status`
* **Zweryfikuj**: czy ścieżka robocza (workspace), repozytorium oraz branch są w 100% poprawne.
* Jeśli repozytorium lub branch są niepoprawne: **STOP! Nie wprowadzaj żadnych modyfikacji w plikach.**

---

## 3. Kontrola zakresu zmian (Scope Control)

Przed modyfikacją jakiegokolwiek kodu:
1. Przeanalizuj zadanie i określ, które pliki będą zmieniane.
2. Wypisz pliki planowane do modyfikacji i krótko uzasadnij dlaczego.
3. **Poczekaj na zatwierdzenie zakresu prac przez użytkownika.**
4. Nigdy nie modyfikuj plików niezwiązanych z powierzonym zadaniem.

---

## 4. Testowanie (Testing)

Po zakończeniu wdrażania zmian:
* Przedstaw użytkownikowi dokładną i przejrzystą instrukcję (checklistę), co i jak powinien przetestować.
* Nie zakładaj, że kod działa po prostu dlatego, że się kompiluje.
* Testuj w pierwszej kolejności warunki brzegowe, poprawność przesyłania danych i obsługę błędów API.

---

## 5. Commity

* **Nigdy nie twórz commitów automatycznie.**
* Po pomyślnym zakończeniu testów zaproponuj wersję (zgodnie z SemVer) oraz treść wiadomości commit (commit message).
* Poczekaj na zatwierdzenie przed wykonaniem zapisu w repozytorium.

---

## 6. Bezpieczeństwo środowiska produkcyjnego (Production Safety)

Bez wyraźnego polecenia użytkownika **nigdy nie modyfikuj**:
* Konfiguracji Docker (`docker-compose.yml`, `Dockerfile` itp.)
* Schematu bazy danych (pliki Prisma, migracje)
* Logiki uwierzytelniania i autoryzacji (JWT, middlewares)
* Zmiennych środowiskowych (`.env`)

---

## 7. Rekomendacja dotycząca artefaktów budowania (Build Artifacts Policy)

Katalog statyczny `frontend/dist` jest obecnie wersjonowany w repozytorium Git, co jest nieoptymalne ze względu na:
- Duże, nieczytelne diffy przy zmianach kodu.
- Potencjalne konflikty scalania (merge conflicts).
- Zwiększanie rozmiaru repozytorium zbędnymi plikami binarnymi.

### Rekomendowany plan migracji (do wdrożenia w przyszłości na życzenie użytkownika):
1. **Wykluczenie katalogu z Git**:
   - Dopisanie `/frontend/dist` do pliku `.gitignore`.
   - Usunięcie śledzenia katalogu w Git bez usuwania fizycznych plików lokalnie:
     `git rm -r --cached frontend/dist`
2. **Przeniesienie procesu budowania do Docker**:
   - Stworzenie wieloetapowego pliku `Dockerfile` dla kontenera Nginx (serwera WWW), który samodzielnie skompiluje frontend w kontenerze budującym i skopiuje wynik do obrazu serwującego:
     ```dockerfile
     # Stage 1: Build React frontend
     FROM node:20-alpine AS build
     WORKDIR /app
     COPY package*.json ./
     RUN npm ci
     COPY . .
     RUN npm run build

     # Stage 2: Serve using Nginx
     FROM nginx:alpine
     COPY --from=build /app/dist /usr/share/nginx/html
     COPY nginx/nginx.conf /etc/nginx/nginx.conf:ro
     ```
   - Aktualizacja pliku `docker-compose.yml` w celu bezpośredniego budowania obrazu Nginx zamiast montowania lokalnego katalogu `dist`.
