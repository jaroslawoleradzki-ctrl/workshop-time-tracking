# Plan zmian wynikających z uwag klienta (sierpień 2026)

Dokument opisuje **cały dalszy zakres prac** zgłoszony przez klienta w sierpniu 2026.
Nie opisuje funkcji jako istniejących — to plan do realizacji w kolejnych pakietach.

---

## 1. Kontekst biznesowy

Klient ręcznie zweryfikował dane za sierpień 2026 i zgłosił rozbieżności w raportach oraz nowe wymagania biznesowe dotyczące kalendarza zakładowego i walidacji raportowania czasu.

Aktualna wersja development: **0.5.0** (poprawka filtrowania w Raporcie Szczegółowym).

---

## 2. Zgłoszone problemy

| # | Problem | Opis |
|---|---------|------|
| 1 | **Brak „art. 188” w raporcie okresów nieobecności** | Miesięczny raport czasu pracy uwzględnia 16h typu „art. 188”, a raport okresów nieobecności go nie pokazuje. |
| 2 | **Brak sum kontrolnych zamknięcia miesiąca** | Klient ręcznie sumuje godziny: 3168h (zlecenia) + 232h (L4) + 832h (UW) + 8h (UŻ) + 16h (art. 188) = 4256h. Aplikacja nie generuje takich sum automatycznie. |
| 3 | **Brak kalendarza zakładowego i walidacji dni wolnych** | Raportowanie czasu nie uwzględnia świąt, dodatkowych dni wolnych zakładu ani przeniesionych dni roboczych. |
| 4 | **Czytelność raportu HR / drugie zmiany** | Okresy nieobecności generowane oddzielnie, brak widocznych drugich zmian — *temat do dalszej analizy, nie do implementacji teraz*. |

---

## 3. Potwierdzone reguły biznesowe

### 3.1 Typy czasu pracy i `isAbsence`
- `WorkTimeType.isAbsence` jest **niezależną** flagą od `requiresOrder`.
- Wersja 0.4.7 automatycznie ustawiła `isAbsence=true` **tylko** dla: `UW`, `UOK`, `UŻ`, `L4`.
- Wszelkie niestandardowe typy nieobecności (np. „art. 188”, „CH”, „OPIEKA” itp.) **muszą zostać ręcznie oznaczone** przez administratora w Słowniku Rodzajów Czasu Pracy.

### 3.2 Raport okresów nieobecności
- Uwzględnia **wszystkie** typy z `isAbsence=true` (bez hardkodowania kodów).
- Łączy kolejne dni robocze (sobota/niedziela nie przerywają, nie liczone).
- Rozdziela okresy przy brakującym dniu roboczym.
- Deduplikuje wielokrotne wpisy tego samego typu w tym samym dniu.

### 3.3 Miesięczny raport pracowników
- Sumuje **wszystkie** aktywne wpisy (`deletedAt=null`) bez filtrowania po `requiresOrder` ani `orderId`.
- Suma „Suma godzin z nadgodzinami” = suma wszystkich godzin pracownika w okresie.

---

## 4. Pakiet 1 — Bug raportu nieobecności (AKTYWNY)

### Status: **DO ZREALIZOWANIA TERAZ**

### Problem
Klient utworzył typ „art. 188” (lub inny niestandardowy) ale nie oznaczył go jako `isAbsence=true`. Kod raportu poprawnie filtruje po `workTimeType.isAbsence=true`, więc typ nie pojawia się w raporcie.

### Rozwiązanie (tylko konfiguracja danych — BEZ zmiany kodu)
1. Administrator loguje się do systemu.
2. Przechodzi do **Administracja → Słownik Rodzajów Czasu Pracy**.
3. Znajduje kod „ART188” (lub tworzy nowy: Kod `ART188`, Nazwa `Art. 188 Kodeksu pracy`, `Wymaga zlecenia` = NIE, `Nieobecność` = **TAK**).
4. Jeśli kod istnieje: klika **Edytuj**, zaznacza **Nieobecność**, zapisuje.
5. Od teraz raport okresów nieobecności będzie uwzględniał ten typ.

> **Uwaga**: Nie modyfikujemy produkcyjnych danych klienta ani nie robimy migracji bazy. To ustawienie słownikowe kontrolowane przez admina.

