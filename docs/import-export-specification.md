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

## Eksporty XLSX i CSV dla użytkownika

Od wersji `0.3.7` wszystkie pliki raportowe dla użytkownika (Zlecenia, Miesięczny pracowników, Konta księgowe, Szczegółowy, Okresy nieobecności) w formatach XLSX oraz CSV posiadają zunifikowany nagłówek metadanych umieszczony przed tabelą danych:

1. **Wiersz 1**: `Raport: <Nazwa raportu>` (W XLSX: czcionka 14pt, pogrubiona, scalona na szerokość tabeli).
2. **Wiersz 2**: `Zakres dat: <Zakres>` (Wartość `DD.MM.YYYY–DD.MM.YYYY` lub `Wszystkie`).
3. **Wiersze 3..N**: `Zastosowane filtry` (np. `Status zlecenia`, `Pracownik`, `Konto księgowe`, `Szukany numer zlecenia`).
4. **Wiersz N+1**: `Wygenerowano: <Data i godzina>` (Czas lokalny w formacie `DD.MM.YYYY, HH:MM`).
5. **Wiersz N+2**: Pusty wiersz odstępu.
6. **Wiersz N+3**: Nagłówek kolumn tabeli.

| Eksport | Filtry | Kolumny arkusza |
|---|---|---|
| Według zleceń | `dateFrom`, `dateTo`, `status`, `orderNumber`, `onlyWithHours`, `closureReport` | Numer zlecenia; Numer produktu; Nazwa produktu; Konto księgowe; Ilość; Godziny planowane (estymata); Godziny rzeczywiste; Odchylenie (plan - rzecz.); Procent realizacji (%); Status zlecenia; Rzeczywista data zakończenia |
| Według pracowników | `dateFrom`, `dateTo`, `employeeId` | Pracownik; Suma godzin z nadgodzinami; Suma godzin bez nadgodzin; dynamiczne kolumny rodzajów czasu |
| Według kont | `dateFrom`, `dateTo`, `accountingAccount` | Data; Konto księgowe; Pracownik; Zlecenie; Produkt; Liczba godzin; Rodzaj czasu pracy |
| Szczegółowy | `dateFrom`, `dateTo`, `employeeId`, `orderId` | Data; Pracownik; Numer zlecenia; Numer produktu; Nazwa produktu; Konto księgowe; Liczba godzin; Typ czasu pracy; Wprowadził użytkownik; Data wpisu w bazie |
| Okresy nieobecności | `dateFrom`, `dateTo`, `employeeId`, `workTimeTypeCode` | Imię i nazwisko; Rodzaj nieobecności; Od; Do; Liczba dni nieobecności |

W plikach XLSX zamrożenie okien (`ySplit`) oraz zakreślenie `autoFilter` odnoszą się wyłącznie do właściwego wiersza nagłówka tabeli danych. Pliki CSV raportowe posiadają kodowanie UTF-8 z BOM (`\uFEFF`), separator `;`, poprawnie escapowane znaki specjalne i cudzysłowy oraz wiersze metadanych przed tabelą.

W eksporcie według zleceń `closureReport=true` wymaga obu dat. Arkusz zawiera dokładnie te same zlecenia i kolejność co odpowiedź JSON trybu zamknięcia, włącznie ze zleceniami zamkniętymi bez godzin w okresie.

> [!NOTE]
> Techniczne szablony importowe (`szablon_pracownicy.xlsx`, `szablon_zlecen.xlsx`) nie są raportami użytkownika i pozostały bez zmian.
