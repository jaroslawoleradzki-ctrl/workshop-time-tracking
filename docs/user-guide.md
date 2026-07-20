# Instrukcja użytkownika

## Lider

### Logowanie i nawigacja

Otwórz aplikację, wpisz login i hasło, wybierz **Zaloguj się**. Po zalogowaniu lider ma dostęp do **Raportowania** i **Raportów**. Pasek górny pozwala zmienić motyw i się wylogować.

> **Zrzut ekranu do wstawienia:** formularz logowania z pustymi polami Login i Hasło oraz widocznym przyciskiem Zaloguj się.

### Rejestrowanie czasu

1. W Raportowaniu wybierz datę lub przycisk **Dzisiaj**.
2. Wyszukaj pracownika po nazwie lub identyfikatorze; możesz użyć przycisków poprzedni/następny.
3. Wybierz rodzaj czasu. Jeśli wymaga zlecenia, wyszukaj aktywne zlecenie po numerze, produkcie lub koncie.
4. Wprowadź dodatnią liczbę godzin i zapisz. Klawisze strzałek i Enter obsługują listy i przejście do pola godzin.

> **Zrzut ekranu do wstawienia:** panel Raportowanie z wybranym pracownikiem i datą, otwartą listą pasujących zleceń oraz formularzem nowego wpisu.

Wpisy wybranego pracownika i dnia są widoczne obok formularza. **Edytuj** ładuje wpis do formularza; **Usuń** wymaga potwierdzenia i wykonuje soft delete. **Kopiuj ostatni dzień** kopiuje wyłącznie wpisy aktualnie wybranego pracownika z jego najnowszej wcześniejszej daty. Podczas operacji przycisk jest zablokowany. Jeśli wybrany dzień zawiera już wpis tego pracownika, aplikacja nie dopisze danych i wyświetli komunikat o konflikcie.

Jeśli kod `G` przekroczy 8 godzin lub suma przekroczy 12/24 godziny, pojawi się ostrzeżenie. Można anulować albo wybrać **Ignoruj i zapisz**.

> **Zrzut ekranu do wstawienia:** modal ostrzeżenia z przekroczeniem godzin i przyciskami Anuluj oraz Ignoruj i zapisz.

### Raporty i eksport

Zakładka Raporty udostępnia zestawienia według zleceń, pracowników, kont księgowych i szczegółowe. Ustaw zakres dat i filtry właściwe dla zakładki, wygeneruj raport, a następnie pobierz XLSX lub CSV. Szczegółowy raport umożliwia również usunięcie wpisu.

> **Zrzut ekranu do wstawienia:** zakładka Raporty z wybranym raportem szczegółowym, zakresem dat, wynikami oraz przyciskami eksportu.

## Administrator

Administrator ma wszystkie funkcje lidera oraz poniższe ekrany.

- **Dashboard**: liczniki otwartych/zamkniętych zleceń, godziny dziś i w miesiącu oraz zlecenia z wykorzystaniem planu od 80% i ponad 100%.
- **Zlecenia**: dodawanie, edycja, zmiana statusu/aktywności i miękkie usuwanie; plan godzin wylicza się z ilości i godzin na jednostkę.
- **Pracownicy**: dodawanie, edycja, aktywacja/dezaktywacja i miękkie usuwanie.
- **Użytkownicy**: tworzenie kont `admin`/`leader`, edycja roli i aktywności oraz reset hasła. Nie można dezaktywować własnego konta ani odebrać sobie roli administratora.
- **Rodzaje czasu pracy**: tworzenie i edycja kodów oraz flagi wymagania zlecenia. Typów systemowych nie można usunąć ani zmienić im tej flagi; używanego typu nie można usunąć.
- **Importy**: pobranie szablonu i wgranie pracowników albo zleceń. Wynik pokazuje rekordy poprawne i błędne; historia zawiera wykonawcę, czas, status i log błędów. Szczegóły formatów zawiera [specyfikacja importów i eksportów](import-export-specification.md).

> **Zrzut ekranu do wstawienia:** Dashboard administratora z czterema licznikami i tabelami wykorzystania planu.

> **Zrzut ekranu do wstawienia:** ekran Import danych z kartami pracowników i zleceń, przyciskiem pobrania szablonu, polem wyboru pliku i widoczną historią importów.
