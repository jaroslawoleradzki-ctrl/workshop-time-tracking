# Baza danych i seed środowiska demonstracyjnego

Dokument opisuje przeznaczenie, strukturę oraz procedurę uruchamiania deterministycznego seeda danych demonstracyjnych dla aplikacji LaserCAD.

> [!WARNING]
> Skrypt seedowania demo (`seed-demo.ts`) jest operacją destrukcyjną. Przed wstawieniem nowych rekordów całkowicie czyści dane w bazie (użytkowników, pracowników, zlecenia, raporty czasu pracy, historię importów oraz logi audytu).

## Zabezpieczenie przed przypadkowym uruchomieniem

W celach bezpieczeństwa skrypt seedujący demo posiada wbudowane zabezpieczenie walidujące nazwę bazy danych podaną w zmiennej środowiskowej `DATABASE_URL`:
* Skrypt uruchomi się **wyłącznie** wtedy, gdy nazwa bazy danych (wskazana w ścieżce URL) kończy się przyrostkiem `_demo` (np. `time_reporting_demo`).
* W przypadku próby uruchomienia na głównej bazie produkcyjnej/roboczej (np. `time_reporting`), skrypt natychmiast przerwie działanie z błędem i nie dokona żadnych modyfikacji.

## Krok po kroku: Przygotowanie i uruchomienie bazy demonstracyjnej

### 1. Utworzenie osobnej bazy danych w PostgreSQL
Zaloguj się do swojej instancji PostgreSQL i utwórz nową, pustą bazę danych o nazwie kończącej się na `_demo`:
```sql
CREATE DATABASE time_reporting_demo;
```

### 2. Skonfigurowanie pliku środowiskowego
Zaleca się stworzenie osobnego pliku środowiskowego dla demo (np. `backend/.env.demo`), aby nie nadpisywać produkcyjnego `DATABASE_URL`. Przykładowa zawartość:
```env
DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/time_reporting_demo?schema=public"
JWT_SECRET="demo-jwt-secret-key-32-chars-minimum"
```

### 3. Wykonanie migracji struktury bazy danych
Przed uruchomieniem seeda należy upewnić się, że struktura tabel w nowej bazie demonstracyjnej jest aktualna. Wykonaj migracje Prisma, wskazując plik konfiguracyjny demo:
```bash
cd backend
ENV_FILE=.env.demo npx prisma migrate deploy
```

### 4. Uruchomienie skryptu seedującego demo
Uruchom dedykowaną komendę seedowania z podaniem zmiennych środowiskowych:
```bash
DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/time_reporting_demo?schema=public" npm run seed:demo
```
*(Upewnij się, że przekazany `DATABASE_URL` kieruje do bazy z końcówką `_demo`)*.

## Zawartość danych demonstracyjnych

Po pomyślnym wykonaniu seeda, w bazie demonstracyjnej zostaną utworzone następujące dane:

### Konta użytkowników
Hasła do obu kont demonstracyjnych są zahaszowane przy użyciu algorytmu `bcrypt`:
1. **Administrator:**
   * Login: `demo`
   * Hasło: `LaserCAD2026!`
   * Rola: `admin`
2. **Lider:**
   * Login: `leader`
   * Hasło: `LaserCAD2026!`
   * Rola: `leader`

### Pracownicy
Utworzonych zostaje 15 unikalnych, aktywnych pracowników z polskimi danymi personalnymi (np. *Adam Nowak*, *Bartosz Mazur*, *Cezary Wójcik* itd.) z przypisanymi kolejno numerami od `EMP-001` do `EMP-015`.

### Słowniki
Wdrożone są standardowe typy czasu pracy:
* `G` – Standardowe godziny (wymaga zlecenia)
* `NDR` – Nadgodziny (wymaga zlecenia)
* `NS` – Nadgodziny weekendowe (wymaga zlecenia)
* `UW` / `UOK` / `UŻ` / `L4` – Nieobecności i urlopy (nie wymagają zlecenia)

### Zlecenia
Zostaje utworzonych 30 deterministycznych zleceń o numeracji `LC-2026-001` do `LC-2026-030` z branży LaserCAD (obróbka metalu, np. *Rama urządzenia transportowego*, *Obudowa sterownika CNC*).
* 20 zleceń ma status aktywny (`OPEN` lub `SUSPENDED`).
* 10 zleceń ma status zakończony (`CLOSED`) wraz z ustawioną datą zakończenia (`completionDate`).

### Raporty czasu pracy (Wpisy)
Wygenerowano kompletny, deterministyczny (stały seed generatora pseudolosowego) rejestr czasu pracy za okres **od 2026-05-01 do 2026-07-22** (około 3 miesiące):
* W dni robocze pracownicy mają zaraportowane po 8 godzin pracy typu `G`, rozbitych na 1 do 3 zleceń aktywnych w danym dniu.
* Dodano sporadyczne nadgodziny `NDR` (1-2 godziny).
* Dodano losowe, kilkudniowe lub jednodniowe nieobecności (urlopy `UW`, zwolnienia chorobowe `L4`, urlopy okolicznościowe i na żądanie) – w dniach nieobecności nie są generowane godziny produkcyjne.
* W wybrane soboty przypisano okazjonalną pracę w nadgodzinach weekendowych `NS` (4, 6 lub 8 godzin).
* Wprowadzono naturalne występowanie flagi `missingCard` (brak karty) na poziomie około 3-5% wpisów.
