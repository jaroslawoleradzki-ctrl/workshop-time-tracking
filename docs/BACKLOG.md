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

## Wersja 0.4.7 — Raport okresów nieobecności

- [x] Jawna klasyfikacja `WorkTimeType.isAbsence` niezależna od wymagania zlecenia.
- [x] Agregacja kolejnych dni roboczych nieobecności z pomijaniem weekendów i duplikatów.
- [x] Filtry zakresu dat, pracownika i rodzaju nieobecności oraz eksport XLSX.

## Wersja 0.4.8 — Pamiętanie filtrów raportów w ramach sesji

- [x] Wspólny, wersjonowany mechanizm przechowywania filtrów w `sessionStorage`.
- [x] Osobny zestaw wszystkich istniejących filtrów dla każdego raportu.
- [x] Odtwarzanie po zmianie widoku i odświeżeniu strony oraz reset aktywnego raportu.
