# Rozpoczęcie sesji projektowej

Procedura obowiązuje przed powrotem do projektu po przerwie, rozpoczęciem nowej funkcjonalności, naprawy błędu, przygotowaniem wydania oraz przekazaniem pracy pomiędzy ChatGPT i Codexem.

---

## Cel

Zapewnienie, że agent pracuje na aktualnym kodzie, właściwej gałęzi i zna bieżący stan projektu.

Procedura ma zapobiegać:

- pracy na nieaktualnym kodzie,
- nadpisaniu zmian,
- rozpoczęciu implementacji bez znajomości kontekstu,
- przygotowaniu dokumentacji niezgodnej z implementacją,
- wykonywaniu niebezpiecznych operacji Git bez zgody użytkownika.

---

# Zakres procedury

Procedura obowiązuje zarówno ChatGPT, jak i Codexa.

Każdy agent wykonuje część czynności zgodnie ze swoimi możliwościami.

### ChatGPT odpowiada za:

- analizę stanu projektu,
- analizę dokumentacji,
- analizę historii repozytorium,
- przygotowanie planu pracy,
- ocenę ryzyk,
- przygotowanie instrukcji dla Codexa.

### Codex odpowiada za:

- analizę lokalnego repozytorium,
- kontrolę stanu Git,
- implementację zmian,
- uruchamianie testów,
- przygotowanie commitów zgodnie z poleceniami użytkownika.

---

# Procedura po stronie ChatGPT

ChatGPT powinien:

1. Sprawdzić stan repozytorium na GitHubie.
2. Zweryfikować relację pomiędzy gałęziami roboczymi (zgodnie z polityką projektu).
3. Odczytać:

   - AGENTS.md
   - CHANGELOG.md
   - PROJECT_STATUS.md (jeżeli istnieje)
   - README.md
   - dokumentację dotyczącą zadania

4. Sprawdzić ostatnie commity.
5. Ustalić:

   - aktualną wersję,
   - ostatnio zakończone funkcjonalności,
   - bieżący stan projektu.

6. Przygotować raport rozpoczęcia sesji.

Jeżeli którykolwiek z wymaganych dokumentów nie istnieje, ChatGPT nie tworzy jego treści na podstawie przypuszczeń. Brak należy wskazać w raporcie.

---

# Procedura po stronie Codexa

Codex rozpoczyna pracę w katalogu głównym repozytorium.

W pierwszej kolejności wykonuje:

```bash
git status
git fetch origin
git branch --show-current
git rev-parse HEAD
git rev-parse @{u}
git log -5 --oneline
```

Następnie:

1. Potwierdza aktywną gałąź.
2. Porównuje lokalny HEAD z gałęzią śledzoną.
3. Analizuje wynik git status.
4. Odczytuje:

   - AGENTS.md
   - CHANGELOG.md
   - PROJECT_STATUS.md (jeżeli istnieje)
   - README.md
   - dokumentację dotyczącą zadania
   - kod związany z zadaniem

5. Przygotowuje raport rozpoczęcia sesji.
6. Rozpoczyna implementację dopiero po potwierdzeniu, że stan repozytorium jest bezpieczny.

Polecenie `git fetch origin` aktualizuje wyłącznie informacje o repozytorium zdalnym.

Codex nie wykonuje automatycznie:

- merge,
- rebase,
- reset,
- stash,
- commit,
- push,

jeżeli nie wynika to jednoznacznie z polecenia użytkownika.

---

# Raport rozpoczęcia sesji

Raport powinien zawierać co najmniej:

- Projekt
- Aktualna wersja
- Aktywna gałąź
- Stan gałęzi względem origin
- Working tree
- Ostatni commit
- Ostatnio ukończone prace
- Obecne zadanie
- Ryzyka lub blokady
- Gotowość do rozpoczęcia pracy

---

# Ustalenie celu sesji

Przed rozpoczęciem implementacji agent powinien jednoznacznie określić:

- cel bieżącej sesji,
- oczekiwany rezultat,
- zakres prac,
- czy zadanie jest kontynuacją wcześniejszych zmian,
- czy rozpoczynana jest nowa funkcjonalność.

Jeżeli zakres nie jest jednoznaczny, agent powinien poprosić użytkownika o doprecyzowanie przed rozpoczęciem implementacji.

---

# Kontrola dokumentacji

Przed rozpoczęciem implementacji agent powinien ocenić, czy planowane zmiany będą wymagały aktualizacji:

- README.md,
- CHANGELOG.md,
- dokumentacji użytkownika,
- dokumentacji architektury,
- dokumentacji API,
- PROJECT_STATUS.md,
- innych dokumentów powiązanych z modyfikowaną funkcjonalnością.

---

# Przekazanie pomiędzy ChatGPT i Codexem

Przekazanie powinno zawierać co najmniej:

- repozytorium,
- oczekiwaną gałąź,
- SHA ostatniego commita,
- informację, czy commit został wysłany do repozytorium zdalnego,
- listę zmodyfikowanych plików,
- listę niezatwierdzonych zmian,
- wykonane testy,
- wyniki testów,
- decyzje wymagające potwierdzenia,
- wykryte problemy,
- następny rekomendowany krok,
- ograniczenia dotyczące commitów, push, migracji lub danych.

Agent odbierający zadanie zawsze wykonuje pełną procedurę rozpoczęcia sesji i nie opiera się wyłącznie na raporcie przekazania.

---

# Kryteria zatrzymania

Agent powinien zatrzymać pracę i poprosić użytkownika o decyzję, jeżeli:

- aktywna gałąź jest niezgodna z oczekiwaną,
- working tree zawiera nieznane zmiany,
- historia lokalna i zdalna jest rozbieżna,
- nie można zweryfikować aktualności repozytorium,
- instrukcje użytkownika są sprzeczne z AGENTS.md,
- istnieje ryzyko utraty danych,
- planowane działania wymagają operacji destrukcyjnych.

---

# Zakończenie sesji

Przed uznaniem zadania za zakończone agent powinien potwierdzić, że:

- zakres zadania został zrealizowany,
- kod został zweryfikowany,
- projekt kompiluje się (jeżeli dotyczy),
- testy zakończyły się powodzeniem (jeżeli istnieją),
- dokumentacja została zaktualizowana (jeżeli było to wymagane),
- PROJECT_STATUS.md został zaktualizowany (jeżeli zmienił się stan projektu),
- użytkownik otrzymał podsumowanie wykonanych zmian.

Jeżeli użytkownik nie wyraził zgody, agent nie wykonuje commita ani push.