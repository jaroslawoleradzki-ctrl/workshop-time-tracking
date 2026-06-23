# Workshop Time Tracking

System ewidencji i raportowania czasu pracy przeznaczony do pracy w sieci lokalnej przedsiębiorstwa.

---

# Wymagania sprzętowe

## Minimalne

Dla zespołu do 20 użytkowników:

- CPU: 2 rdzenie
- RAM: 4 GB
- Dysk SSD: 20 GB wolnego miejsca
- System operacyjny:
  - Windows 11 Pro
  - Windows Server 2019/2022
  - Ubuntu Server 22.04 LTS
- Sieć LAN/Wi-Fi

## Rekomendowane

Dla zespołu 20–100 użytkowników:

- CPU: 4 rdzenie
- RAM: 8 GB
- SSD: 50 GB+
- Stały adres IP w sieci lokalnej
- Codzienny backup bazy danych

---

# Wymagane oprogramowanie

- Git
- Docker Desktop (Windows) lub Docker Engine (Linux)
- Docker Compose

Sprawdzenie instalacji:

```bash
docker --version
docker compose version
git --version
```

---

# Instalacja aplikacji

## Pobranie kodu źródłowego

```bash
git clone https://github.com/jaroslawoleradzki-ctrl/workshop-time-tracking.git
cd workshop-time-tracking
```

---

## Budowa frontendu

Obecna wersja wymaga jednorazowego zbudowania aplikacji frontendowej.

```bash
cd frontend
npm install
npm run build
cd ..
```

Po wykonaniu polecenia powinien zostać utworzony katalog:

```text
frontend/dist
```

---

## Uruchomienie aplikacji

W katalogu głównym projektu:

```bash
docker compose up -d --build
```

---

## Sprawdzenie poprawności uruchomienia

```bash
docker ps
```

Powinny być uruchomione kontenery:

```text
worktime-db
worktime-api
worktime-web
```

---

# Dostęp do aplikacji

## Na komputerze serwera

```text
http://localhost
```

## Z innych komputerów w sieci

Sprawdź adres IP serwera.

Windows:

```cmd
ipconfig
```

Linux:

```bash
ip addr
```

Przykład:

```text
192.168.1.50
```

Użytkownicy mogą otworzyć aplikację pod adresem:

```text
http://192.168.1.50
```

---

# Aktualizacja aplikacji

Pobranie najnowszej wersji:

```bash
git pull
```

Przebudowanie frontendu:

```bash
cd frontend
npm install
npm run build
cd ..
```

Aktualizacja kontenerów:

```bash
docker compose up -d --build
```

---

# Zatrzymanie aplikacji

```bash
docker compose down
```

---

# Ponowne uruchomienie aplikacji

```bash
docker compose up -d
```

---

# Backup bazy danych

Wykonanie kopii bezpieczeństwa:

```bash
docker exec worktime-db pg_dump -U time_user time_reporting > backup.sql
```

Zalecana częstotliwość:

- codziennie automatycznie
- dodatkowo przed każdą aktualizacją systemu

---

# Odtworzenie bazy danych

```bash
cat backup.sql | docker exec -i worktime-db psql -U time_user time_reporting
```

---

# Porty wykorzystywane przez aplikację

| Usługa | Port |
|----------|----------|
| Frontend (Nginx) | 80 |
| Backend API | 5000 |
| PostgreSQL | 5432 |

Jeżeli na serwerze działa firewall, port 80 powinien być dostępny dla użytkowników sieci lokalnej.

---

# Zalecenia produkcyjne

- Uruchamiać aplikację na dedykowanym komputerze lub serwerze.
- Ustawić stały adres IP.
- Wykonywać regularne backupy bazy danych.
- Ograniczyć dostęp do aplikacji wyłącznie do sieci firmowej.
- Aktualizacje wykonywać poza godzinami pracy użytkowników.
- Przed aktualizacją wykonać backup bazy danych.

---

# Wsparcie techniczne

W przypadku problemów z instalacją lub aktualizacją należy skontaktować się z administratorem systemu lub dostawcą aplikacji.
