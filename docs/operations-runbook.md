# Runbook operacyjny

Szczegółowe wdrożenie, backup i rollback opisuje [deployment.md](deployment.md). Poniższe procedury służą diagnozie awarii.

## Aplikacja się nie otwiera

1. Sprawdź dostępność hosta i portu 80 oraz `docker compose ps`.
2. Sprawdź `curl -i http://localhost/api/health` i `/api/version`.
3. Zbierz logi `worktime-web` i `worktime-api`. Jeżeli UI działa, ale API nie, sprawdź konfigurację proxy Nginx i stan backendu.

## Backend restartuje się

1. Sprawdź liczbę restartów i `docker logs --tail=200 worktime-api`.
2. Zweryfikuj obecność rootowego `.env`, nazwy wymaganych `WTT_*`, dostępność bazy i wynik migracji startowej. Nie wypisuj zawartości `.env` ani wyrenderowanego `DATABASE_URL`.
3. Sprawdź pamięć oraz miejsce na dysku; nie uruchamiaj resetu Prisma.

## Baza danych nie działa

1. Sprawdź `docker compose ps postgres` oraz `docker logs --tail=200 worktime-db`.
2. Uruchom kontrolę z wartościami już dostępnymi wewnątrz kontenera: `docker compose exec postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`.
3. Sprawdź dokładną nazwę podłączonego wolumenu poleceniem `docker inspect worktime-db --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}'`, miejsce na dysku i zgodność danych dostępowych. Nie usuwaj ani nie zastępuj wolumenu i nie wykonuj `prisma migrate reset`.

## Błąd konfiguracji po `git pull`

1. Potwierdź, że istnieje rootowy `.env`, ma prawa `600` i jest ignorowany przez Git: `test -f .env`, `stat -c '%a %n' .env`, `git check-ignore .env`.
2. Uruchom `docker compose config >/dev/null`. Komunikat `${WTT_... is required}` oznacza brak wskazanej wartości; uzupełnij ją bez publikowania zawartości pliku.
3. Jeżeli problem dotyczy bazy, porównaj `WTT_POSTGRES_VOLUME` z faktycznie podłączonym wolumenem według procedury w [deployment.md](deployment.md). Nie uruchamiaj stosu z inną nazwą.
4. Odtwórz `.env` z szyfrowanej kopii, jeżeli plik został utracony. Nie kopiuj produkcyjnych sekretów do śledzonych plików.

Zmiana `WTT_JWT_SECRET` powoduje wylogowanie wszystkich użytkowników. Zmiana `WTT_POSTGRES_PASSWORD` w samym `.env` nie zmienia hasła roli w istniejącej bazie.

## Problemy po aktualizacji lub migracji

1. Zapisz wersję `/api/version`, SHA wdrożenia, status kontenerów i pełny błąd migracji.
2. Porównaj migracje obecnego wydania ze stanem `_prisma_migrations`; nie edytuj wykonanych migracji.
3. Jeśli migracja nie została zastosowana, usuń przyczynę i ponów bezpieczną procedurę z [deployment.md](deployment.md). Jeśli częściowo zmieniła dane, wstrzymaj ruch i oceń odtworzenie backupu.
4. Po aktualizacji wykonaj smoke test: logowanie, odczyt list, zapis/edycja/usunięcie wpisu, raport i eksport.

## Brak miejsca / brak backupu

- Sprawdź `df -h`, rozmiary logów Dockera, obrazów i katalogu backupów. Nie usuwaj wolumenów bazy. Zarchiwizuj lub usuń wyłącznie potwierdzone, zbędne artefakty zgodnie z retencją.
- Gdy backup nie powstał, zapisz kod wyjścia i stderr skryptu, sprawdź miejsce, uprawnienia katalogu, dostęp do kontenera i narzędzie `pg_dump`. Nie wdrażaj migracji destrukcyjnej bez zweryfikowanej kopii.

## Materiał do zgłoszenia

Dołącz: czas zdarzenia ze strefą, środowisko, wersję i SHA, kroki odtworzenia, oczekiwany/rzeczywisty wynik, kody HTTP, zanonimizowane logi API/Nginx/bazy, `docker compose ps`, wynik health checku, miejsce na dysku, ostatnią udaną kopię i ostatnią migrację. Usuń tokeny, hasła, connection stringi i dane klienta.

## Kiedy rollback

Rollback rozważ, gdy po wdrożeniu niedostępna jest krytyczna ścieżka, występuje utrata/niespójność danych, migracja nie może być bezpiecznie dokończona albo błąd bezpieczeństwa jest aktywnie wykorzystywany. Najpierw zabezpiecz logi i backup. Sam rollback kodu nie cofa schematu ani danych; zgodność poprzedniej wersji z aktualną bazą musi być potwierdzona.