### Test regresyjny (zaimplementowany w `analytics.test.ts`)
- Typ `ART188` z `isAbsence=true` + wpisy 2026-08-06 i 2026-08-07 → raport pokazuje jeden okres 2 dni robocze.
- Weryfikuje też: `UW` (mostkowanie weekendów), `UŻ` (pojedynczy dzień), `L4` (rozdzielanie przerwą), pomijanie typów `isAbsence=false` (np. `G`).
- Zabezpiecza rozwiązanie **ogólnie**, nie tylko dla literału „art. 188”.

### Weryfikacja
- `cd backend && npm test && npm run build` — OK
- `cd frontend && npm test && npm run lint && npm run build` — OK

---

## 5. Pakiet 2 — Sumy kontrolne zamknięcia miesiąca

### Status: **ZAPLANOWANY**

### Cel
Aplikacja generuje wartości kontrolne pozwalające użytkownikowi sprawdzić spójność raportów bez ręcznego przepisywania danych.

### Wymagania

| Element | Źródło danych | Gdzie pokazać |
|---------|---------------|---------------|
| Suma godzin wg zleceń (z nadgodzinami) | `report-by-order` → suma `actualHours` | Panel raportu / ekran podsumowania |
| Suma godzin bez nadgodzin | `report-by-employee` → `sumaBezNadgodzin` (suma po pracownikach) | Panel raportu |
| Suma nieobecności (wszystkie `isAbsence=true`) | `report-absence-periods` → suma `workingDays × 8h` LUB suma godzin z `work_time_reports` dla typów `isAbsence` | Panel raportu |
| **Suma łączna** (godziny zleceń + nieobecności) | Suma powyższych | Wyróżniona na dole / w kafelku |

### Zasady
- **Żadnego hardcodowania kodów** — suma nieobecności = suma godzin dla wszystkich typów, gdzie `workTimeType.isAbsence === true`.
- Nadgodziny (`NDR`, `NS`, kody zaczynające się od `ND`/`NS`, nazwa zawierająca „nadgodzin”) traktowane spójnie z logiką `sumaBezNadgodzin` w Raporze Pracowników.
- Wartości mają być **dostępne w API** (nowe endpointy lub rozszerzenie istniejących) i **wyświetlane w UI** (np. kafelki pod tabelami raportów).

### Wpływ
- **API**: nowe endpointy lub rozszerzenie `report-by-employee` / `report-absence-periods` o agregaty.
- **Frontend**: nowe kafelki / sekcja podsumowania w `ReportsView`.
- **Baza danych**: brak zmian.

---

## 6. Pakiet 3 — Kalendarz zakładowy i walidacja raportowania czasu

### Status: **ZAPLANOWANY**

### 6.1 Model danych — Kalendarz zakładowy

```prisma
model PlantCalendarDay {
  id        String   @id @default(uuid()) @db.Uuid
  date      DateTime @db.Date @unique
  dayType   DayType  @default(WORKING) // WORKING, HOLIDAY, PLANT_FREE, MOVED_WORKING
  name      String?  @db.VarChar(100)  // np. "Święto Wojska Polskiego", "Dzień wolny zakładu"
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("plant_calendar_days")
}

enum DayType {
  WORKING       // Zwykły dzień roboczy
  HOLIDAY       // Święto ustawowe (np. 1.11, 25.12)
  PLANT_FREE    // Dodatkowy dzień wolny ustalony przez zakład
  MOVED_WORKING // Sobota/ niedziela przeniesiona na dzień roboczy
}
```

### 6.2 Reguły domyślnego typu czasu pracy przy wybieraniu daty

| Dzień w kalendarzu | Domyślny typ | Możliwość zmiany przez użytkownika |
|--------------------|--------------|-----------------------------------|
| Zwykły roboczy (`WORKING`) | `G` — Standardowe | Tak, na dowolny **dozwolony** typ |
| Sobota / Niedziela / `HOLIDAY` / `PLANT_FREE` | `NS` — Nadgodziny sobota/niedziela | Tak, na dowolny **dozwolony** typ |
| `MOVED_WORKING` | `G` — Standardowe | Tak, na dowolny **dozwolony** typ |

> **Dozwolone typy** = wszystkie aktywne kody ze słownika. Blokada dotyczy tylko **domyślnego** wyboru i **walidacji zapisu**.

### 6.3 Walidacja zapisu (backend)

