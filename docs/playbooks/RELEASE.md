# Release Playbook — Standardowa Procedura Operacyjna (SOP)

Niniejszy dokument definiuje oficjalną, uniwersalną procedurę operacyjną (SOP) wykonywania i publikacji wydań (Release) w projekcie **Workshop Time Tracking**.

Procedura ma zastosowanie do wszystkich wydań wersji (zarówno `0.x.x`, `1.x.x`, jak i kolejnych) oraz obowiązuje wszystkich deweloperów i agenty AI pracujące w repozytorium.

---

## 1. Cel

Zapewnienie powtarzalnego, bezpiecznego i w pełni zweryfikowanego procesu publikacji nowej wersji aplikacji, gwarantującego czystość historii Git, spójność bazy danych oraz ciągłość działania środowisk produkcyjnych.

---

## 2. Zakres

Procedura obejmuje:
* Kontrolę spójności plików projektu i metadanych wersji,
* Zatwierdzenie (commit) i synchronizację gałęzi `development`,
* Scalenie (merge) zmian z gałęzi `development` do `main`,
* Kompleksową walidację jakościową kodu i bazy danych,
* Utworzenie i wysłanie adnotowanego taga Git (`v<TARGET_VERSION>`),
* Publikację oficjalnego wydania na platformie GitHub (GitHub Release),
* Zwrotne scalenie i synchronizację gałęzi `development` z `main`,
* Przygotowanie pełnego raportu z wydania.

---

## 3. Parametry Wejściowe

Przed rozpoczęciem procedury wydania należy ustalić i zweryfikować następujące parametry:

| Parametr | Opis | Przykład |
| :--- | :--- | :--- |
| `TARGET_VERSION` | Docelowy numer wersji zgodny z SemVer | `0.4.7`, `1.0.0` |
| `RELEASE_TITLE` | Tytuł wydania dla GitHub Release | `Workshop Time Tracking v0.4.7` |
| `SHOULD_COMMIT` | Czy istnieją niezatwierdzone zmiany z zakresu wersji (`TAK` / `NIE`) | `TAK` |
| `SHOULD_MERGE` | Czy wykonać scalenie `development` do `main` (`TAK` / `NIE`) | `TAK` |
| `SHOULD_PUBLISH_GITHUB_RELEASE` | Czy publikować wydanie w GitHub Release (`TAK` / `NIE`) | `TAK` |

---

## 4. Definition of Done (Kryteria Gotowości Wydania)

Procedurę wydania można rozpocząć i uznać za zakończoną **wyłącznie wtedy, gdy spełnione są poniższe kryteria**:

1. **Testy jednostkowe i integracyjne backendu**: `cd backend && npm test` kończy się sukcesem.
2. **Kompilacja backendu**: `cd backend && npm run build` kończy się sukcesem bez błędów TypeScript.
3. **Walidacja bazy danych**: `cd backend && npx prisma validate` oraz status migracji są poprawne.
4. **Testy automatyczne frontendu**: `cd frontend && npm test` kończą się sukcesem.
5. **Analiza statyczna frontendu (Lint)**: `cd frontend && npm run lint` przechodzi z wynikiem 0 ostrzeżeń/błędów.
6. **Kompilacja frontendu**: `cd frontend && npm run build` kończy się sukcesem.
7. **Skrypt walidacyjny wydania**: `./scripts/verify-release.sh` (opcjonalnie z `--with-docker`) zwraca status **PASS**.
8. **Akceptacja testu ręcznego**: Użytkownik przetestował nową wersję na środowisku lokalnym/testowym i wydał pisemną akceptację.
9. **Jawne polecenie wydania**: Użytkownik wydał wyraźną instrukcję przeprowadzenia procedury release.

---

## 5. Procedura Operacyjna (Krok po Kroku)

### Krok 1: Kontrola repozytorium
Przejdź do głównego katalogu projektu i wykonaj zestaw komend weryfikacyjnych:

```bash
pwd
git status
git fetch origin
git branch --show-current
git rev-parse HEAD
git rev-parse @{u}
git log -5 --oneline
git tag --list "v<TARGET_VERSION>"
```

**Weryfikacje:**
* Aktualny branch to `development`.
* Tag `v<TARGET_VERSION>` **nie istnieje** jeszcze ani lokalnie, ani zdalnie.
* Numer wersji w plikach (`backend/package.json`, `frontend/package.json`, `README.md`, `CHANGELOG.md`, `PROJECT_STATUS.md`, `docker-compose.yml`) jest jednolicie ustawiony na `<TARGET_VERSION>`.

---

### Krok 2: Commit (jeśli wymagany)
Jeżeli w drzewie roboczym znajdują się niezatwierdzone zmiany należące do zakresu wersji:

```bash
git add .
git commit -m "<typ>: <krótki opis zmian>"
```

> [!NOTE]
> Jeżeli drzewo robocze jest czyste (`working tree clean`), **nie twórz pustych commitów**.

---

### Krok 3: Push `development`
Wypchnij zatwierdzone zmiany na zdalną gałąź `development`:

```bash
git push origin development
```

Potwierdź, że stan lokalny `development` jest identyczny ze zdalnym `origin/development`.

---

### Krok 4: Merge do `main`
Przełącz się na gałąź `main`, pobierz najnowszy stan i wykonaj scalenie:

```bash
git checkout main
git pull --ff-only origin main
git merge --no-ff development -m "Merge development for release v<TARGET_VERSION>"
```

> [!CAUTION]
> Jeżeli podczas scalania wystąpi konflikt — **ZATRZYMAJ SIĘ NATYCHMIAST**, pokaż konflikt użytkownikowi i nie rozwiązuj go automatycznie.

---

### Krok 5: Walidacja po merge
Na gałęzi `main` uruchom pełny zestaw weryfikacyjny:

