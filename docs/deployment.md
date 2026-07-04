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
Logi backendu po wdrożeniu można sprawdzić komendą:
```bash
docker logs worktime-api --tail=50
```

*Uwaga: Od wersji v0.2.4, proces instalowania pakietów npm oraz budowania wersji produkcyjnej frontendu (React) odbywa się w pełni automatycznie wewnątrz kontenera Docker (multi-stage build). Uruchomienie `docker compose up -d --build` samodzielnie pobiera zależności, kompiluje kod i serwuje pliki produkcyjne bez konieczności jakichkolwiek działań manualnych na maszynie hosta.*

## Kopia zapasowa (Backup)
Do tworzenia kopii zapasowej bazy danych służy skrypt `backup-db.sh` zlokalizowany w katalogu głównym:
```bash
./backup-db.sh
```
Skrypt ten:
- Tworzy katalog `backups/` (zignorowany w Git).
- Wykonuje `pg_dump` wewnątrz kontenera bazy danych `worktime-db` bez hardkodowania hasła (pobiera je ze zmiennych środowiskowych kontenera).
- Kompresuje wynik gzipem i zapisuje plik w formacie: `backups/time_reporting_YYYY-MM-DD_HH-MM-SS.sql.gz`.

## Przywracanie kodu (Rollback)
W przypadku awarii nowej wersji kodu aplikacji, można cofnąć kod do stabilnego stanu za pomocą skryptu `rollback.sh`:
```bash
./rollback.sh <commit_hash>
```
*Uwaga: Skrypt ten cofa wyłącznie kod aplikacji (Checkout kodu + przebudowanie kontenerów). Przywrócenie danych w bazie danych musi zostać wykonane osobno przy użyciu plików z katalogu `backups/`.*

### Ręczne przywrócenie bazy danych z backupu:
```bash
zcat backups/time_reporting_*.sql.gz | docker exec -i worktime-db psql -U time_user -d time_reporting
```

## Lista kontrolna wydania (Release Checklist)

Przed zakończeniem procesu publikacji nowej wersji i oznaczeniem jej jako ukończonej, należy sprawdzić poniższe punkty:
- [ ] Plik `CHANGELOG.md` został zaktualizowany o opis zmian w nowej wersji.
- [ ] Wersja została zsynchronizowana we wszystkich standardowych plikach (`package.json`, `package-lock.json`, `docker-compose.yml`, `README.md`).
- [ ] Kompilacja backendu przebiegła pomyślnie (`npm run build` w katalogu `backend/`).
- [ ] Kompilacja frontendu przebiegła pomyślnie (`npm run build` w katalogu `frontend/`).
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
chmod +x backup-db.sh rollback.sh backend/docker-entrypoint.sh
```

### 3. Kontener bazy danych nie startuje (port zajęty)
*Rozwiązanie*: Upewnij się, że port `5432` na hoście nie jest zajęty przez lokalną instalację PostgreSQL. W razie potrzeby zmień mapowanie portów w `docker-compose.yml`.
