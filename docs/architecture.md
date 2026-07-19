# Architektura systemu

Workshop Time Tracking jest aplikacją SPA z API i relacyjną bazą, wdrażaną jako trzy usługi Docker Compose.

```mermaid
flowchart LR
  U["Przeglądarka użytkownika"] -->|HTTP, statyczne pliki| N["Nginx / frontend"]
  U -->|/api, JSON, Bearer JWT| N
  N -->|reverse proxy /api| A["Express API"]
  A --> R["Routery i middleware"]
  R --> P["Prisma Client"]
  P --> D[("PostgreSQL")]
```

## Odpowiedzialności i warstwy

- React renderuje UI, przechowuje token i użytkownika w `localStorage`, stan nawigacji w `sessionStorage`, waliduje formularze i wywołuje względne `/api`.
- Nginx serwuje build SPA i przekazuje `/api` do backendu.
- Express składa middleware CORS/JSON/logowania, uwierzytelnianie JWT, kontrolę ról i routery: auth, users, employees, orders, work-time-types, reports, analytics, imports.
- Routery zawierają walidację i logikę biznesową oraz bezpośrednio wywołują Prisma; osobnej warstwy serwisów/repozytoriów nie ma.
- Prisma mapuje modele i migracje na PostgreSQL. Logger Pino zapisuje żądania i błędy na stdout/stderr.

## Model danych

```mermaid
erDiagram
  USER ||--o{ WORK_TIME_REPORT : creates
  USER ||--o{ WORK_TIME_REPORT : modifies
  USER ||--o{ AUDIT_LOG : causes
  USER ||--o{ IMPORT_HISTORY : performs
  EMPLOYEE ||--o{ WORK_TIME_REPORT : has
  ORDER o|--o{ WORK_TIME_REPORT : concerns
  WORK_TIME_TYPE ||--o{ WORK_TIME_REPORT : classifies
```

`User` nie jest powiązany z `Employee`. `WorkTimeReport` łączy pracownika, opcjonalne zlecenie, typ czasu i użytkowników tworzącego/modyfikującego. `Order` ma status, aktywność i plan godzin. `ImportHistory` przechowuje wynik importu, a `AuditLog` migawkę zmiany.

## Przepływy

Logowanie: React wysyła login i hasło do `/api/auth/login`; API wyszukuje aktywnego użytkownika, porównuje bcrypt i zwraca JWT ważny 12 godzin. Każde chronione żądanie weryfikuje podpis oraz aktualną aktywność konta w bazie.

```mermaid
sequenceDiagram
  actor L as Lider
  participant F as React
  participant A as Reports API
  participant P as Prisma/PostgreSQL
  L->>F: wybiera pracownika, datę, typ, zlecenie i godziny
  F->>A: POST /api/reports/check-warnings
  A->>P: suma aktywnych wpisów dnia
  P-->>A: godziny
  A-->>F: ostrzeżenia 8/12/24
  L->>F: potwierdza zapis
  F->>A: POST /api/reports
  A->>P: walidacja pracownika, typu i opcjonalnego zlecenia
  A->>P: utworzenie WorkTimeReport
  A->>P: utworzenie AuditLog
  A-->>F: wpis i ostrzeżenia
```

Import: Multer przechowuje plik w pamięci, SheetJS odczytuje pierwszy arkusz, router waliduje każdy wiersz i tworzy/aktualizuje rekord oraz audyt. Po pętli zapisuje `ImportHistory`. Nie ma transakcji całego pliku.

## Soft delete, audyt i błędy

`Employee`, `Order` i `WorkTimeReport` używają `deletedAt`; większość odczytów filtruje `null`. Usunięcie pracownika dodatkowo go dezaktywuje, a zlecenia ustawia na `CLOSED`. Import może przywrócić pracownika lub zlecenie.

AuditLog jest tworzony pomocniczą funkcją dla zmian pracowników, zleceń i wpisów. Błąd zapisu audytu jest logowany i nie cofa operacji biznesowej. Routery zwracają polskie komunikaty i odpowiednie kody 4xx/5xx; końcowy middleware obsługuje błędy nieprzechwycone. React pokazuje błędy lokalnie, a globalne 401/403 czyszczą sesję. Middleware ról zwraca niestandardowy kod 430 przy braku roli.

## Daty i wdrożenie

Daty raportów są przechowywane jako PostgreSQL `date`, pozostałe znaczniki jako `DateTime`. Kod miesza lokalne konstruktory `Date` z formatowaniem UTC; biznesowa strefa czasowa jest **do potwierdzenia**. Szczegóły uruchomienia zawierają [konfiguracja](configuration.md) i [wdrożenie](deployment.md).
