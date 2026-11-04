# QA lokalnie i w GitHub Actions

Wymagany Node zgodny z `.node-version` (22.22.1), npm, Python 3 i Docker z dostępem do sieci rejestru npm/Docker. Framework: Vitest, Supertest, React Testing Library; PostgreSQL sprawdza prawdziwe predykaty Prisma i migracje. Backend nie ma lintera; frontend ma ESLint. TypeScript jest sprawdzany przez build `tsc` obu pakietów.

Pełne QA na AI-node:

```bash
./scripts/qa.sh
```

Skrypt najpierw uruchamia testy unittest diagnostyki sieci runnera (bez sudo i bez instalacji systemowej), następnie instaluje oba lockfile przez `npm ci`, generuje i waliduje Prisma, sprawdza migrację istniejącego schematu i korektę OK, kompiluje backend, uruchamia komplet testów backendu (w tym testy pustej bazy, upgrade i regresję PostgreSQL), lint/build/testy frontendu, walidację Pomocy i kontrolę zależności. Błąd dowolnego kroku przerywa QA. Docker jest wymagany; testy bazodanowe nie mogą zostać pominięte w tym trybie.

Lokalnie skrypt tworzy własny kontener PostgreSQL z losowym portem wyłącznie na loopback i usuwa tylko ten kontener przy wyjściu. Testy migracyjne również używają kontenera o unikalnej nazwie i losowym porcie. Nie korzysta z `wtt_dev`, DEMO, `wtt_client_test` ani HomeLab. Testy zawierają wyłącznie fikcyjne dane. `QA_DATABASE_PORT` jest zarezerwowane dla świeżej usługi PostgreSQL workflow; skrypt odmawia przygotowania bazy, która już zawiera tabele. Nie należy kierować QA na istniejącą bazę.

Workflow `.github/workflows/ci.yml` wywołuje ten sam skrypt. Usługa PostgreSQL workflow jest odizolowana, z losowym portem na 127.0.0.1; nie wymaga sekretów. Nie ma osobnego zestawu testów lokalnych i CI. Zrzuty ekranów są generowane dodatkowo przez `cd frontend && npm run docs:screenshots` przy lokalnym backendzie na porcie 5001 i fikcyjnej bazie zakończonej `_docs`; nie wolno uruchamiać tego narzędzia z danymi klienta.

## Zależności

`dependency-audit.mjs` uruchamia rzeczywiste `npm audit --json` dla obu pakietów. Wypisuje wszystkie advisory i liczniki. Baseline w `scripts/qa/dependency-baseline.json` ujawnia zastane wyjątki wysokie/krytyczne, zamiast udawać brak podatności: backend 23 (14 moderate, 8 high, 1 critical), frontend 23 (15 moderate, 8 high). Nowe advisory high/critical poza jawną listą blokuje QA; brak połączenia z npm również blokuje. Zmiana listy wyjątków wymaga niezależnego review. Jest to bramka braku nowych poważnych podatności, a nie dowód usunięcia istniejących. Naprawa zastanych zależności wymaga osobnego, uzgodnionego zakresu.

## Self-hosted runner i ochrona gałęzi

Instalacja oraz warunki bezpieczeństwa są opisane w [instrukcji runnera](../ops/ci-runner/README.md). `runs-on: [self-hosted, Linux, X64, wtt]` jest docelowym kontraktem dedykowanej instancji; przed jej rejestracją job pozostaje w kolejce. Nie przekierowywać go na `ai-node-finance`.

Administrator powinien po pierwszym zielonym wykonaniu zaimportować/reviewować `ops/ci-runner/branch-ruleset.json` w Settings → Rules → Rulesets. Reguły obejmują development i main: PR wymagany, co najmniej jeden niezależny review, akceptacja ostatniego push przez inną osobę, odrzucenie starych akceptacji, rozwiązane dyskusje, wymagany zielony `WTT QA`, aktualna baza PR, brak force-push i usuwania. Nie dodawać bypass dla autora. Autor PR nie może zastąpić niezależnego review własną akceptacją. Szablon nie jest automatycznie stosowany i nie zmienia polityki repozytorium.
