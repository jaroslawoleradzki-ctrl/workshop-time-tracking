# Wytyczne dla Agentów AI i Deweloperów (AGENTS.md)

Dokument ten definiuje standardy programistyczne, architekturę projektu, przepływ pracy w systemie kontroli wersji Git oraz reguły zachowania spójności bazy danych i dokumentacji. Wszystkie agenty AI oraz deweloperzy pracujący nad tym projektem **muszą bezwzględnie stosować się do tych zasad**.

---

## Procedura rozpoczęcia pracy (Work Startup Procedure)
Przed przystąpieniem do jakichkolwiek modyfikacji kodu lub konfiguracji, agent/deweloper musi bezwzględnie wykonać następujące czynności weryfikacyjne:
1. **Sprawdzenie ścieżki roboczej**: Wykonaj `pwd` i upewnij się, że pracujesz w odpowiednim katalogu projektu.
2. **Sprawdzenie gałęzi Git**: Wykonaj `git branch --show-current` i upewnij się, że aktualny branch to `development`.
3. **Sprawdzenie stanu repozytorium**: Wykonaj `git status` w celu upewnienia się, że stan repozytorium jest czysty.
4. **Zapoznanie z zasadami**: Przeczytaj `AGENTS.md` oraz (w razie potrzeby) `README.md`.

> [!IMPORTANT]
> Jeżeli katalog roboczy, aktywny branch lub stan repozytorium jest niezgodny ze specyfikacją zadania – **ZATRZYMAJ PRACĘ NATYCHMIAST** i poinformuj użytkownika.

---

## Procedura zakończenia pracy (Work Completion Procedure)
Przed zadeklarowaniem zakończenia prac nad zadaniem, wykonaj następujące kroki weryfikacyjne:
1. **Kompilacja backendu**: Przejdź do katalogu `backend/` i uruchom `npm run build`. Upewnij się, że kompilacja przechodzi bez błędów.
2. **Kompilacja frontendu**: Przejdź do katalogu `frontend/` i uruchom `npm run build`. Upewnij się, że kompilacja przechodzi bez błędów.
3. **Weryfikacja zmian Git**: Uruchom `git status` oraz `git diff --stat`, aby sprawdzić zakres zmodyfikowanych plików.
4. **Raport końcowy**: Przygotuj raport dla użytkownika zawierający listę zmodyfikowanych plików, status git oraz podsumowanie ulepszeń.

> [!CAUTION]
> **Nigdy nie wykonuj automatycznych commitów ani nie pushuj zmian do repozytorium.** Zawsze czekaj na zatwierdzenie i wyraźną instrukcję od użytkownika.

---

## Zasady UI (UI Rules)
Wszystkie nowe ekrany lub modyfikacje istniejących widoków w aplikacji React muszą być w pełni spójne z obecnym designem.
* **Spójność ponad redesign**: Preferujemy spójność wizualną nad wprowadzaniem nowych motywów graficznych.
* **Standardowy układ ekranu (od góry do dołu)**:
  1. **Tytuł** (Title) z ikoną Lucide.
  2. **Główna akcja** (Primary action) – np. przycisk dodawania rekordu.
  3. **Filtry / Wyszukiwanie** (Filters) – np. pola wyszukiwania.
  4. **Tabela / Treść** (Content).
  5. **Paginacja** (jeśli istnieje).

---

## Responsywność (Responsiveness)
Każda zmiana w interfejsie użytkownika musi poprawnie zachowywać się i dopasowywać układ na następujących typach urządzeń:
* **Laptop 15"** (standardowy ekran roboczy).
* **Monitor stacjonarny 24–27"** (duże ekrany administracyjne).
* **Tablet z systemem Android** (urządzenie mobilne lidera używane na hali produkcyjnej).

---

## Kryteria Zakończenia (Definition of Done)
Zmiana zostaje uznana za ukończoną tylko wtedy, gdy spełnia poniższe kryteria:
1. **Implementacja kompletna**: Kod funkcjonalny jest w pełni zaimplementowany, brak placeholderów.
2. **Kompilacja backendu**: Serwer kompiluje się bez błędów (`npm run build` w katalogu `backend/` kończy się sukcesem).
3. **Kompilacja frontendu**: Aplikacja kliencka kompiluje się bez błędów (`npm run build` w katalogu `frontend/` kończy się sukcesem).
4. **Weryfikacja manualna**: Zmiany zostały przetestowane i działają prawidłowo w środowisku lokalnym.
5. **Dokumentacja zaktualizowana**: Zmiany zostały odzwierciedlone w plikach w katalogu `docs/` oraz w `README.md`.
6. **Changelog zaktualizowany**: Dodano odpowiedni wpis opisujący zmianę w `CHANGELOG.md`.
7. **Akceptacja użytkownika**: Użytkownik przetestował i zatwierdził wdrożone zmiany.

