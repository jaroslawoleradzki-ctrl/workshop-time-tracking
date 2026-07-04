# Instrukcja Wdrożenia (Deployment)

Dokument opisuje proces instalacji, aktualizacji, backupu oraz przywracania aplikacji Workshop Time Tracking na serwerze produkcyjnym.

## Wymagania
- Serwer z systemem Linux (np. Ubuntu 22.04 LTS lub nowszy)
- Zainstalowany Docker oraz wtyczka Docker Compose v2
- Zainstalowany Git
- Dostęp do repozytorium kodu na GitHubie

## Pierwsza instalacja
1. Sklonuj repozytorium do katalogu docelowego:
   ```bash
   git clone https://github.com/jaroslawoleradzki-ctrl/workshop-time-tracking.git ~/workshop-time-tracking
   cd ~/workshop-time-tracking
   ```
2. Skopiuj i uzupełnij pliki konfiguracyjne środowiska `.env` w katalogach `backend/` oraz `frontend/` (jeśli są wymagane).
3. Utwórz zewnętrzny wolumen Docker dla bazy danych PostgreSQL (wymagane w konfiguracji produkcyjnej):
   ```bash
   docker volume create workshop-time-tracking-main_pgdata
   ```
4. Zbuduj i uruchom kontenery w tle:
   ```bash
   docker compose up -d --build
   ```
5. Zweryfikuj status kontenerów:
   ```bash
   docker ps
   ```

## Aktualizacja aplikacji
Aktualizacja kodu odbywa się poprzez pobranie zmian z gałęzi `main` i przebudowanie obrazów:
```bash
cd ~/workshop-time-tracking
git checkout main
git pull origin main
docker compose up -d --build
```

### Modyfikacje lokalne na serwerze (Local server modifications)
Serwery produkcyjne mogą zawierać celowe, lokalne modyfikacje plików konfiguracyjnych (np. zmiany portów w `docker-compose.yml` lub zmiennych środowiskowych). Obecność lokalnych zmian może spowodować błąd wykonania `git pull`.

Przed pobraniem aktualizacji należy zawsze wykonać:
```bash
git status
```
Jeśli w repozytorium znajdują się lokalne zmiany, zabezpiecz je poleceniem `stash`:
```bash
git stash push -m "server local config"
git pull origin main
git stash pop
```
*Uwaga: Wszelkie ewentualne konflikty scalania (merge conflicts) po wykonaniu `git stash pop` muszą zostać bezwzględnie rozwiązane przed kontynuowaniem procesu wdrożenia.*

### Weryfikacja po wdrożeniu (Post-deployment verification)
Zaraz po zakończeniu wdrożenia (uruchomieniu kontenerów), wykonaj poniższą sekwenckę poleceń w celu weryfikacji poprawności uruchomienia:
```bash
# Odczekaj 15 sekund na uruchomienie aplikacji i wykonanie migracji Prisma
sleep 15

# Zweryfikuj zwracaną wersję API
curl http://localhost/api/version

# Sprawdź status i zdrowie kontenerów
docker compose ps

# Sprawdź ostatnie 50 linii logów backendu pod kątem błędów
docker logs worktime-api --tail=50
```

**Co należy zweryfikować**:
- Czy polecenie `curl` zwraca prawidłowy obiekt JSON z nowo wdrożoną wersją aplikacji (np. `{"version":"v0.2.6"}`).
- Czy wszystkie kontenery mają status `running` (oraz czy baza `postgres` jest oznaczona jako `healthy`).
- Czy w logach `worktime-api` nie występują błędy połączenia z bazą danych (Connection Refused), niepowodzenia migracji Prisma lub wyjątki krytyczne Node.js.

