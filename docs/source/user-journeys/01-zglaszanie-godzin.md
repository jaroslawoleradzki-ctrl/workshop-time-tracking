---
title: "Scenariusz BIZ-01: Rejestracja Czasu Pracy na Zleceniu"
order: 1
roles: ["admin", "leader"]
componentIds: ["screen-reporting"]
screenshotIds: ["reporting-panel"]
diagramIds: ["raportowanie-czasu"]
lastUpdatedVersion: "0.4.4"
includeInUserManual: true
includeInAdminManual: false
---

# Scenariusz BIZ-01: Rejestracja Czasu Pracy na Zleceniu

## Przeznaczenie scenariusza
Przewodnik prowadzi krok po kroku przez proces zgłoszenia dziennego przepracowanego czasu pracownika halowego na aktywne zlecenie produkcyjne.

## Wymagania wstępne
- Użytkownik posiada rolę **Administrator** lub **Lider**.
- W systemie istnieje aktywne zlecenie w stanie `OPEN`.
- Pracownik jest widoczny na liście aktywnych pracowników.

## Diagram Przebiegu Procesu

![Diagram Raportowania Czasu](docs/images/diagrams/raportowanie-czasu.png)

## Sekwencja kroków realizacji

### Krok 1: Otwarcie Panelu Raportowania
Z menu bocznego po lewej stronie wybierz pozycję **Raportowanie**. Wyświetli się panel z aktualną datą roboczą.

### Krok 2: Wybór Pracownika i Zlecenia
1. W sekcji rejestracji z rozwijanej listy **Pracownik** wybierz osobę (np. `Nowak Piotr`).
2. W polu **Rodzaj czasu** pozostaw kod `G - Standardowe godziny pracy`.
3. Z listy **Zlecenie** wybierz zlecenie `ZL-2026-001`.

### Krok 3: Wprowadzenie Godzin i Zapis
1. W polu **Godziny** wpisz wartość `8.0`.
2. Jeżeli pracownik zgłosił brak przepustki fizycznej, zaznacz pole **Brak karty**.
3. Kliknij zielony przycisk **Zapisz wpis**.

## Oczekiwany rezultat
Wpis pojawi się w tabeli raportu dziennego dla wybranej daty, a suma godzin pracownika oraz wykorzystanie budżetu zlecenia ulegną automatycznej aktualizacji.
