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

Wpisy wybranego pracownika i dnia są widoczne obok formularza. **Edytuj** ładuje wpis do formularza; **Usuń** wymaga potwierdzenia i wykonuje soft delete. **Kopiuj ostatni dzień** kopiuje wyłącznie wpisy aktualnie wybranego pracownika z jego najnowszej wcześniejszej daty. W dni robocze kopiowany jest kompletny zestaw, również nieobecności takie jak UW i L4. Wybranie soboty lub niedzieli jako dnia docelowego blokuje całą operację bez utworzenia wpisów, niezależnie od ich rodzaju. Podczas operacji przycisk jest zablokowany. Jeśli wybrany dzień zawiera już wpis tego pracownika, aplikacja nie dopisze danych i wyświetli komunikat o konflikcie.

Jeśli kod `G` przekroczy 8 godzin lub suma przekroczy 12/24 godziny, pojawi się ostrzeżenie. Można anulować albo wybrać **Ignoruj i zapisz**.

> **Zrzut ekranu do wstawienia:** modal ostrzeżenia z przekroczeniem godzin i przyciskami Anuluj oraz Ignoruj i zapisz.

### Raporty i eksport

Zakładka Raporty udostępnia zestawienia według zleceń, pracowników, kont księgowych, szczegółowe oraz okresów nieobecności. Ustaw zakres dat i filtry właściwe dla zakładki, wygeneruj raport, a następnie pobierz XLSX lub CSV. Szerokie tabele można przewijać poziomo za pomocą zsynchronizowanych pasków nad i pod tabelą; układ nie rozszerza strony poza szerokość ekranu. W miesięcznym raporcie według pracowników tabela oraz oba eksporty zawierają ten sam zestaw rekordów, a kolumny rodzajów czasu odpowiadają aktualnej zawartości słownika i zachowują kolejność jego pozycji. Szczegółowy raport umożliwia również usunięcie wpisu.

Każda zakładka raportu zapamiętuje własny zakres dat i pozostałe filtry w bieżącej sesji karty. Filtry pozostają ustawione po przejściu do innego raportu lub modułu i po odświeżeniu strony. Przycisk **Wyczyść filtry** przywraca wartości domyślne tylko w aktywnym raporcie. Zamknięcie karty przeglądarki kończy sesję i usuwa zapamiętane filtry.

W raporcie **Godziny wg zleceń** ustaw obie daty i wybierz **Raport zamknięcia**, aby zobaczyć otwarte zlecenia z godzinami w okresie oraz wszystkie zlecenia zamknięte w tym okresie — także te z wartością `0,0 h`. Aktywny przycisk jest wyróżniony i zapamiętywany w bieżącej sesji. Filtry statusu oraz „Pokaż tylko zlecenia z zaraportowanymi godzinami” są wtedy wyłączone, ponieważ wynik celowo łączy statusy i zawiera zlecenia bez godzin. Ponowne kliknięcie przywraca zwykły raport. W trybie raportu zamknięcia pod tabelą prezentowana jest automatyczna sekcja **„Kontrola rozliczenia czasu”**, zestawiająca godziny przypisane do zleceń, poszczególne występujące typy nieobecności, łączny rozliczony czas, sumę godzin z raportu miesięcznego pracowników, różnicę oraz jednoznaczny status zgodności (**Zgodne** / **Niezgodne**). Sekcja kontrolna trafia również do generowanego pliku Excel (XLSX) oraz CSV.

Raport **Okresy Nieobecności** uwzględnia wyłącznie typy oznaczone w słowniku jako „Nieobecność”. Filtry obejmują zakres dat, pracownika i rodzaj nieobecności. Kolejne dni robocze są łączone w okres, weekendy nie przerywają okresu ani nie zwiększają liczby dni, a brakujący dzień roboczy rozpoczyna kolejny okres. Wynik można pobrać w formacie XLSX.

> **Zrzut ekranu do wstawienia:** zakładka Raporty z wybranym raportem szczegółowym, zakresem dat, wynikami oraz przyciskami eksportu.

## Administrator

Administrator ma wszystkie funkcje lidera oraz poniższe ekrany.

- **Dashboard**: liczniki otwartych/zamkniętych zleceń, godziny dziś i w miesiącu oraz zlecenia z wykorzystaniem planu od 80% i ponad 100%.
- **Zlecenia**: dodawanie, edycja, zmiana statusu/aktywności i miękkie usuwanie; plan godzin wylicza się z ilości i godzin na jednostkę. Opcjonalne pole „Uwagi” można uzupełnić w formularzu dodawania lub edycji, a jego wartość jest widoczna w kolumnie listy zleceń. Wyszukiwarka Bazy Zleceń obsługuje częściowe dopasowanie bez rozróżniania wielkości liter, między innymi po numerze zlecenia, zamawiającym, numerze produktu i koncie księgowym.
- **Pracownicy**: dodawanie, edycja, aktywacja/dezaktywacja i miękkie usuwanie.
- **Użytkownicy**: tworzenie kont `admin`/`leader`, edycja roli i aktywności oraz reset hasła. Nie można dezaktywować własnego konta ani odebrać sobie roli administratora.
- **Rodzaje czasu pracy**: tworzenie i edycja kodów oraz niezależnych właściwości „Wymaga zlecenia” i „Nieobecność”. Typów systemowych nie można usunąć ani zmienić im flagi wymagania zlecenia; klasyfikację nieobecności można korygować administracyjnie. Używanego typu nie można usunąć.

> [!IMPORTANT]
> Po aktualizacji należy sprawdzić, czy wszystkie niestandardowe typy nieobecności mają włączoną właściwość „Nieobecność”. Automatyczna migracja oznacza jako nieobecności wyłącznie standardowe kody UW, UOK, UŻ i L4.
- **Importy**: pobranie szablonu i wgranie pracowników albo zleceń. Wynik pokazuje rekordy poprawne i błędne; historia zawiera wykonawcę, czas, status i log błędów. Szczegóły formatów zawiera [specyfikacja importów i eksportów](import-export-specification.md).

> **Zrzut ekranu do wstawienia:** Dashboard administratora z czterema licznikami i tabelami wykorzystania planu.

> **Zrzut ekranu do wstawienia:** ekran Import danych z kartami pracowników i zleceń, przyciskiem pobrania szablonu, polem wyboru pliku i widoczną historią importów.