*Uwaga: Od wersji v0.2.4/v0.2.5, proces instalowania pakietów npm oraz budowania wersji produkcyjnej frontendu (React) odbywa się w pełni automatycznie wewnątrz kontenera Docker (multi-stage build). Oznacza to, że wdrożenie nie wymaga już obecności w repozytorium skompilowanych plików frontendu. Uruchomienie `docker compose up -d --build` samodzielnie pobiera zależności, kompiluje kod i serwuje pliki produkcyjne bez konieczności jakichkolwiek działań manualnych na maszynie hosta. Katalog `frontend/dist` został całkowicie wykluczony z systemu kontroli wersji i nie powinien być nigdy zatwierdzany (committed) do repozytorium.*

## Kopia zapasowa (Backup)

Do tworzenia kopii zapasowej bazy danych PostgreSQL służy zautomatyzowany skrypt `backup-db.sh` zlokalizowany w katalogu głównym projektu.

### Funkcje skryptu `backup-db.sh`
Skrypt ten wykonuje następujące operacje podczas każdego uruchomienia:
1. **Automatyczne określenie ścieżki**: Skrypt automatycznie wykrywa katalog, w którym się znajduje, i przełącza się do niego (co umożliwia bezpieczne wywołanie skryptu z dowolnej ścieżki na hoście).
2. **Weryfikacja środowiska**: Przed wykonaniem kopii sprawdza, czy narzędzia `docker` oraz wtyczka `docker compose` są zainstalowane i dostępne.
3. **Kontrola kontenera bazy danych**: Weryfikuje, czy kontener bazy danych PostgreSQL (`worktime-db`) jest aktualnie uruchomiony. Jeśli nie, skrypt kończy działanie zwracając niezerowy kod błędu.
4. **Tworzenie katalogu backupu**: Jeśli katalog `backups/` nie istnieje, skrypt tworzy go automatycznie.
5. **Kompilacja i kompresja**: Wykonuje zrzut bazy `pg_dump` wewnątrz kontenera bez eksponowania hasła i kompresuje plik programem `gzip` na hoście.
6. **Rotacja plików kopii**: Automatycznie skanuje katalog `backups/` i usuwa pliki kopii starsze niż **30 dni** (retencja 30 dni) w celu ochrony serwera przed wyczerpaniem wolnego miejsca.
7. **Szczegółowe logowanie**: Każda operacja jest logowana do konsoli ze znacznikiem czasu oraz poziomem ważności (np. `[YYYY-MM-DD HH:MM:SS] INFO ...`).

### Ręczne wykonanie kopii (Manual backup)
Aby natychmiast utworzyć kopię zapasową bazy danych, uruchom z poziomu katalogu głównego projektu:
```bash
./backup-db.sh
```

### Lokalizacja i retencja
Wszystkie kopie zapasowe bazy danych są zapisywane w katalogu:
`backups/` (katalog ten jest zignorowany w systemie kontroli wersji Git).

Pliki są zapisywane z unikalnymi nazwami opartymi na dacie i godzinie: `time_reporting_YYYY-MM-DD_HH-MM-SS.sql.gz`.

Retencja wynosi **30 dni**. Starsze kopie są usuwane automatycznie przy kolejnych uruchomieniach skryptu.

### Automatyzacja (Cron)
Skrypt jest w pełni przystosowany do pracy w harmonogramie zadań `cron` (używa przełącznika `-T` w komendzie `docker compose exec`, który wyłącza emulację terminala TTY i zapobiega błędom w środowiskach nieinteraktywnych).

Automatyczne harmonogramowanie **nie jest domyślnie włączone**. Administrator serwera może je skonfigurować np. w systemowym crontabie:
```cron
# Uruchamiaj backup codziennie o 2:00 w nocy i zapisuj logi do pliku
0 2 * * * /sciezka/do/projektu/backup-db.sh >> /sciezka/do/projektu/backups/cron-backup.log 2>&1
```

### Rozwiązywanie problemów (Troubleshooting)
W przypadku niepowodzenia skryptu, w logach pojawi się szczegółowy opis błędu:
* **`ERROR Docker is not available...`**: Narzędzie Docker nie jest zainstalowane lub nie zostało dodane do zmiennej środowiskowej `$PATH` crona.
* **`ERROR PostgreSQL container (postgres) is not running...`**: Kontener bazy danych nie działa. Należy go uruchomić komendą `docker compose up -d postgres` i dopiero wtedy ponowić wykonanie kopii.

