# Duplicate Repair Executor – etap 3

## Zakres i bezpieczeństwo

`duplicates:repair` jest jednym modułem obsługującym podsumowanie, zatwierdzanie oraz walidację wykonania Repair Manifestu. Nie istnieje osobny Approval Builder ani drugi plik zatwierdzeń: jedynym źródłem prawdy pozostaje wskazany `repair-manifest.json`.

Etap 3 nadal jest read-only względem bazy danych. Executor:

- nie importuje Prisma;
- nie odczytuje `DATABASE_URL`;
- nie otwiera połączenia z bazą;
- nie zawiera operacji `DELETE`, `UPDATE`, `INSERT` ani soft delete;
- w trybach `--summary` i `--execute` nie zapisuje żadnych plików;
- w trybie `--approve` zmienia wyłącznie wskazany `repair-manifest.json`.

## Wersja manifestu

Obsługiwana wersja formatu to `manifestVersion: 1`. Builder etapu 2 zapisuje tę wartość w każdym nowym manifeście. Starszy plik bez `manifestVersion` należy ponownie wygenerować poleceniem `duplicates:repair-plan`; executor nie zgaduje formatu i odrzuca nieobsługiwaną wersję.

Podczas każdego odczytu sprawdzane są wymagane pola, unikalność `batchId` i `reportIds`, zgodność liczników podsumowania, liczba rekordów akcji, reguły ręcznej weryfikacji DELETE oraz kompletność metadanych zatwierdzenia.

## Tryb `--summary`

```bash
cd backend
npm run duplicates:repair -- \
  --manifest reports/repair-plan-YYYYMMDD-HHMMSS/repair-manifest.json \
  --summary
```

Tryb pokazuje wersję, liczbę rekordów i akcji KEEP/DELETE/REVIEW, liczbę zatwierdzonych DELETE oraz stan pełnego zatwierdzenia manifestu. Nie zapisuje plików i nie dotyka bazy.

## Tryb `--approve`

```bash
cd backend
npm run duplicates:repair -- \
  --manifest reports/repair-plan-YYYYMMDD-HHMMSS/repair-manifest.json \
  --approve batch-1129 \
  --approve batch-1130 \
  --approved-by "Jarosław Oleradzki" \
  --note "Zweryfikowano ręcznie"
```

Wszystkie wskazane identyfikatory są najpierw walidowane. Jeżeli którykolwiek nie istnieje, jest już zatwierdzony albo ma akcję KEEP/REVIEW, operacja kończy się bez zmiany manifestu.

Dla każdej wskazanej akcji DELETE zapisywane są razem:

- `approved: true`,
- `approvedBy`,
- `approvedAt` w UTC,
- `approvalNote`.

KEEP i REVIEW nie mogą zawierać tych pól. Zapis odbywa się atomowo do tej samej ścieżki `repair-manifest.json`; pomocniczy plik tymczasowy jest usuwany lub zastępowany podczas operacji i nie stanowi drugiego źródła prawdy. Krótkotrwała blokada plikowa zapobiega równoległemu nadpisaniu dwóch zatwierdzeń.

Nadrzędne `approved` ma znaczenie zbiorcze. Jest `true` dopiero wtedy, gdy wszystkie akcje DELETE w manifeście mają kompletne zatwierdzenie. Przy zatwierdzeniu tylko części batchy pozostaje `false`, ale zatwierdzenia wybranych DELETE są zachowane przy ich akcjach.

Towarzyszące pliki `repair-summary.md` i `repair-summary.csv` nie są aktualizowane podczas zatwierdzania. Stan zatwierdzeń należy zawsze odczytywać z `repair-manifest.json` albo przez tryb `--summary`.

## Tryb `--execute`

```bash
cd backend
npm run duplicates:repair -- \
  --manifest reports/repair-plan-YYYYMMDD-HHMMSS/repair-manifest.json \
  --execute
```

Tryb wczytuje manifest, sprawdza `manifestVersion`, wymagane pola, spójność podsumowania i obecność co najmniej jednej zatwierdzonej akcji DELETE. Następnie kończy się dokładnym komunikatem:

```text
Repair execution not implemented yet.
```

Nie wykonuje naprawy, nie zmienia manifestu i nie otwiera połączenia z bazą. Manifest bez zatwierdzonego DELETE albo z błędnym formatem jest odrzucany przed komunikatem stubu.

## Testy

```bash
cd backend
npm test -- tests/duplicate-repair-executor.test.ts
npm exec tsc -- --project tsconfig.scripts.json
```

Testy obejmują read-only summary, zatwierdzenie jednego i wielu DELETE, odrzucenie KEEP, REVIEW i nieistniejącego batcha, atomowość pliku, execute stub, brak zatwierdzeń oraz nieobsługiwaną wersję manifestu.
