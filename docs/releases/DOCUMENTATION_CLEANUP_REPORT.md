# Documentation Cleanup Report

Porządkowanie dokumentacji po w pełni zakończonym wydaniu v0.5.8: przeniesienie
historycznych raportów wersyjnych z katalogu głównego do `docs/releases/`.

* Timestamp: 2026-09-18 (UTC)
* Branch: development
* Commit SHA: a0bc3bbcf3b51d6014c55f2f8d3443c18084b34a (pre-amend; amended metadata-only to fix this field — authoritative SHA: `git log --format=%H -1`)

## Weryfikacja wydania v0.5.8 przed cleanup (warunek wstępny)

* v0.5.8 release COMPLETE: main == origin/main (`d35cd73`), tag `v0.5.8`
  wskazuje na commit wydania `d35cd73`, GitHub Release `v0.5.8` opublikowany
  (nie draft), `development` zsynchronizowany z `origin/development`,
  working tree clean.
* development był 1 commit ahead of main
  (`c263bcd docs(release): record v0.5.8 final release`) — oczekiwany stan
  po wydaniu. Brak niezakończonych prac wydaniowych.

## Stan plików Markdown w ROOT

* ROOT Markdown files BEFORE: 47
* ROOT Markdown files AFTER: 5
* Reports moved: 42

### Celowo pozostawione w ROOT

* AGENTS.md
* CHANGELOG.md
* DEPLOYMENT.md
* PROJECT_STATUS.md
* README.md

### Katalogi docelowe

* docs/releases/v0.5.2/ — 12 plików
* docs/releases/v0.5.3/ — 3 pliki
* docs/releases/v0.5.4/ — 7 plików
* docs/releases/v0.5.5/ — 3 pliki
* docs/releases/v0.5.6/ — 3 pliki
* docs/releases/v0.5.7/ — 6 plików
* docs/releases/v0.5.8/ — 8 plików

Pełna lista przeniesionych plików: patrz `git show --stat` commita cleanup
(42 czyste rename'y, 0 insertions / 0 deletions).

### Pliki niejednoznaczne celowo nietknięte

Brak. Wszystkie 42 pliki miały jednoznaczny prefiks wersji `V0.5.x_`.
Katalog `docs/reviews/` (starsze archiwum recenzji) pozostawiono bez zmian —
poza zakresem zadania (dotyczyło wyłącznie plików z ROOT).

## Zaktualizowane referencje

* Przeszukano całe repozytorium pod kątem odwołań do przeniesionych plików.
* Wynik: brak linków Markdown (`[...](V0.5...)`) i brak zależności skryptów
  od ścieżek root raportów. `README.md`, `PROJECT_STATUS.md`, `CHANGELOG.md`,
  `AGENTS.md`, `DEPLOYMENT.md`, `docs/session-start.md`,
  `docs/playbooks/RELEASE.md`, `scripts/verify-release.sh` — 0 odwołań.
* Wzmianki tekstowe wewnątrz samych raportów historycznych (cross-referencje)
  oraz komentarz w `frontend/src/test/ReportsView.test.tsx:1021` celowo
  pozostawiono bez zmian (historia; nie są to zależności ścieżek).

## Zmiany workflow (AGENTS.md / RELEASE.md)

* `docs/playbooks/RELEASE.md`: dodano podsekcję „Lokalizacja raportów wersji
  (Version Report Archive)" — przyszłe raporty wersyjne mają być tworzone
  bezpośrednio w `docs/releases/vX.Y.Z/` (np. v0.5.9 → `docs/releases/v0.5.9/`),
  a ROOT ma zawierać wyłącznie aktywną dokumentację projektu.
* `AGENTS.md`: bez zmian (odwołuje się do playbooka release).
* Dodatkowo utworzono indeks `docs/releases/README.md`.

## Walidacja

* `git status --short`: 42 rename'y (`R`), brak innych zmian kodu.
* `git diff --stat`: 42 files changed, 0 insertions(+), 0 deletions(-).
* `git diff --check` / `git diff --cached --check`: clean.
* `README.md`, `CHANGELOG.md`, `PROJECT_STATUS.md`, `AGENTS.md` w ROOT: TAK.
* Release playbook nadal ważny; skrypty release nieuszkodzone.
* `./scripts/verify-release.sh`: patrz wynik w raporcie końcowym zadania.
* Kompilacje backend/frontend: patrz wynik w raporcie końcowym zadania.

## Potwierdzenia bezpieczeństwa

* CONFIRMATION: no report was deleted (42/42 moved via `git mv`, contents unchanged).
* CONFIRMATION: v0.5.8 tag was NOT modified (no tag operations performed).
* CONFIRMATION: application code was NOT modified (docs-only change).
* CONFIRMATION: database schema untouched — DATABASE MIGRATION: NO.
* CONFIRMATION: API unchanged — API CHANGE: NO.
* CONFIRMATION: demo untouched — DEMO TOUCHED: NO.
* CONFIRMATION: client production untouched — CLIENT PRODUCTION TOUCHED: NO.
* CONFIRMATION: no force push, no branch deletions, no worktree changes.

## COMMIT

* Message: `docs: archive historical release reports`
* SHA: a0bc3bbcf3b51d6014c55f2f8d3443c18084b34a (pre-amend; amended metadata-only to fix this field — authoritative SHA: `git log --format=%H -1`)