## Przywracanie kodu i bazy danych (Rollback)

W przypadku awarii nowej wersji kodu aplikacji, można cofnąć system do stabilnego stanu. Procedura ta składa się z dwóch niezależnych kroków:

### 1. Przywracanie kodu aplikacji
Cofnięcie kodu aplikacji do wybranego commita odbywa się za pomocą skryptu `rollback.sh`:
```bash
./rollback.sh <commit_hash>
```
*Uwaga: Skrypt ten cofa wyłącznie kod źródłowy aplikacji (wykonuje bezpieczny `git checkout` na wskazany commit po uprzedniej weryfikacji jego istnienia i przebudowuje kontenery za pomocą `docker compose up -d --build`). Nie modyfikuje on w żaden sposób bazy danych.*

### 2. Przywracanie bazy danych (Database Restore)
Przywrócenie bazy danych (w tym database rollback podczas cofania kodu) nie jest wykonywane automatycznie. W celu przywrócenia bazy z wybranego pliku kopii zapasowej `.sql.gz` należy użyć zautomatyzowanego skryptu `restore-db.sh`:
```bash
./restore-db.sh backups/time_reporting_YYYY-MM-DD_HH-MM-SS.sql.gz
```
Skrypt ten automatycznie weryfikuje istnienie pliku, dostępność narzędzi Docker/Compose oraz stan kontenera bazy danych, a następnie żąda wpisania słowa `YES` w celu potwierdzenia nadpisania dotychczasowych danych.

> [!CAUTION]
> Skrypt `restore-db.sh` **NIGDY** nie może być uruchamiany w środowisku produkcyjnym bez wcześniejszego upewnienia się, że wybrany plik kopii zapasowej (backupu) jest w 100% poprawny i dopasowany do schematu Prisma planowanej wersji aplikacji. Błędny plik kopii spowoduje całkowitą utratę danych produkcyjnych oraz runtime-crashe API.

Alternatywnie (w sytuacjach awaryjnych) można wykonać przywracanie bezpośrednio za pomocą potoku:
```bash
zcat backups/time_reporting_YYYY-MM-DD_HH-MM-SS.sql.gz | docker exec -i worktime-db psql -U time_user -d time_reporting
```
*Wskazówka: Zawsze upewnij się, że przywracany plik kopii zapasowej bazy danych odpowiada strukturze schematu bazy danych (Prisma schema) zawartej w wybranym do rollbacku commit hash.*

## Skrypt weryfikacji wydania (Release Verification Script)

Przed publikacją wersji produkcyjnej, deweloper lub agent powinien uruchomić skrypt automatycznej walidacji:
```bash
./scripts/verify-release.sh
```
Domyślnie weryfikuje czystość kodu w Git, zgodność wersji w plikach konfiguracyjnych/dokumentacji oraz poprawne kompilowanie backendu/frontendu. Aby dodatkowo zweryfikować poprawność składniową konfiguracji Docker Compose oraz obecność silnika Docker na serwerze hosta, należy wywołać skrypt z opcją:
```bash
./scripts/verify-release.sh --with-docker
```
Zwraca kod wyjścia `0` w przypadku powodzenia (PASS) lub `1` w przypadku wykrycia jakichkolwiek problemów (FAIL), przerywając proces wydania.

## Procedura testu dymnego (Smoke Test)

Po wdrożeniu nowej wersji na serwer produkcyjny, należy przeprowadzić ręczny test dymny (smoke test) według następujących kroków:
1. **Status kontenerów**:
   Zweryfikuj stan usług za pomocą polecenia:
   ```bash
   docker compose ps
   ```
   Upewnij się, że wszystkie kontenery są w stanie `running` (a baza danych w stanie `healthy`).
