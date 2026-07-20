# Duplicate Repair Executor – etap 3 i 4A

## Zakres i bezpieczeństwo

`duplicates:repair` jest jednym modułem obsługującym podsumowanie, zatwierdzanie oraz walidację wykonania Repair Manifestu. Nie istnieje osobny Approval Builder ani drugi plik zatwierdzeń: jedynym źródłem prawdy pozostaje wskazany `repair-manifest.json`.

Etap 4A nadal jest read-only względem bazy danych. Executor:

- nie importuje Prisma;
- nie odczytuje `DATABASE_URL`;
- nie otwiera połączenia z bazą;
- nie zawiera operacji `DELETE`, `UPDATE`, `INSERT` ani soft delete;
- w trybach `--summary` i `--execute` nie zapisuje żadnych plików;
- w trybie `--approve` zmienia wyłącznie wskazany `repair-manifest.json`.

## Wersja manifestu

Tryby `--summary` i `--approve` obsługują `manifestVersion: 1` oraz `manifestVersion: 2`. Builder generuje obecnie wyłącznie v2. Plik bez wersji albo z inną wersją jest odrzucany; executor nie zgaduje formatu.

Podczas każdego odczytu sprawdzane są wymagane pola, globalna unikalność `batchId` i `reportIds`, zgodność liczników, reguły ręcznej weryfikacji DELETE oraz kompletność approval. Dla v2 walidowane są ponadto snapshoty, fingerprinty, zgodność `reportIds` z `records`, aktywność i wcześniejszy czas poprzednika, przynależność poprzednika do KEEP oraz brak wskazania rekordu proponowanego do DELETE.

## Tryb `--summary`

```bash
cd backend
npm run duplicates:repair -- \
  --manifest reports/repair-plan-YYYYMMDD-HHMMSS/repair-manifest.json \
  --summary
```

Tryb pokazuje wersję, liczbę rekordów i akcji KEEP/DELETE/REVIEW, liczbę zatwierdzonych DELETE oraz stan pełnego zatwierdzenia manifestu. Dla v2 pokazuje także liczbę rekordów DELETE z kompletnymi preconditions i konkretnym poprzednikiem oraz liczbę batchy zdegradowanych do REVIEW. Nie zapisuje plików i nie dotyka bazy.

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

W v2 approval zmienia wyłącznie pola zatwierdzenia. Snapshoty, fingerprinty, rekordy i poprzednicy pozostają bez zmian.

Nadrzędne `approved` ma znaczenie zbiorcze. Jest `true` dopiero wtedy, gdy wszystkie akcje DELETE w manifeście mają kompletne zatwierdzenie. Przy zatwierdzeniu tylko części batchy pozostaje `false`, ale zatwierdzenia wybranych DELETE są zachowane przy ich akcjach.

Towarzyszące pliki `repair-summary.md` i `repair-summary.csv` nie są aktualizowane podczas zatwierdzania. Stan zatwierdzeń należy zawsze odczytywać z `repair-manifest.json` albo przez tryb `--summary`.

## Tryb `--execute`

```bash
cd backend
npm run duplicates:repair -- \
  --manifest reports/repair-plan-YYYYMMDD-HHMMSS/repair-manifest.json \
  --execute
```

Tryb odrzuca manifest v1 z komunikatem wymagającym v2. Dla v2 sprawdza pełną strukturę, preconditions, fingerprinty, poprzedników, spójność podsumowania i obecność co najmniej jednej zatwierdzonej akcji DELETE. Następnie kończy się dokładnym komunikatem:

```text
Repair execution not implemented yet.
```

Nie wykonuje naprawy, nie zmienia manifestu i nie otwiera połączenia z bazą. Manifest v1, v2 bez zatwierdzonego DELETE albo v2 z błędnym formatem jest odrzucany przed komunikatem stubu.

## Testy

```bash
cd backend
npm test -- tests/duplicate-repair-executor.test.ts
npm exec tsc -- --project tsconfig.scripts.json
```

Testy obejmują summary i approve dla v1/v2, zachowanie danych technicznych v2, atomowość zapisu, execute stub, odrzucenie v1 przez execute oraz błędy struktury, fingerprintów, poprzedników, konfliktów DELETE, liczników i globalnego approval.
