---
title: "1. Zarządzanie Użytkownikami"
order: 1
roles: ["admin"]
componentIds: ["screen-users"]
screenshotIds: ["admin-users-table"]
diagramIds: []
lastUpdatedVersion: "0.4.4"
includeInUserManual: false
includeInAdminManual: true
---

# 1. Zarządzanie Użytkownikami Systemu

## Nazwa ekranu
Administracja — Zarządzanie Kontami Użytkowników (`UsersView`)

## Cel
Tworzenie nowych kont użytkowników, edycja danych osobowych, przypisywanie ról systemowych (Administrator / Lider) oraz resetowanie haseł dostępowych.

## Opis
Ekran administracyjny przeznaczony do nadzorowania dostępu do aplikacji. Umożliwia aktywację/dezaktywację kont oraz kontrolę uprawnień.

![Zarządzanie Użytkownikami](docs/images/06_admin_users_table.png)

## Opis pól

| Pole | Typ | Opis |
| :--- | :--- | :--- |
| **Login (username)** | Tekstowe | Unikalny identyfikator logowania. |
| **Imię i nazwisko** | Tekstowe | Pełne dane osobowe użytkownika. |
| **Rola** | Wybór (`admin` / `leader`) | Uprawnienia w systemie. Admin ma dostęp do wszystkich modułów; Lider zarządza raportowaniem i zleceniami. |
| **Status konta** | Aktywny / Nieaktywny | Konta nieaktywne nie mogą się zalogować. |

## Opis przycisków

| Przycisk | Działanie |
| :--- | :--- |
| **+ Dodaj Użytkownika** | Otwiera formularz tworzenia nowego konta. |
| **Resetuj Hasło** | Ustawia nowe tymczasowe hasło dla wybranego użytkownika. |
| **Edytuj** | Otwiera edycję danych osobowych i roli. |

## Instrukcja krok po kroku
1. Przejdź do zakładki **Administracja -> Użytkownicy**.
2. Kliknij przycisk **+ Dodaj Użytkownika**.
3. Wypełnij formularz podając login, imię i nazwisko oraz wybierz rolę.
4. Kliknij **Zapisz**.

> [!IMPORTANT]
> Konta ról `admin` mają dostęp do modułów konfiguracji słowników i importu danych.

> [!WARNING]
> Dezaktywacja konta nie usuwa historii złożonych raportów czasu.

## Miejsce wykonania operacji
Menu boczne: **Administracja -> Użytkownicy**.

## Checklista testów UAT

| Scenariusz | Kroki | Oczekiwany rezultat |
| :--- | :--- | :--- |
| Utworzenie lidera | 1. Dodaj użytkownika `leader2`<br>2. Przypisz rolę Lider<br>3. Zapisz | ✓ Konto zostało utworzone<br>✓ Nowy lider może się zalogować |