2. **Weryfikacja wersji API**:
   Wyślij zapytanie do endpointu wersji backendu:
   ```bash
   curl http://localhost/api/version
   ```
   Upewnij się, że zwrócony obiekt JSON zawiera poprawną, nowo wdrożoną wersję aplikacji.
3. **Weryfikacja wersji w przeglądarce**:
   Otwórz aplikację w przeglądarce. Na ekranie logowania sprawdź, czy wersja wyświetlana w dolnej części panelu logowania jest identyczna z wydaną wersją.
4. **Logowanie**:
   Zaloguj się do aplikacji z uprawnieniami administratora (`Administrator`).
5. **Nawigacja i ładowanie danych**:
   Przejdź kolejno po podstronach nawigacji:
   - **Dashboard** (Panel główny)
   - **Pracownicy** (Employees)
   - **Zlecenia** (Orders)
   - **Raporty** (Reports)
   - **Użytkownicy** (Users)
6. **Weryfikacja poprawności**:
   - Sprawdź, czy dane ładują się poprawnie (widoczne rekordy w tabelach, brak komunikatów o braku danych).
   - Potwierdź brak widocznych błędów frontendowych i backendowych (brak komunikatów błędów w konsoli przeglądarki lub w logach serwera).

## Lista kontrolna wydania (Release Checklist)

Przed zakończeniem procesu publikacji nowej wersji i oznaczeniem jej jako ukończonej, należy sprawdzić poniższe punkty:
- [ ] Plik `CHANGELOG.md` został zaktualizowany o opis zmian w nowej wersji.
- [ ] Wersja została zsynchronizowana we wszystkich standardowych plikach (`package.json`, `package-lock.json`, `docker-compose.yml`, `README.md`).
- [ ] Kompilacja backendu przebiegła pomyślnie (`npm run build` w katalogu `backend/`).
- [ ] Kompilacja frontendu przebiegła pomyślnie (`npm run build` w katalogu `frontend/`).
- [ ] Uruchomiono skrypt weryfikacji wydania `./scripts/verify-release.sh` i zakończył się on pomyślnie (status PASS).
- [ ] Zmiany z gałęzi `development` zostały zmergowane do gałęzi `main`.
- [ ] Gałąź `main` została wypchnięta na serwer zdalny (git push).
- [ ] Utworzono lokalnie opisany tag Git (git tag -a vX.Y.Z -m "Release X.Y.Z").
- [ ] Tag Git został wypchnięty na serwer zdalny (git push origin vX.Y.Z).
- [ ] Utworzono Wydanie (Release) na platformie GitHub na podstawie nowo utworzonego tagu.
- [ ] Wykonano kopię zapasową bazy danych PostgreSQL przed rozpoczęciem aktualizacji.
- [ ] Wdrożenie nowej wersji zostało zakończone sukcesem (docker compose up -d --build).
- [ ] Przeprowadzono test dymny (smoke test) na wersji produkcyjnej i potwierdzono poprawność działania aplikacji.

---

## Najczęstsze problemy

### 1. Baza danych jest pusta lub brak tabel po instalacji
*Rozwiązanie*: Prisma automatycznie wykonuje migracje przy każdym uruchomieniu kontenera `worktime-api` dzięki skryptowi `docker-entrypoint.sh`. Jeśli tabele nie powstały, sprawdź logi kontenera:
```bash
docker logs worktime-api
```
Upewnij się, że zmienna `DATABASE_URL` w `docker-compose.yml` wskazuje na poprawną nazwę hosta kontenera bazy (`postgres`).

### 2. Problem z uprawnieniami do wykonywania skryptów shellowych
*Rozwiązanie*: Nadaj skryptom uprawnienia wykonywania:
```bash
chmod +x backup-db.sh rollback.sh restore-db.sh backend/docker-entrypoint.sh scripts/verify-release.sh
```

### 3. Kontener bazy danych nie startuje (port zajęty)
*Rozwiązanie*: Upewnij się, że port `5432` na hoście nie jest zajęty przez lokalną instalację PostgreSQL. W razie potrzeby zmień mapowanie portów w `docker-compose.yml`.
