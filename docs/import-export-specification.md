# Specyfikacja importów i eksportów

Wszystkie operacje wymagają zalogowania; importy i historia importów są dostępne tylko administratorowi. Import odczytuje pierwszy arkusz pliku przesłanego w polu formularza `file`.

## Import pracowników

Szablon `szablon_pracownicy.xlsx` zawiera arkusz `Pracownicy` i nagłówki `ID`, `Imię`, `Nazwisko`.

| Pole | Wymagane | Obsługiwane nagłówki | Typ i przetwarzanie |
|---|---:|---|---|
| Imię i nazwisko | warunkowo | `Imię i nazwisko`, `fullName`, `Name` | tekst, obcięcie spacji; może zastąpić osobne imię i nazwisko |
| Imię | warunkowo | `Imię`, `firstName`, `First Name` | tekst, obcięcie spacji |
| Nazwisko | warunkowo | `Nazwisko`, `lastName`, `Last Name` | tekst, obcięcie spacji |
| Identyfikator | nie | `Identyfikator`, `ID`, `employeeNumber`, `externalId` | tekst, obcięcie spacji |

Wymagana jest pełna nazwa albo dane pozwalające ją zbudować. Gdy podano imię i nazwisko, pełna nazwa jest ich połączeniem. Jednoczłonowa pełna nazwa trafia do nazwiska, a imię pozostaje puste. Duplikat jest wyszukiwany po identyfikatorze (jeżeli występuje) **lub** pełnej nazwie. Istniejący, także miękko usunięty rekord jest aktualizowany i reaktywowany.

## Import zleceń

Szablon `szablon_zlecen.xlsx` zawiera arkusz `Zlecenia`.

| Pole | Wymagane | Obsługiwane nagłówki | Typ i walidacja |
|---|---:|---|---|
| Numer zlecenia | tak | `Numer zlecenia *`, `Numer zlecenia`, `orderNumber` | niepusty tekst |
| Data zlecenia | tak | `Data zlecenia *`, `Data zlecenia`, `orderDate` | data JS, obiekt `Date` albo numer seryjny Excel |
| Data planowanej wysyłki | nie | `Data planowanej wysyłki`, `plannedShipmentDate` | jak wyżej; pusty tekst oznacza brak |
| Zamawiający | nie | `Zamawiający`, `orderedBy` | tekst |
| Numer produktu | nie | `Numer produktu`, `productCode`, `productNumber`, `Kod produktu` | tekst |
| Nazwa produktu | tak | `Nazwa produktu *`, `Nazwa produktu`, `productName` | niepusty tekst |
| Konto księgowe | nie | `Konto księgowe`, `accountingAccount` | tekst |
| Ilość | tak | `Ilość *`, `Ilość`, `quantity` | `parseFloat`, wartość > 0 |
| Jednostka | tak | `Jednostka *`, `Jednostka`, `quantityUnit`, `quantity_unit`, `unit` | niepusty tekst |
| Godziny / szt. | tak | `Godziny / szt. *`, `Godziny / szt.`, `hoursPerUnit` | `parseFloat`, wartość >= 0 |

Format tekstowej daty nie jest jawnie ograniczony: akceptacja zależy od `new Date(value)` środowiska Node.js — zalecany i jednoznaczny jest `YYYY-MM-DD`; pozostałe formaty są **do potwierdzenia**. Liczby tekstowe używają `parseFloat`, więc separatorem dziesiętnym jest kropka.

Duplikat po numerze zlecenia jest aktualizowany, reaktywowany, przywracany z soft delete i ustawiany na `OPEN`. `plannedHours` jest wyliczane jako ilość razy godziny na jednostkę.

## Błędy i historia

Importy są częściowe, wykonywane wiersz po wierszu, bez jednej transakcji obejmującej cały plik. Błędny wiersz jest pomijany, a pozostałe są przetwarzane. Status historii to `success`, `partial` albo `failed`; zapis obejmuje nazwę pliku, typ, użytkownika, liczniki i listę błędów. Pusty/nieczytelny arkusz oraz błąd całego przetwarzania kończą żądanie przed utworzeniem historii.

## Eksporty XLSX

| Eksport | Filtry | Kolumny arkusza |
|---|---|---|
| Według zleceń | `dateFrom`, `dateTo` dla godzin; `status`, fragment `orderNumber` dla zleceń | Numer zlecenia; Numer produktu; Nazwa produktu; Konto księgowe; Godziny planowane (estymata); Godziny rzeczywiste; Odchylenie (plan - rzecz.); Procent realizacji (%); Status zlecenia |
| Według pracowników | `dateFrom`, `dateTo`, `employeeId` | Pracownik; G (Standard); NDR (Nadgodziny); NS (Nadgodziny weekend); UW (Urlop wypoczynkowy); UOK (Urlop okoliczn.); UŻ (Urlop żądanie); L4 (Chorobowe); Suma godzin |
| Według kont | `dateFrom`, `dateTo`, fragment `accountingAccount` | Data; Konto księgowe; Pracownik; Zlecenie; Produkt; Liczba godzin; Rodzaj czasu pracy |
| Szczegółowy | `dateFrom`, `dateTo`, `employeeId`, `orderId` | Data; Pracownik; Numer zlecenia; Numer produktu; Nazwa produktu; Konto księgowe; Liczba godzin; Typ czasu pracy; Wprowadził użytkownik; Data wpisu w bazie |

Każdy arkusz ma ciemny, pogrubiony nagłówek, obramowanie komórek, zamrożony pierwszy wiersz, autofiltr i automatycznie dobrane szerokości (minimum 12). Wskazane kolumny liczbowe mają format `#,##0.00`; daty są wyśrodkowane, lecz pozostają wartościami tekstowymi generowanymi w kodzie. Interfejs oferuje także lokalny eksport CSV bieżących wyników, rozdzielany średnikiem i kodowany UTF-8 z BOM; jego kolumny odpowiadają tabeli danego raportu.