**Dla pojedynczego wpisu na konkretny dzień:**
- Jeśli dzień w kalendarzu = `HOLIDAY` lub `PLANT_FREE` lub weekend (bez `MOVED_WORKING`):
  - **ZABLOKOWAĆ** zapis typu `G` (Standardowe godziny).
  - **ZABLOKOWAĆ** zapis dowolnego typu z `isAbsence=true` (`UW`, `UŻ`, `UOK`, `L4`, `ART188` itp. — dynamicznie pobierane ze słownika).
  - **POZWOLIĆ** zapis typów wymagających zlecenia (`requiresOrder=true`) np. `NS`, `NDR`, `G` (jeśli pracownik faktycznie pracował w sobotę).

**Dla nieobecności w zakresie dat (absence-range):**
- Użytkownik podaje okres (np. L4 13.08–17.08).
- System **automatycznie pomija** przy naliczaniu dni/godzin wszystkie dni, które według kalendarza **nie są dniami roboczymi** (`WORKING` lub `MOVED_WORKING`).
- **Nie blokować** wprowadzania całego okresu tylko dlatego, że w jego środku występują dni wolne.
- Podgląd (preview) pokaże: dni kalendarzowe, dni robocze, pominięte dni wolne, sumę godzin.

### 6.4 Frontend
- Przy polu daty: wyświetl skrót dnia tygodnia (`pn`, `wt`, `śr`, `czw`, `pt`, `sob`, `nd`).
- Przy wyborze daty: automatycznie ustaw domyślny typ czasu pracy według powyższej tabeli.
- Użytkownik może ręcznie zmienić typ na inny dozwolony.
- Próba zapisu niedozwolonego typu w dzień wolny → komunikat błędu z wyjaśnieniem.

### 6.5 Panel administracyjny (Administrator)
- Nowa zakładka: **Kalendarz zakładowy**.
- Widok miesięczny (kalendarz) z możliwością kliknięcia dnia i zmiany typu:
  - Zwykły roboczy
  - Święto
  - Dzień wolny zakładu
  - Dzień roboczy (dla sobót/niedzieli)
- Masowe ustawianie świąt ustawowych na rok (można dodać w przyszłości).

### 6.6 Wpływ na raporty
- **Raport okresów nieobecności**: zamiast sztywnego pomijania sobót/niedzieli → korzysta z kalendarza (pomija `HOLIDAY`, `PLANT_FREE`, weekendy bez `MOVED_WORKING`).
- **Raport miesięczny pracowników**: bez zmian (sumuje wszystkie wpisy).
- **Kopiowanie poprzedniego dnia**: blokada na dni wolne z kalendarza (rozszerzenie obecnej logiki weekendowej).

### 6.7 Historyczne dane i kompatybilność wsteczna
- Kalendarz jest **pusty na starcie** (domyślnie: dni robocze pon–pt, weekendy sob/nd).
- Dla dat przed utworzeniem kalendarza: zachowanie zgodne z obecną logiką (pon–pt = robocze, sob/nd = wolne).
- Migracja: dodanie tabeli `plant_calendar_days`, seed z rocznym kalendarzem świąt ustawowych (opcjonalnie).
- **Nie resetować bazy**, nie edytować historycznych migracji.

### 6.8 Testy
- Jednostkowe: logika `nextWorkingDate` z kalendarzem, walidacja zapisu.
- Integracyjne: API `POST /reports` z kalendarzem, `POST /absence-range/preview` z pomijaniem dni wolnych.
- Frontend: wybór daty → domyślny typ, walidacja w formularzu.

---

## 7. Open Questions (do dalszej analizy)

| Temat | Opis | Decyzja |
|-------|------|---------|
| Raport HR — czytelność | Mała czytelność, okresy nieobecności generowane oddzielnie, brak widocznych drugich zmian | **OPEN** — klient zaznaczył: „można z tym żyć”, tematem do omówienia później |
| Drugie zmiany | Brak widoczności drugich zmian w raportach | **OPEN** — wymaga doprecyzowania wymagań |
| Import kalendarza | Czy importować kalendarz z pliku (Excel/CSV) lub generować automatycznie ze świąt? | **OPEN** — na razie ręczne w UI |

---

## 8. Ryzyka

