---
title: "4. Jak wpisać godziny pracy i zgłosić nieobecność"
order: 4
roles: ["admin", "leader"]
componentIds: ["screen-reporting", "modal-absence-range"]
screenshotIds: ["reporting-panel", "reporting-missing-card", "absence-modal"]
diagramIds: ["raportowanie-czasu"]
lastUpdatedVersion: "0.4.4"
includeInUserManual: true
includeInAdminManual: false
---

# Jak wpisać godziny pracy i zgłosić nieobecność

Raportowanie czasu pracy to czynność, którą wykonujesz każdego dnia po zakończeniu zmiany — albo rano, gdy wpisujesz dane za poprzedni dzień. To tutaj zapisujesz, co działo się na hali: kto pracował, na którym zleceniu i ile godzin.

---

## Jak wpisać godziny pracy

### Krok po kroku

**1.** Kliknij **Raportowanie** w lewym menu.

**2.** Sprawdź datę u góry strony.
Domyślnie wyświetlony jest dzisiejszy dzień. Jeśli wpisujesz godziny za wczoraj lub inny dzień — kliknij strzałkę **◀** obok daty, żeby cofnąć się o jeden dzień.

**3.** Wybierz **pracownika** z listy rozwijanej.

**4.** Wybierz **rodzaj czasu pracy**:
- `G – Standardowe` — zwykłe godziny dzienne,
- `NDR – Nadgodziny` — gdy pracownik pracował ponad normalną zmianę,
- `UW – Urlop wypoczynkowy` — jeden dzień urlopu,
- `L4 – Zwolnienie lekarskie` — jeden dzień chorobowego.

**5.** Wybierz **zlecenie produkcyjne**, na którym pracownik spędził czas.
Jeśli wybrałeś rodzaj czasu `UW` lub `L4` — pole zlecenia nie jest potrzebne.

**6.** Wpisz **liczbę godzin** (np. `8` lub `7.5`).

**7.** Kliknij **Dodaj wpis**.

---

![Panel Raportowania Czasu Pracy](docs/images/03_reporting_panel.png)

*Panel raportowania — u góry formularz dodawania wpisu, poniżej lista wpisów za wybrany dzień. Zmiana daty strzałkami ◀ ▶ pokazuje wpisy z innego dnia.*

---

✅ **Efekt:** Wpis pojawia się na liście poniżej formularza. Liczba godzin w podsumowaniu na górze aktualizuje się od razu.

💡 **Wskazówka:** Jeśli pracownik pracował na dwóch różnych zleceniach tego samego dnia, dodaj dwa oddzielne wpisy — po jednym dla każdego zlecenia. Możesz dodawać dowolną liczbę wpisów dla jednego pracownika w jednym dniu.

---

## Jak oznaczyć brak karty dostępowej

Jeśli pracownik pojawił się na hali bez karty — zaznacz to przy dodawaniu wpisu.

Po wypełnieniu formularza (pracownik, rodzaj czasu, zlecenie, godziny) zaznacz pole **Brak karty**, a dopiero potem kliknij **Dodaj wpis**.

---

![Raportowanie z oznaczonym brakiem karty](docs/images/03b_reporting_missing_card.png)

*Wpisy z zaznaczonym „Brak karty" są oznaczone na liście. Dział bezpieczeństwa i audytu widzi te zdarzenia w osobnym raporcie.*

---

⚠️ **Uwaga:** Oznaczenie „Brak karty" nie blokuje dodania wpisu — to tylko flaga informacyjna. Wpis zostaje zapisany normalnie.

---

## Jak zgłosić urlop lub L4 na kilka dni naraz

Gdy pracownik idzie na urlop na tydzień albo przynosi zwolnienie lekarskie obejmujące kilka dni — nie musisz wpisywać każdego dnia osobno. Użyj funkcji **Dodaj nieobecność (zakres)**.

### Krok po kroku

**1.** Wejdź w **Raportowanie**.

**2.** Kliknij przycisk **Dodaj nieobecność (zakres)** — znajdziesz go obok przycisku „Dodaj wpis".

**3.** Wybierz **pracownika**.

**4.** Wybierz **rodzaj nieobecności** — np. `UW – Urlop wypoczynkowy` lub `L4 – Zwolnienie lekarskie`.

**5.** Ustaw **datę początku** i **datę końca** nieobecności.