---

## Reguły dotyczące dokumentacji (Documentation Rules)
* **Tylko istniejące funkcjonalności**: Dokumentacja musi opisywać wyłącznie działający i faktycznie zaimplementowany kod aplikacji.
* **Zakaz dokumentowania planów**: Nigdy nie opisuj w dokumentacji technicznej, instrukcjach ani readme funkcji planowanych do wdrożenia w przyszłości.
* **Aktualizacja na bieżąco**: Przy każdej zmianie kodu weryfikuj konieczność naniesienia poprawek w `README.md`, `CHANGELOG.md`, `AGENTS.md` oraz plikach w katalogu `docs/`.

---

## Reguły Prisma (Prisma Rules)
* **Nigdy nie resetuj bazy danych** (`npx prisma migrate reset` jest zabronione).
* **Zawsze tworz migracje**: Wszelkie modyfikacje schematu bazy danych w pliku `schema.prisma` muszą zostać wdrożone poprzez wygenerowanie migracji SQL (`npx prisma migrate dev`), a następnie zredagowane w celu zapewnienia bezpieczeństwa danych.
* **Zakaz modyfikacji historycznych migracji**: Nigdy nie edytuj ani nie zmieniaj starych plików migracji (`.sql`), które zostały już kiedyś wykonane na bazie danych.
* **Zakaz niszczenia danych**: Nowe tabele i kolumny muszą wspierać migrację starych rekordów (stosowanie wartości domyślnych lub dopuszczenie pól opcjonalnych `NULL`).

---

## Przepływ pracy Git i zatwierdzanie (Git Workflow)
* **Dozwolone gałęzie**: Pracuj wyłącznie na branchu `development`.
* **Zakazane polecenia**: Bez wyraźnego polecenia użytkownika zabrania się uruchamiania: `git reset --hard`, `git clean -fd`, `--force push` oraz `git rebase main`.
* **Zatwierdzanie commitów**: Nigdy nie wymyślaj wiadomości commitów samodzielnie. **Zawsze używaj dokładnie takiej wiadomości commita, jaka została zaakceptowana i zatwierdzona przez użytkownika.**

---

## Standard opisu zadania (Prompt Standard)
Każde zlecenie implementacyjne przekazywane do agenta lub tworzone w planie prac powinno zawierać ujednolicone sekcje:
1. **Kontekst (Context)**: Opis aktualnego stanu systemu i tła biznesowego.
2. **Cel (Goal)**: Co dokładnie ma zostać osiągnięte w wyniku zmiany.
3. **Kryteria akceptacji (Acceptance Criteria)**: Lista wymagań funkcjonalnych i wizualnych.
4. **Ograniczenia (Restrictions)**: Lista rzeczy, których nie wolno modyfikować.
5. **Weryfikacja (Verification)**: Sposób sprawdzenia poprawności wdrożenia (np. komendy build, testy manualne).
6. **Restrykcje Git (Git Restrictions)**: Dozwolone i niedozwolone operacje na repozytorium.
7. **Raport końcowy (Final Report)**: Specyfikacja danych wymaganych do zaprezentowania po zakończeniu pracy.

---

## Filozofia projektu (Project Philosophy)
Podczas prac programistycznych kierujemy się następującymi zasadami (preferencje projektowe):
* **Małe iteracje ponad duże zmiany**: Lepiej wdrażać mniejsze, łatwe do przetestowania paczki kodu.
* **Minimalne modyfikacje**: Koduj tylko to, co jest niezbędne. Unikaj nadmiarowego kodu i nadinterpretacji założeń.
* **Kompatybilność wsteczna**: Zapewnij działanie dotychczasowych funkcji i spójność bazy danych.
* **Proste rozwiązania ponad skomplikowane**: Wybieraj najbardziej przejrzyste podejście implementacyjne.
* **Częste kompilacje**: Buduj aplikację regularnie w trakcie pracy, aby natychmiast wykrywać błędy typów.
* **Częsta weryfikacja**: Testuj każdą drobną zmianę na bieżąco w przeglądarce.
* **Dokumentacja pisana z kodem**: Dokumentacja jest równorzędną częścią kodu i musi być aktualizowana w tym samym kroku.
