# Backlog Produktu (Product Backlog)

Dokument zawiera uzgodniony plan przyrostów oraz dalszego rozwoju aplikacji **Workshop Time Tracking**.

---

## Plan Przyrostów

### Wersja 0.3.3 — Bugfix (Bieżący przyrost)

Zakres tej wersji obejmuje wyłącznie naprawę zgłoszonych błędów:

1. **Niekontrolowane kopiowanie wpisu UW**
   - Diagnoza: Funkcja „Kopiuj ostatni dzień” kopiowała wszystkie aktywne wpisy z ostatniego dnia roboczego bez wykluczenia nieobecności (takich jak urlop wypoczynkowy `UW`, `L4`, `UOK`, `UŻ`).
   - Zakres: Wykluczenie typów nieobecności z mechanizmu kopiowania poprzedniego dnia przy jednoczesnym zachowaniu kopiowania prawidłowych wpisów roboczych (zarówno wymagających zlecenia, jak i roboczych niewymagających zlecenia).
2. **Niedziałający filtr statusu w raporcie godzin według zleceń**
   - Diagnoza: Niezgodność wielkości liter pomiędzy frontendem (`open`, `suspended`, `closed`) a typem enum w bazie danych i API (`OPEN`, `SUSPENDED`, `CLOSED`).
   - Zakres: Ujednolicenie wartości przekazywanych przez frontend i obsługa w API/bazie danych dla wszystkich statusów oraz opcji „Wszystkie statusy”.
3. **Analiza mechanizmu zmiany rozmiaru kolumn w raportach**
   - Diagnoza: Weryfikacja istniejącego kodu wykazała brak wcześniejszego mechanizmu manualnej zmiany szerokości kolumn (kod korzystał z `ResizeObserver` wyłącznie do synchronizacji paska przewijania).
   - Zakres: Udokumentowanie wyniku diagnostyki jako niejednoznacznego wymagania dla nowego widoku i pozostawienie go do specyfikacji w kolejnych przyrostach, bez wprowadzania ryzykownych zmian w wydaniu bugfix.

---

### Wersja 0.4.0 — Raportowanie (Planowany przyrost)

Funkcjonalności zaplanowane dla wersji 0.4.0 (nieimplementowane w 0.3.3):

- **Raport według zleceń**: Dodanie liczby sztuk.
- **Prezentacja zleceń**: Pokazywanie zleceń z wprowadzonymi godzinami oraz prawidłowa obsługa wartości zero.
- **Plan produkcyjny**: Raportowanie zleceń według daty zlecenia i daty wysyłki jako plan produkcyjny.
- **Filtrowanie**: Dodanie filtrowania po kolumnach.
- **Procent roboczogodzin**: Raport roboczogodzin wyliczany względem wszystkich godzin wypracowanych w wybranym okresie raportu.
- **Sortowanie pracowników**: Raport pracowników sortowany od nazwiska (nazwisko, imię).
- **Centrum raportów pracowników**:
  - Suma godzin przy nazwisku.
  - Suma nadgodzin.
  - Suma godzin bez nadgodzin.
  - Podsumowania odpowiednich kolumn.

---

### Wersja 0.5.0 — Zarządzanie zleceniami i role (Planowany przyrost)

Funkcjonalności zaplanowane dla wersji 0.5.0:

- **Filtrowanie pulpitu**: Na pulpicie (Dashboard) zamknięte zlecenia mają być wyświetlane tylko wtedy, gdy zostały zamknięte w bieżącym miesiącu.

---

### Wersja 0.6.0 — Nieobecności (Planowany przyrost)

Funkcjonalności zaplanowane dla wersji 0.6.0 (nieimplementowane w 0.3.3):

- **Zakresy dat nieobecności**: Wpisywanie urlopu, chorobowego i innych wielodniowych nieobecności jako zakresu dat (`dateFrom` – `dateTo`).
- **Walidacja zakresu**: Walidacja poprawności dat i zakresu.
- **Obsługa dni wolnych**: Prawidłowa obsługa weekendów oraz dni ustawowo wolnych od pracy.
- **Ochrona przed duplikatami**: Zabezpieczenie przed nadpisywaniem lub duplikowaniem istniejących wpisów.

---

## Dokumentacja i Dalszy Rozwój

### Dokumentacja Użytkownika
- Przygotowanie lub aktualizacja instrukcji użytkownika po wdrożeniu poszczególnych nowych funkcjonalności.

### Backlog Dalszy (Przyszły rozwój)
- **Przypisywanie pracowników do liderów**: Struktura podległości pracowników pod konkretnych liderów.
- **Widoczność lidera**: Lider widzi wyłącznie pracowników przypisanych do jego zespołu.
- **Wielodniowa obsługa nieobecności dla grup pracowników**: Masowe wpisywanie urlopu lub chorobowego dla wielu pracowników jednocześnie.
