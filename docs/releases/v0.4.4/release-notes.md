---
title: "Release Notes — WERSJA v0.4.4"
generatedAt: "2026-08-02T12:00:00.000Z"
appVersion: "0.4.4"
---

# Informacje o Wydaniu (Release Notes) — v0.4.4

Data wygenerowania: 2026-08-02
Wersja systemu: **v0.4.4**

## Podsumowanie Zmian w Wersji 0.4.4

# Changelog

Wszystkie istotne zmiany w projekcie będą dokumentowane w tym pliku.
Format jest oparty na [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.4.4] - 2026-08-02

### Added

- Dodano funkcję eksportu aktualnie wyświetlanego widoku Bazy Zleceń do pliku Excel (.xlsx) na ekranie `OrdersView`.
- Wdrożono nowy endpoint backendowy `POST /api/orders/export-xlsx` z walidacją parametrów (Zod) oraz obsługą ról `admin` i `leader`.
- Odzwierciedlenie aktualnej frazy wyszukiwania (`searchQuery`), filtra statusu (`statusFilter`), pola sortowania (`sortField`) oraz kierunku sortowania (`sortOrder`) z zachowaniem stabilnego sortowania po `orderNumber`.
- Wydzielono wspólny moduł `backend/src/utils/excel-report.ts` z helperami generowania i formatowania pliku ExcelJS, z którego korzystają endpointy w `analytics.ts` oraz `orders.ts`.
- Wygenerowany plik XLSX zawiera pełne 16 osobnych kolumn danych biznesowych bez łączenia ilości z jednostką oraz bez technicznych pól/przycisków Akcje.
- Dodano pakiet testów backendowych oraz frontendowych potwierdzających poprawność eksportu, pobierania Bloba, wyznaczania nazwy pliku z `Content-Disposition` oraz brak wpływu na istniejące eksporty.

## [0.4.3] - 2026-08-02

### Added

- Dodano funkcję seryjnej rejestracji nieobecności w zakresie dat dla wybranego pracownika na ekranie Raportowania.
- Wdrożono nowy endpoint podglądu `POST /api/reports/absence-range/preview` zwracający szczegółowe podsumowanie (dni kalendarzowe, dni robocz

---

## Zweryfikowane Zakresy Funkcjonalne
- [x] Podstawowe logowanie oraz rejestracja sesji w trybie ciemnym i jasnym.
- [x] Pulpit Menedżerski (Dashboard) z wyliczaniem wskaźników budżetowych.
- [x] Rejestracja czasu pracy na zleceniach z oznaczeniem Braku Karty.
- [x] Rejestracja nieobecności zakresem dat z wykluczeniem wolnych weekendów.
- [x] Baza Zleceń Produkcyjnych z pełnym filtrowaniem i eksportem danych do XLSX.
- [x] Zarządzanie kontami użytkowników i rolami (Administrator / Lider).

© 2026 WARSZTAT System Raportowania Czasu Pracy. Wszystkie prawa zastrzeżone.
