---
title: "5. Jak pracować z bazą zleceń"
order: 5
roles: ["admin", "leader"]
componentIds: ["screen-orders"]
screenshotIds: ["orders-table", "orders-export-success"]
diagramIds: []
lastUpdatedVersion: "0.4.4"
includeInUserManual: true
includeInAdminManual: true
---

# Jak pracować z bazą zleceń

Baza zleceń to spis wszystkich zleceń produkcyjnych w systemie — tych aktywnych, wstrzymanych i zamkniętych. Sprawdzasz tu, czy zlecenie jest dostępne do raportowania, ile godzin zaplanowano i ile już zużyto. Stąd też pobierzesz plik Excel, gdy kontroling prosi o raport.

---

## Jak znaleźć zlecenie

**1.** Kliknij **Zlecenia** w lewym menu.

**2.** Wpisz dowolną frazę w pole **Szukaj** u góry:
- numer zlecenia (np. `ZL-2026-001`),
- nazwę produktu,
- nazwę zamawiającego,
- konto księgowe.

System filtruje listę na bieżąco, w miarę jak piszesz.

**3.** Jeśli chcesz zawęzić widok, użyj filtra **Status**:
- **Otwarte** — zlecenia aktywne, dostępne do raportowania,
- **Wstrzymane** — zlecenia czasowo zatrzymane,
- **Zamknięte** — zakończone, niedostępne w raportowaniu,
- **Wszystkie** — pełna lista bez filtrowania.

**4.** Kliknij w wybrany wiersz, żeby zobaczyć szczegóły zlecenia i ewentualne uwagi.

---

![Baza Zleceń Produkcyjnych](docs/images/05_orders_table.png)

*Baza zleceń — pole wyszukiwania i filtr statusu u góry, tabela zleceń poniżej. Kolumny zawierają numer zlecenia, produkt, zamawiającego, budżet godzinowy i aktualny stan realizacji.*

---

✅ **Efekt:** Lista zawęża się do zleceń pasujących do Twojego zapytania. Możesz od razu kliknąć w zlecenie lub przejść do eksportu.

---

## Jak wyeksportować zlecenia do Excela

Gdy kontroling lub kierownik produkcji prosi o aktualny stan zleceń — eksportujesz dokładnie to, co widzisz na ekranie.

**1.** Ustaw filtry i sortowanie tak, jak chcesz zobaczyć dane w pliku.
Jeśli chcesz wszystkie zlecenia — upewnij się, że filtr statusu jest ustawiony na „Wszystkie" i pole wyszukiwania jest puste.

**2.** Kliknij przycisk **Eksportuj do XLSX** w prawym górnym rogu.

**3.** Plik pobierze się automatycznie na Twój komputer lub tablet.

---

![Eksport zleceń — potwierdzenie pobrania](docs/images/05b_orders_export_success.png)

*Po kliknięciu „Eksportuj do XLSX" przeglądarka pobiera plik automatycznie. Pojawia się krótki komunikat potwierdzający.*

---

✅ **Efekt:** Plik Excel zawiera wszystkie widoczne kolumny — numer zlecenia, produkt, zamawiającego, budżet, godziny przepracowane i status. Plik jest gotowy do otwarcia w Excelu lub przesłania mailem.

📌 **Zapamiętaj:** Eksport zawiera dokładnie tyle wierszy, ile widzisz na ekranie. Jeśli chcesz tylko otwarte zlecenia — ustaw filtr przed eksportem.

---

## Jak dodać nowe zlecenie

Gdy dział planowania przekaże nowe zamówienie, dodajesz je do systemu — liderzy będą mogli od razu raportować na nim godziny.

📌 **Zapamiętaj:** Dodawanie i edycja zleceń dostępne są tylko dla administratora.

**1.** Wejdź w **Zlecenia**.

**2.** Kliknij **+ Nowe zlecenie** w prawym górnym rogu.

**3.** Wypełnij:
- numer zlecenia (zgodny z Waszym systemem ERP),
- nazwę produktu,
- zamawiającego,
- planowaną liczbę godzin (budżet).

**4.** Kliknij **Zapisz**.

✅ **Efekt:** Zlecenie pojawia się na liście ze statusem „Otwarte" i jest od razu dostępne do wyboru w panelu raportowania.

---

## Jak dodać uwagi do zlecenia

Jeśli chcesz zostawić notatkę przy zleceniu — np. specjalne wymagania, kontakt do zamawiającego albo informację o zmianie zakresu — skorzystaj z pola uwag.

**1.** Na liście zleceń znajdź właściwe zlecenie.

**2.** Kliknij **ikonę chmurki** przy tym zleceniu.

**3.** Wpisz lub przeczytaj uwagi w oknie, które się otworzy.

**4.** Kliknij **Zapisz**.

💡 **Wskazówka:** Uwagi są widoczne dla wszystkich użytkowników systemu — zarówno liderów, jak i administratorów.

---

## Co zrobić, gdy…

**Szukanego zlecenia nie ma na liście, choć wiem, że istnieje**
Sprawdź, czy filtr statusu jest ustawiony na „Wszystkie" — domyślnie mogą być widoczne tylko otwarte zlecenia. Zamknięte i wstrzymane są ukryte, gdy masz wybrany filtr.

**Zlecenie jest zamknięte, ale muszę na nim zaraportować godziny**
Zamkniętych zleceń nie można wybrać w raportowaniu. Skontaktuj się z administratorem — może zmienić status zlecenia na „Otwarte" lub „Wstrzymane".

**Eksport się nie pobiera — nic się nie dzieje po kliknięciu przycisku**
Sprawdź, czy przeglądarka nie blokuje pobierania plików. Na wielu komputerach firmowych pobieranie wymaga potwierdzenia — poszukaj powiadomienia u góry lub u dołu okna przeglądarki.

**Plik Excel po otwarciu ma nieczytelne polskie znaki**
Otwierając plik, wybierz kodowanie **UTF-8** w Excelu. Możesz też skliknąć plik prawym przyciskiem i wybrać „Otwórz za pomocą → Excel", zamiast klikać dwa razy.

**Muszę zmienić budżet godzinowy zlecenia — jak to zrobić?**
Kliknij ikonę edycji przy zleceniu na liście (dostępne tylko dla administratora). Zmień wartość w polu „Planowane godziny" i zapisz.

**Widzę zlecenie na liście, ale nie mogę go edytować**
Edycja jest dostępna tylko dla administratora. Jeśli jesteś zalogowany jako lider, możesz tylko przeglądać i eksportować dane.

---

## Najczęstsze pytania

**Czy mogę przywrócić usunięte zlecenie?**
Zlecenia nie są usuwane na stałe — zmieniany jest tylko ich status. Administrator może przywrócić zlecenie ze statusu „Zamknięte" do „Otwartego".

**Co zawiera plik Excel — ile kolumn?**
Plik zawiera 16 kolumn z danymi biznesowymi: numer zlecenia, produkt, zamawiający, konto księgowe, status, budżet godzin, godziny rzeczywiste i inne. Nagłówki są zgodne z formatem ERP.

**Czy sortowanie w aplikacji ma wpływ na kolejność w pliku Excel?**
Tak — plik odzwierciedla dokładnie tę samą kolejność, którą widzisz na ekranie w chwili kliknięcia eksportu.

**Jak sprawdzić, kto i kiedy dodał uwagi do zlecenia?**
Uwagi są widoczne w oknie chmurki, ale bez historii autora. Jeśli potrzebujesz pełnej historii zmian, skontaktuj się z administratorem technicznym — dane audytowe są dostępne w bazie.