| Ryzyko | Prawdopodobieństwo | Wpływ | Mitigacja |
|--------|-------------------|-------|-----------|
| Klient nie skonfiguruje `isAbsence` dla niestandardowych typów | Wysokie | Raport niepełny | Dodano informację w `business-rules.md` i instrukcję w tym planie (Pakiet 1) |
| Kalendarz zakładowy rozbudowany o święta zmieniane (Boże Ciało, Wielkanoc) | Średnie | Błędy w raporcie nieobecności | Seed z rocznymi świętami ustawowymi + ręczna edycja ruchomych świąt |
| Walidacja backendowa nieobsłużona w frontendzie | Niskie | Błędy 400 dla użytkownika | Spójna walidacja FE + BE, testy integracyjne |
| Migracja danych historycznych (absence-range z dniami wolnymi) | Niskie | Niezgodność starych raportów | Nowa logika dotyczy tylko nowych zapisów; historyczne dane niezmienione |

---

## 9. Wpływ na bazę danych

| Pakiet | Zmiany |
|--------|--------|
| 1 (Bug) | **Brak** (tylko konfiguracja słownika przez admina) |
| 2 (Sumy) | **Brak** (tylko nowe agregacje w API) |
| 3 (Kalendarz) | **Nowa tabela** `plant_calendar_days` + enum `DayType` — migracja `npx prisma migrate dev` |

---

## 10. Wpływ na API

| Pakiet | Endpointy |
|--------|-----------|
| 1 | Brak zmian |
| 2 | Nowe: `GET /api/analytics/monthly-checksums?dateFrom&dateTo` (propozycja) lub rozszerzenie istniejących |
| 3 | `GET /api/plant-calendar` (lista dni), `POST /api/plant-calendar` (zapis dnia), `PUT /api/plant-calendar/:date`; rozbudowa `POST /reports` (walidacja), `POST /absence-range/preview` (pomijanie dni wolnych z kalendarza) |

---

## 11. Wpływ na frontend

| Pakiet | Zmiany |
|--------|--------|
| 1 | Brak zmian (tylko instrukcja dla admina) |
| 2 | `ReportsView`: nowe kafelki sum kontrolnych pod tabelami / w panelu bocznym |
| 3 | `ReportingPanel`: skrót dnia tygodni przy dacie, domyślny typ z kalendarza, walidacja FE; `DictionariesView` / nowy widok: panel kalendarza zakładowego |

---

## 12. Wpływ na raporty

| Pakiet | Zmiany |
|--------|--------|
| 1 | Brak zmian w logice (już poprawna), tylko dane wejściowe |
| 2 | Nowe widżety sum kontrolnych w eksportach XLSX/CSV i w UI |
| 3 | Raport okresów nieobecności korzysta z kalendarza zamiast sztywnej logiki weekendów; kopiowanie dnia respektuje kalendarz |

---

## 13. Strategia testów

| Poziom | Pakiet 1 | Pakiet 2 | Pakiet 3 |
|--------|----------|----------|----------|
| Unit (backend) | Istnieje (nowy test regresyjny) | Nowe: testy agregacji sum | Nowe: `nextWorkingDate` z kalendarzem, walidacja `isAbsence` w dzień wolny |
| Unit (frontend) | N/A | Nowe: render sum kontrolnych | Nowe: domyślny typ przy dacie, komunikat błędu |
| Integracyjne (API) | Istnieje | Nowe: endpoint sum kontrolnych | Nowe: `POST /reports` z kalendarzem, `absence-range/preview` |
| E2E / Manualne | Sprawdzenie ręczne po konfiguracji admina | Weryfikacja sum z ręcznym policzeniem | Pełny scenariusz: kalendarz → raportowanie → raporty |

---

## 14. Kolejność wdrożeń

1. **Pakiet 1** — natychmiast (konfiguracja danych u klienta + test regresyjny w kodzie) ✅ **W TRAKCIE**
2. **Pakiet 2** — po ustaleniu szczegółów UI/UX sum kontrolnych z klientem
3. **Pakiet 3** — największy zakres, po Pakiecie 2; wymaga ustalenia: seed świąt, UI kalendarza, migracji

> Numery wersji **nie są przypisywane** bez decyzji użytkownika.

---

## 15. Status pakietów

| Pakiet | Status | Uwagi |
|--------|--------|-------|
| 1 — Bug raportu nieobecności | **W TRAKCIE** (test dodany, instrukcja gotowa) | Tylko konfiguracja danych; kod poprawny |
| 2 — Sumy kontrolne | **ZAPLANOWANY** | Wymaga doprecyzowania UI z klientem |
| 3 — Kalendarz zakładowy | **ZAPLANOWANY** | Wymaga migracji bazy, nowego API, UI, testów |
| HR / Drugie zmiany | **OPEN QUESTION** | Nie w zakresie implementacji |

---