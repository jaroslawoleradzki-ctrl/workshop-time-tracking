# Reguły biznesowe

Dokument opisuje zachowanie zaimplementowane w API i interfejsie wersji 0.5.0.

## Role i dostęp

- Konto ma rolę `admin` albo `leader`; API odrzuca inne role przy tworzeniu i edycji użytkownika.
- Administrator zarządza użytkownikami, pracownikami, zleceniami, rodzajami czasu i importami. Lider ma w interfejsie zakładki Raportowanie i Raporty.
- Odczyt pracowników, zleceń, rodzajów czasu i raportów wymaga aktywnego konta oraz ważnego JWT. Token wygasa po 12 godzinach.
- Użytkownik nie może dezaktywować własnego konta ani odebrać sobie roli administratora.
- `User` i `Employee` są niezależnymi modelami. Kod nie przypisuje konta użytkownika do pracownika.

## Pracownicy i zlecenia

- Pracownik ma flagę `isActive` i opcjonalny `deletedAt`. Lista raportowania pobiera tylko aktywnych, nieusuniętych pracowników.
- Lista pracowników w bazie pracowników jest sortowana alfabetycznie według nazwiska (A–Z), a przy identycznych nazwiskach pomocniczo według imienia. Zaimplementowano stabilne sortowanie na poziomie frontendu.
- Tabela pracowników zawiera pierwszą kolumnę "Lp." z kolejnymi, stabilnymi numerami wierszy (1, 2, 3, ...), odpowiadającymi aktualnemu widocznemu stanowi tabeli. Numery te nie są zapisywane w bazie danych.
- Usunięcie pracownika ustawia `deletedAt` oraz `isActive=false`; rekord i historyczne raporty pozostają w bazie.
- Zlecenie ma status `OPEN`, `SUSPENDED` lub `CLOSED`, flagę `isActive` i opcjonalny `deletedAt`.
- W panelu raportowania dostępne są wyłącznie zlecenia `OPEN`, aktywne i nieusunięte. Odczyt historyczny zachowuje relacje do pozostałych zleceń.
- Zmiana statusu na `CLOSED` bezwzględnie wymaga podania rzeczywistej daty zakończenia (`completionDate`); brak daty zwraca błąd walidacji `COMPLETION_DATE_REQUIRED` (HTTP 400). Ponowne otwarcie zlecenia (`CLOSED` -> `OPEN` / `SUSPENDED`) nie usuwa automatycznie wcześniej zapisanej daty. Usunięcie zlecenia (soft delete) ustawia `deletedAt` i status `CLOSED`.
- `plannedHours` jest zawsze wyliczane jako `quantity * hoursPerUnit`. Ilość musi być większa od zera, a godziny na jednostkę nieujemne.

## Rejestrowanie czasu

- Wpis wymaga daty, pracownika, liczby godzin większej od zera i istniejącego kodu rodzaju czasu pracy.
- Wpis raportu czasu może zostać oznaczony jako „Brak karty” (`missingCard`) w sytuacji, gdy pracownik nie posiadał lub nie użył karty podczas rejestracji czasu pracy. Wartość ta jest przechowywana w bazie danych jako pole logiczne (domyślnie `false`).
- Zlecenie jest wymagane tylko wtedy, gdy `WorkTimeType.requiresOrder=true`. Dla pozostałych typów API zapisuje `orderId=null`.
- `WorkTimeType.isAbsence` niezależnie klasyfikuje typ jako nieobecność. Flagi `isAbsence` i `requiresOrder` mogą przyjmować dowolną kombinację i zmiana jednej nie modyfikuje drugiej.
- Nowy wpis można utworzyć tylko dla aktywnego, nieusuniętego pracownika. Jeżeli typ wymaga zlecenia, API sprawdza istnienie nieusuniętego zlecenia; nie sprawdza jednak jego `status` ani `isActive` przy bezpośrednim wywołaniu API.
- Schemat bazy ogranicza godziny do `Decimal(4,2)`. Kod sprawdza jedynie wartość `> 0`; maksymalna wartość i liczba miejsc po przecinku przychodząca z API są **do potwierdzenia** na poziomie zachowania PostgreSQL/Prisma.
- Ostrzeżenia są miękkie: ponad 8 godzin kodu `G`, ponad 12 godzin łącznie i ponad 24 godziny łącznie. Interfejs pozwala wybrać „Ignoruj i zapisz”.
- Przy edycji ostrzeżenia pomijają aktualnie edytowany wpis. Edycja ustawia `modifiedByUserId`; data utworzenia i twórca pozostają bez zmian.
- Usunięcie wpisu ustawia `deletedAt`. Lider i administrator mogą tworzyć, edytować i usuwać wpisy, ponieważ trasy raportów nie mają dodatkowego ograniczenia roli.

## Kopiowanie poprzedniego dnia