**6.** Sprawdź **podgląd** — system pokaże Ci:
- ile dni roboczych zostanie dodanych,
- które dni są weekendami (zostaną pominięte automatycznie),
- czy któryś dzień ma już wpisany czas (zostanie pominięty, żeby nie było konfliktu).

**7.** Kliknij **Zapisz**.

---

![Modal Nieobecności Zakresem Dat](docs/images/04_absence_range_modal.png)

*Formularz zgłoszenia nieobecności zakresem dat — wybierz pracownika, rodzaj nieobecności i zakres dat. System pokazuje podgląd dni, które zostaną dodane, zanim klikniesz „Zapisz".*

---

✅ **Efekt:** System doda wpisy dla wszystkich dni roboczych w wybranym zakresie. Weekendy są pomijane automatycznie — nie musisz ich liczyć ręcznie.

💡 **Wskazówka:** Jeśli pracownik skrócił urlop i wrócił wcześniej, możesz usunąć zbędne wpisy ręcznie — znajdź je na liście dziennej i kliknij ikonę kosza.

---

## Jak poprawić błędny wpis

Jeśli wpisałeś złą liczbę godzin, złe zlecenie albo pomyliłeś pracowników — możesz edytować lub usunąć wpis.

**1.** Przejdź do dnia, w którym był wpis (strzałki ◀ ▶ obok daty).

**2.** Znajdź wpis na liście.

**3.** Kliknij **ikonę ołówka** przy wpisie, żeby go edytować — zmień to, co trzeba, i kliknij **Zapisz zmiany**.

Albo kliknij **ikonę kosza**, żeby usunąć wpis całkowicie — a potem dodaj go od nowa z poprawnymi danymi.

⚠️ **Uwaga:** Każda zmiana jest rejestrowana w systemie. Jeśli wpis dotyczył poprzedniego miesiąca i był już rozliczony — skonsultuj zmianę z administratorem przed edycją.

---

## Co zrobić, gdy…

**Nie widzę pracownika na liście**
Lista zawiera tylko aktywnych pracowników. Jeśli kogoś brakuje, poproś administratora o sprawdzenie konta tego pracownika — może być nieaktywne lub niezarejestrowane.

**Nie mogę wybrać zlecenia — lista jest pusta lub nie zawiera zlecenia, którego szukam**
Zlecenia zamknięte nie są dostępne do wyboru. Sprawdź, czy zlecenie jest nadal otwarte. Jeśli tak, a nadal go nie widzisz — zgłoś to administratorowi.

**Rodzaj czasu, którego potrzebuję, nie ma na liście**
Lista rodzajów czasu jest zarządzana przez administratora. Poproś go o dodanie brakującej pozycji — to zmiana konfiguracyjna, którą może zrobić szybko.

**Kliknąłem „Dodaj wpis" i nic się nie stało — formularz nie reaguje**
Sprawdź, czy wszystkie wymagane pola są wypełnione. Brakujące pole może nie być wyraźnie zaznaczone na tablecie — przewiń formularz w górę i sprawdź po kolei każde pole.

**Chcę wpisać 7,5 godziny — jakiego formatu użyć?**
Wpisz `7.5` (z kropką, nie przecinkiem). System przyjmuje liczby dziesiętne.

**Wpis z brakiem karty widnieje bez oznaczenia — dlaczego?**
Upewnij się, że zaznaczyłeś pole „Brak karty" przed kliknięciem „Dodaj wpis", nie po. Jeśli wpis jest już zapisany bez oznaczenia — możesz go edytować i zaznaczyć pole przy edycji.

---

## Najczęstsze pytania

**Czy mogę wpisać godziny z ubiegłego tygodnia?**
Tak. Cofnij datę strzałką ◀ do właściwego dnia i dodaj wpis tak samo jak zwykle. Nie ma blokady historycznych dat.

**Co się stanie, jeśli wpiszę godziny na zamkniętym zleceniu?**
Zamknięte zlecenia nie pojawiają się na liście wyboru — system nie pozwoli ich wybrać. Jeśli zlecenie wymaga ponownego użycia, administrator może je wznowić.

**Czy lider widzi wpisy innych liderów?**
Tak — w panelu raportowania widoczne są wpisy wszystkich pracowników za wybrany dzień, niezależnie od tego, który lider je dodał.

**Ile wpisów mogę dodać jednego dnia?**
Nie ma limitu. Możesz dodać tyle wpisów, ile potrzeba — dla każdego pracownika i każdego zlecenia osobno.