```bash
# Backend
cd backend && npm test && npm run build && npx prisma validate && cd ..

# Frontend
cd frontend && npm test && npm run lint && npm run build && cd ..

# Skrypt walidacyjny
./scripts/verify-release.sh
```

Wszystkie etapy muszą zakończyć się statusem powodzenia.

---

### Krok 6: Push `main`
Wypchnij scaloną gałąź `main` na zdalne repozytoria:

```bash
git push origin main
```

---

### Krok 7: Utworzenie i wysłanie taga Git
Utwórz adnotowany tag wydania i wypchnij go na serwer:

```bash
git tag -a v<TARGET_VERSION> -m "Release v<TARGET_VERSION>"
git push origin v<TARGET_VERSION>
```

---

### Krok 8: GitHub Release
Za pomocą GitHub CLI (`gh`) utwórz oficjalne wydanie z wygenerowanym opisem zmian:

```bash
gh release create v<TARGET_VERSION> \
  --title "Workshop Time Tracking v<TARGET_VERSION>" \
  --notes-file release_notes_v<TARGET_VERSION>.md
```

> [!IMPORTANT]
> Wydanie musi zostać opublikowane bezpośrednio (nie jako *draft* i nie jako *prerelease*). Po pomyślnej publikacji usuń tymczasowy plik `release_notes_v<TARGET_VERSION>.md`.

---

### Krok 9: Synchronizacja gałęzi `development`
Przełącz się z powrotem na gałąź `development` i zaktualizuj ją o commit scalający z `main`:

```bash
git checkout development
git merge main
git push origin development
```

---

### Krok 10: Raport końcowy
Przedstaw użytkownikowi raport zawierający:
* SHA commita na gałęzi `development`,
* SHA merge commita na gałęzi `main`,
* SHA utworzonego taga `v<TARGET_VERSION>`,
* Status wykonania `git push origin development`,
* Status wykonania `git push origin main`,
* Direct URL do GitHub Release,
* Wynik polecenia `git status`,
* Potwierdzenie spełnienia checklisty 6 punktów weryfikacyjnych (patrz sekcja 8).

---

## 6. Kryteria Zatrzymania Procedury (Stop Conditions)

Agent ma **obowiązek natychmiast przerwać procedurę** i zgłosić błąd użytkownikowi, jeżeli wystąpi chociaż jeden z poniższych warunków:

1. **Konflikt Git**: Wystąpienie konfliktu scalania (`merge conflict`) podczas `git merge`.
2. **Błąd testów**: Jakikolwiek test jednostkowy lub integracyjny backendu lub frontendu zwróci status niepowodzenia.
3. **Błąd kompilacji**: Kompilacja backendu (`npm run build`) lub frontendu (`npm run build`) zgłosi błąd typów/składni.
4. **Błąd lintera**: Analiza ESLint na frontendzie (`npm run lint`) wykaże jakiekolwiek ostrzeżenia lub błędy (`max-warnings 0`).
5. **Błąd bazy danych**: `npx prisma validate` lub weryfikacja migracji zwróci błąd.
6. **Nieznane pliki / dirty tree**: Drzewo robocze zawiera niezidentyfikowane pliki lub modyfikacje spoza ustalonego zakresu wersji.
7. **Niespójność wersji**: Numer wersji w plikach projektu jest różny w poszczególnych modułach.
8. **Istniejący tag**: Tag `v<TARGET_VERSION>` już istnieje w repozytorium lokalnym lub na `origin`.
9. **Istniejące wydanie**: Release dla wersji `v<TARGET_VERSION>` został już utworzony na GitHubie.
10. **Brak akceptacji ręcznej**: Użytkownik nie potwierdził wcześniejszego przejścia testu ręcznego lub nie zlecił wykonania wydania.

---

## 7. Instrukcja Generowania Release Notes

Release Notes **nie mogą być pisane ręcznie ani zmyślane**. Agent przygotowuje plik z opisem zmian automatycznie przed Krokiem 8, analizując źródła:
1. Plik [CHANGELOG.md](../../CHANGELOG.md) (sekcja dla danej wersji),
2. Plik [PROJECT_STATUS.md](../../PROJECT_STATUS.md),
3. Historię commitów Git od ostatniego opublikowanego taga: `git log <PREV_TAG>..HEAD --oneline`.

### Kanoniczne Sekcje Release Notes:

```markdown
## ✨ New
- List dodanych nowych funkcjonalności biznesowych i technicznych.

## 🛠 Improvements
- Lista ulepszeń i optymalizacji istniejących funkcji.

## 🐞 Fixes
- Lista naprawionych błędów i poprawek regresji.

## 🧪 Quality
- Rozbudowa testów, konfiguracji lintera, weryfikacji migracji bazy danych.

## 📚 Documentation
- Aktualizacja dokumentacji technicznej, podręcznika użytkownika i specyfikacji.
```

> [!RULE]
> **Zasada pomijania pustych sekcji**: Jeżeli w danej wersji nie wprowadzano zmian z danej kategorii (np. brak poprawek `🐞 Fixes`), odpowiednią sekcję **należy całkowicie pominąć** w ostatecznym pliku Release Notes.

---

## 8. Checklista Weryfikacji Wynikowej

Na zakończenie raportu wydania agent musi przedstawić weryfikację 6 kluczowych wskaźników:

- [ ] `development == origin/development`
- [ ] `main == origin/main`
- [ ] Tag `v<TARGET_VERSION>` istnieje lokalnie
- [ ] Tag `v<TARGET_VERSION>` istnieje zdalnie na `origin`
- [ ] GitHub Release dla `v<TARGET_VERSION>` został opublikowany
- [ ] Drzewo robocze jest czyste (`working tree clean`)