- Operację mogą uruchomić role `admin` i `leader`. Interfejs wysyła identyfikator aktualnie wybranego pracownika oraz datę docelową.
- Źródłem jest najnowsza data wcześniejsza od docelowej, na której ten pracownik ma co najmniej jeden aktywny wpis. Wpisy usunięte logicznie oraz wpisy powiązane z usuniętym zleceniem nie są kopiowane.
- Pracownik musi istnieć, być aktywny i nieusunięty. Kopiowane są godziny, rodzaj czasu i opcjonalne zlecenie wyłącznie jego wpisów. Dotyczy to również nieobecności, takich jak UW i L4, gdy dniem docelowym jest dzień roboczy.
- Jeżeli data docelowa przypada w sobotę lub niedzielę, cała operacja jest odrzucana odpowiedzią `400 Bad Request` i kodem `WEEKEND_COPY_NOT_ALLOWED`, zanim powstaną jakiekolwiek wpisy. Blokada zależy od dnia docelowego, a nie od rodzaju wpisu źródłowego.
- Jeżeli dzień docelowy zawiera już aktywny wpis tego pracownika, cała operacja jest odrzucana odpowiedzią `409 Conflict`; nie ma trybu dopisywania, scalania ani nadpisywania.
- Maksymalny rozmiar źródła wynosi 100 aktywnych wpisów. Przekroczenie limitu kończy operację bez utworzenia danych.
- Blokada transakcyjna PostgreSQL dla pary `(employeeId, targetDate)` oraz ponowne sprawdzenie dnia po jej uzyskaniu chronią również przed równoległymi żądaniami z wielu kart, użytkowników i instancji API.
- Ustalenie źródła, utworzenie całego kompletu i jeden audyt operacji są objęte tą samą transakcją. Błąd dowolnego etapu wycofuje wszystkie nowe wpisy.
- Wersja 0.3.2 zachowuje dotychczasowe dopuszczenie prawidłowych przyszłych dat. Docelowa polityka raportowania przyszłości pozostaje **do potwierdzenia**.

### Kontrakt `POST /api/reports/copy-last-day`

Żądanie:

```json
{
  "employeeId": "20000000-0000-4000-8000-000000000001",
  "date": "2026-07-20"
}
```

Odpowiedź sukcesu (`201`) zawiera co najmniej `employeeId`, `sourceDate`, `targetDate` i `createdCount`. Nieprawidłowe dane zwracają `400`, niedostępny pracownik lub brak źródła `404`, niepusty cel `409`, a przekroczenie limitu `422`.

## Raport okresów nieobecności

- Raport uwzględnia wyłącznie aktywne wpisy (`deletedAt=null`) powiązane z typem czasu, dla którego `isAbsence=true`.
- Kolejne dni robocze jednego pracownika i jednego typu są łączone w okres; sobota i niedziela nie przerywają okresu i nie zwiększają liczby dni.
- Brak wpisu w dniu roboczym rozdziela okres, a wielokrotne wpisy tego samego typu w tym samym dniu są liczone jako jeden dzień.
- Filtr dat przycina dane przed grupowaniem. Wersja nie uwzględnia świąt ani indywidualnych harmonogramów pracowników.

## Raport zamknięcia zleceń

- Przełącznik „Raport zamknięcia” działa wewnątrz istniejącego raportu „Godziny wg zleceń” i wymaga prawidłowego, inkluzywnego zakresu dat.
- Wynik obejmuje zlecenia `OPEN` z dodatnią sumą aktywnych wpisów w okresie oraz zlecenia `CLOSED`, których `completionDate` mieści się w okresie — również wtedy, gdy suma godzin w okresie wynosi zero.
- Godziny sprzed lub po zakresie nie są uwzględniane. Usunięte wpisy nie zwiększają sumy, a usunięte zlecenia, zlecenia `SUSPENDED` i zlecenia zamknięte poza zakresem są wykluczone.
- W trybie zamknięcia wyszukiwanie numeru zlecenia pozostaje aktywne. Filtry statusu oraz „tylko z godzinami” są sprzeczne z definicją trybu, dlatego interfejs je wyłącza, a API ignoruje.
- `completionDate` jest porównywana jako data biznesowa w UTC, od początku `dateFrom` do końca `dateTo`, bez konwersji przez lokalną strefę czasową.

## Audyt i daty

- `AuditLog` zapisuje `CREATE`, `UPDATE` i `DELETE` wraz z użytkownikiem oraz starymi/nowymi wartościami dla pracowników, zleceń i wpisów czasu. Kopiowanie zapisuje jeden atomowy audyt całej operacji z identyfikatorem żądania, datami i licznikami. Importy również audytują tworzenie i aktualizację pracowników/zleceń.
- Zmiany użytkowników i rodzajów czasu nie są rejestrowane w `AuditLog`.
- Data raportu jest kolumną PostgreSQL `date`. API tworzy daty przez `new Date(...)`, a odpowiedzi formatuje przez UTC (`toISOString().split('T')[0]`). Przycisk „Dzisiaj” koryguje offset lokalny przeglądarki; początkowa data formularza używa bezpośrednio UTC. Jednolita biznesowa strefa czasowa nie jest skonfigurowana — **do potwierdzenia**.
