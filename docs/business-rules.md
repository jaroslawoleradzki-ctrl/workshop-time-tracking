# Reguły biznesowe

Dokument opisuje zachowanie zaimplementowane w API i interfejsie wersji 0.2.8.

## Role i dostęp

- Konto ma rolę `admin` albo `leader`; API odrzuca inne role przy tworzeniu i edycji użytkownika.
- Administrator zarządza użytkownikami, pracownikami, zleceniami, rodzajami czasu i importami. Lider ma w interfejsie zakładki Raportowanie i Raporty.
- Odczyt pracowników, zleceń, rodzajów czasu i raportów wymaga aktywnego konta oraz ważnego JWT. Token wygasa po 12 godzinach.
- Użytkownik nie może dezaktywować własnego konta ani odebrać sobie roli administratora.
- `User` i `Employee` są niezależnymi modelami. Kod nie przypisuje konta użytkownika do pracownika.

## Pracownicy i zlecenia

- Pracownik ma flagę `isActive` i opcjonalny `deletedAt`. Lista raportowania pobiera tylko aktywnych, nieusuniętych pracowników.
- Usunięcie pracownika ustawia `deletedAt` oraz `isActive=false`; rekord i historyczne raporty pozostają w bazie.
- Zlecenie ma status `OPEN`, `SUSPENDED` lub `CLOSED`, flagę `isActive` i opcjonalny `deletedAt`.
- W panelu raportowania dostępne są wyłącznie zlecenia `OPEN`, aktywne i nieusunięte. Odczyt historyczny zachowuje relacje do pozostałych zleceń.
- Usunięcie zlecenia ustawia `deletedAt` i status `CLOSED`. Przejście do `CLOSED` ustawia `completionDate`; ponowne otwarcie ją czyści.
- `plannedHours` jest zawsze wyliczane jako `quantity * hoursPerUnit`. Ilość musi być większa od zera, a godziny na jednostkę nieujemne.

## Rejestrowanie czasu

- Wpis wymaga daty, pracownika, liczby godzin większej od zera i istniejącego kodu rodzaju czasu pracy.
- Zlecenie jest wymagane tylko wtedy, gdy `WorkTimeType.requiresOrder=true`. Dla pozostałych typów API zapisuje `orderId=null`.
- Nowy wpis można utworzyć tylko dla aktywnego, nieusuniętego pracownika. Jeżeli typ wymaga zlecenia, API sprawdza istnienie nieusuniętego zlecenia; nie sprawdza jednak jego `status` ani `isActive` przy bezpośrednim wywołaniu API.
- Schemat bazy ogranicza godziny do `Decimal(4,2)`. Kod sprawdza jedynie wartość `> 0`; maksymalna wartość i liczba miejsc po przecinku przychodząca z API są **do potwierdzenia** na poziomie zachowania PostgreSQL/Prisma.
- Ostrzeżenia są miękkie: ponad 8 godzin kodu `G`, ponad 12 godzin łącznie i ponad 24 godziny łącznie. Interfejs pozwala wybrać „Ignoruj i zapisz”.
- Przy edycji ostrzeżenia pomijają aktualnie edytowany wpis. Edycja ustawia `modifiedByUserId`; data utworzenia i twórca pozostają bez zmian.
- Usunięcie wpisu ustawia `deletedAt`. Lider i administrator mogą tworzyć, edytować i usuwać wpisy, ponieważ trasy raportów nie mają dodatkowego ograniczenia roli.

## Kopiowanie poprzedniego dnia

- Operacja znajduje najnowszą datę wcześniejszą od daty docelowej, dla której istnieje jakikolwiek nieusunięty wpis w bazie, a następnie kopiuje wpisy z tej daty dla wszystkich pracowników.
- Nie jest to wyłącznie poprzedni dzień roboczy wybranego pracownika. Interfejs wysyła tylko datę, bez identyfikatora pracownika.
- Pomijane są wpisy pracowników usuniętych/nieaktywnych, zleceń usuniętych oraz nieistniejących typów czasu. Status i aktywność zlecenia nie są sprawdzane.
- Godziny i powiązania są kopiowane bez sprawdzenia ostrzeżeń i bez wykrywania duplikatów dnia docelowego.

## Audyt i daty

- `AuditLog` zapisuje `CREATE`, `UPDATE` i `DELETE` wraz z użytkownikiem oraz starymi/nowymi wartościami dla pracowników, zleceń i wpisów czasu. Importy również audytują tworzenie i aktualizację pracowników/zleceń.
- Zmiany użytkowników i rodzajów czasu nie są rejestrowane w `AuditLog`.
- Data raportu jest kolumną PostgreSQL `date`. API tworzy daty przez `new Date(...)`, a odpowiedzi formatuje przez UTC (`toISOString().split('T')[0]`). Przycisk „Dzisiaj” koryguje offset lokalny przeglądarki; początkowa data formularza używa bezpośrednio UTC. Jednolita biznesowa strefa czasowa nie jest skonfigurowana — **do potwierdzenia**.
