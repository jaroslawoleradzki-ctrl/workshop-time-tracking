# Backlog Produktu (Product Backlog)

Dokument zawiera historię wykonanych wersji oraz aktualne ustalenia projektu **Workshop Time Tracking**.

---

## Zrealizowane wersje 0.3.x

### Wersja 0.3.7 — Ujednolicenie nagłówków metadanych eksportów
- Standardowe wiersze metadanych przed tabelami raportów w plikach XLSX i CSV.

### Wersja 0.3.8 — Ujednolicenie formatu nazwy pracownika
- Ujednolicenie prezentacji nazwiska i imienia pracownika w miesięcznym raporcie czasu pracy na format `Nazwisko Imię` (np. `Kowalski Jan`) w widoku aplikacji, eksportach XLSX i CSV.
- Bezpieczny mechanizm fallback dla nazwiska/imienia bez tworzenia `undefined`, `null` czy podwójnych spacji.

### Wersja 0.3.9 — Poprawa głównego layoutu aplikacji (Do weryfikacji)
- Naprawa layoutu aplikacji: zamknięcie obszaru w viewport `100vh` z `body { overflow: hidden; }`.
- Górny navbar i boczny sidebar pozostają stale widoczne podczas przewijania obszaru `.content-wrapper`.
- Wyeliminowanie podwójnych suwaków pionowych.

---

## Dokumentacja

- Przygotowywanie i aktualizacja instrukcji użytkownika po wdrożeniu kolejnych zatwierdzonych wersji aplikacji.

---

## Planowane funkcjonalności po wersji 0.4.6

Uzgodniony backlog nowych wymagań biznesowych zgłoszonych przez klienta (szczegółowy opis w [`PROJECT_STATUS.md`](../PROJECT_STATUS.md)):

1. **Funkcjonalność 1 — Raport okresów nieobecności**
   - Nowy raport w Centrum raportów grupujący dni robocze nieobecności z eksportem XLSX i filtrowaniem.
2. **Funkcjonalność 2 — Pamiętanie filtrów raportów w ramach sesji**
   - Przechowywanie filtrów poszczególnych raportów w `sessionStorage` w ramach bieżącej sesji przeglądarki.


