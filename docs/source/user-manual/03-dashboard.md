---
title: "3. Jak czytać pulpit i reagować na problemy"
order: 3
roles: ["admin"]
componentIds: ["screen-dashboard"]
screenshotIds: ["dashboard-overview"]
diagramIds: []
lastUpdatedVersion: "0.4.4"
includeInUserManual: true
includeInAdminManual: true
---

# Jak czytać pulpit i reagować na problemy

Pulpit to Twój codzienny przegląd warsztatu. Jednym spojrzeniem widzisz, co dzieje się na hali — ile godzin zostało zaraportowanych, ile zleceń jest w toku i które wymagają Twojej reakcji.

📌 **Zapamiętaj:** Pulpit jest dostępny wyłącznie dla administratora. Liderzy pracują bezpośrednio w panelu raportowania.

---

## Co widzisz na pulpicie

![Pulpit Menedżerski](docs/images/02_dashboard_overview.png)

*Pulpit — cztery karty z podsumowaniem u góry, poniżej lista zleceń wymagających uwagi. Każde zlecenie z kolorem informuje o stanie budżetu godzin.*

---

### Cztery karty u góry

Patrz na nie jak na szybki raport poranny:

| Karta | Co mówi |
| :--- | :--- |
| **Otwarte zlecenia** | Ile zleceń jest teraz aktywnych na warsztacie. |
| **Zamknięte w tym miesiącu** | Ile zleceń udało się domknąć od początku miesiąca. |
| **Godziny dzisiaj** | Ile godzin łącznie wpisali wszyscy liderzy za dzisiejszy dzień. |
| **Godziny w tym miesiącu** | Całkowita suma od pierwszego dnia bieżącego miesiąca. |

---

### Lista zleceń poniżej — co oznaczają kolory

System automatycznie sygnalizuje kolorem, które zlecenia wymagają uwagi:

🟢 **Zielone** — zlecenie zużyło mniej niż 80% zaplanowanych godzin. Wszystko w normie.

🟡 **Żółte** — zlecenie zużyło od 80% do 100% budżetu. Zbliża się do granicy — warto rzucić okiem.

🔴 **Czerwone** — zlecenie przekroczyło planowany budżet godzin. Wymaga Twojej reakcji.

---

## Co zrobić, gdy widzisz czerwone zlecenie

Czerwony kolor nie zawsze oznacza problem — może być wynikiem błędnie wpisanych godzin albo uzasadnionego przedłużenia pracy.

**Krok 1:** Sprawdź, o ile godzin zlecenie przekroczyło plan.
Wejdź w zakładkę **Zlecenia**, znajdź zlecenie i porównaj kolumny „Planowane" i „Rzeczywiste".

**Krok 2:** Sprawdź, kto i co wpisał.
Zapytaj lidera, czy wpisy wyglądają prawidłowo — może ktoś pomylił zlecenia.

**Krok 3:** Zdecyduj:
- Jeśli wpisy są poprawne, a praca faktycznie trwa dłużej — zaktualizuj budżet godzinowy zlecenia.
- Jeśli ktoś wpisał godziny na złe zlecenie — poproś lidera o korektę w panelu raportowania.

⚠️ **Uwaga:** Samo przekroczenie budżetu nie blokuje możliwości dalszego wpisywania godzin. System informuje — decyzja należy do Ciebie.

---

## Co zrobić, gdy…

**Dane na pulpicie wyglądają na nieaktualne**
Odśwież stronę w przeglądarce (klawisz **F5** lub **Ctrl+R**). Dane pobierane są na nowo przy każdym wejściu na pulpit.

**Liczba godzin dzisiaj jest zerowa, a liderzy pracowali**
Prawdopodobnie liderzy jeszcze nie wpisali godzin za dzisiejszy dzień. Możliwe też, że wpisali je na inną datę. Sprawdź w panelu raportowania, wybierając dzisiaj jako datę.

**Widzę mniej zleceń niż powinno być**
Pulpit pokazuje wyłącznie zlecenia ze statusem „Otwarte". Zlecenia wstrzymane i zamknięte nie są tu widoczne — przejdź do zakładki **Zlecenia**, żeby zobaczyć wszystkie.

**Kolor zlecenia nie zgadza się z tym, czego się spodziewałem**
Kolor wynika z porównania godzin wpisanych przez liderów do budżetu planowanego w zleceniu. Jeśli budżet nie był zaktualizowany po zmianie zakresu prac, zaktualizuj go w zakładce **Zlecenia**.

---

## Najczęstsze pytania

**Czy mogę wyeksportować dane z pulpitu?**
Nie bezpośrednio. Szczegółowe dane możesz pobrać z zakładki **Zlecenia** (przycisk „Eksportuj do XLSX").

**Jak często dane na pulpicie się odświeżają?**
Dane są pobierane przy każdym wejściu na stronę pulpitu. Nie aktualizują się automatycznie, gdy siedzisz na tej samej stronie.

**Czy mogę ustawić progi kolorów — np. żeby żółty zaczynał się od 70%?**
Progi są na razie stałe (80% i 100%) i można je zmienić tylko na poziomie konfiguracji systemu. Skontaktuj się z administratorem technicznym, jeśli chcesz dostosować wartości.

💡 **Wskazówka:** Sprawdzaj pulpit rano — zanim zaczniesz dzień pracy. Czerwone zlecenia widoczne od rana dają Ci czas na reakcję przed południem.
