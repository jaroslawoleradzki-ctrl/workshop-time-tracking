Deployment aplikacji Workshop Time Tracking

Branching

* development – codzienna praca i testy.
* main – stabilna wersja produkcyjna wdrażana u klienta.

Workflow developerski

Na lokalnym komputerze:

git checkout development
# praca nad zmianami
git add .
git commit -m "opis zmiany"
git push origin development

Po przetestowaniu zmian:

git checkout main
git pull origin main
git merge development
git push origin main

Wdrożenie u klienta

Na serwerze klienta:

cd ~/workshop-time-tracking
git pull origin main
docker compose up -d --build

Po wdrożeniu sprawdź kontenery:

docker ps

Sprawdź logi backendu:

docker logs worktime-api --tail=50

Oczekiwane komunikaty:

Applying database migrations...
Starting backend application...
Server is running on port 5000

Baza danych

Aplikacja korzysta z wolumenu Docker:

workshop-time-tracking-main_pgdata

W docker-compose.yml wolumen powinien być przypięty jako zewnętrzny:

volumes:
  pgdata:
    external: true
    name: workshop-time-tracking-main_pgdata

Nie usuwać wolumenu bez backupu.

Migracje

Migracje Prisma uruchamiają się automatycznie przy starcie backendu przez:

npx prisma migrate deploy

Nie trzeba wykonywać migracji ręcznie przy standardowym wdrożeniu.

Podstawowa kontrola po wdrożeniu

Sprawdź:

1. Czy działa strona aplikacji.
2. Czy można się zalogować.
3. Czy działa lista pracowników/zleceń.
4. Czy działa dodawanie raportu czasu.
5. Czy kontenery mają status Up.

Rollback awaryjny

Jeśli nowa wersja nie działa:

cd ~/workshop-time-tracking
git log --oneline
git checkout <HASH_POPRZEDNIEJ_WERSJI>
docker compose up -d --build

Po ustabilizowaniu sytuacji wróć do main:

git checkout main
git pull origin main

Ważne katalogi na serwerze

Aktualna aplikacja:

/home/admin/workshop-time-tracking

Backup starej wersji:

/home/admin/workshop-time-tracking-main_backup_before_git

Nie usuwać backupu, dopóki produkcja nie będzie stabilna przez kilka kolejnych wdrożeń.
