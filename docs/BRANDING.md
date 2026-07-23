# Branding i konfiguracja środowiska demonstracyjnego

Dokument opisuje system centralnej konfiguracji brandingu w aplikacji frontendowej (Vite) oraz procedurę konfiguracji środowiska demonstracyjnego.

## Zmienne środowiskowe (Vite)

Branding aplikacji jest w pełni sterowany za pomocą zmiennych środowiskowych przekazywanych podczas budowania (Vite). Wymagane są następujące zmienne:

* `VITE_BRANDING` – nazwa aktywnego brandingu (np. `lasercad`). Wskazuje ona podkatalog w katalogu zasobów publicznych, z którego pobierane są logotypy.
* `VITE_APP_NAME` – krótka nazwa aplikacji wyświetlana na ekranie logowania oraz w nagłówku (navbarze) panelu głównego (np. `LaserCAD Time Tracking`).
* `VITE_APP_TITLE` – tytuł dokumentu HTML (`document.title`) ustawiany na karcie przeglądarki (np. `LaserCAD Rozliczenie Czasu Pracy`).
* `VITE_APP_DESCRIPTION` – opis aplikacji umieszczany w metadanych `meta description` oraz jako podtytuł na ekranie logowania (np. `System rejestracji i rozliczania czasu pracy LaserCAD`).
* `VITE_APP_DEMO` – flaga logiczna (`true` / `false`). Jeśli ma wartość `true`, na ekranie logowania wyświetlany jest dodatkowy komunikat informujący, że jest to środowisko demonstracyjne z fikcyjnymi danymi.

## Lokalizacja plików graficznych (brandingów)

Wszystkie zasoby graficzne dla poszczególnych brandingów powinny znajdować się w katalogu:
`frontend/public/branding/[nazwa-brandingu]/`

Dla domyślnego brandingu `lasercad` pliki znajdują się w:
`frontend/public/branding/lasercad/`

Katalog ten zawiera:
* `lasercad-logo-light.svg` – logotyp przeznaczony na ciemne tło (używany w motywie `dark`).
* `lasercad-logo-dark.svg` – logotyp przeznaczony na jasne tło (używany w motywie `light`).

W kodzie aplikacji ścieżki do logotypów są dynamicznie budowane na podstawie zmiennej `VITE_BRANDING`:
* `/branding/${VITE_BRANDING}/lasercad-logo-light.svg`
* `/branding/${VITE_BRANDING}/lasercad-logo-dark.svg`

## Sposób dodania nowego brandingu

Aby dodać nowy branding do aplikacji (np. dla klienta o nazwie `acme`):

1. **Przygotowanie plików graficznych:**
   Przygotuj dwa pliki wektorowe SVG o nazwach:
   * `lasercad-logo-light.svg` (logo dla motywu ciemnego)
   * `lasercad-logo-dark.svg` (logo dla motywu jasnego)
   *(Nazwy plików graficznych pozostają niezmienne w strukturze zasobów brandingu).*

2. **Umieszczenie zasobów w projekcie:**
   Utwórz katalog `frontend/public/branding/acme/` i umieść w nim przygotowane pliki.

3. **Konfiguracja środowiska:**
   Podczas uruchamiania lub budowania aplikacji przekaż odpowiednie zmienne środowiskowe, na przykład:
   ```bash
   VITE_BRANDING=acme \
   VITE_APP_NAME="Acme Time Tracking" \
   VITE_APP_TITLE="Acme Rozliczenie Czasu Pracy" \
   VITE_APP_DESCRIPTION="System rejestracji czasu pracy dla Acme Corp" \
   VITE_APP_DEMO=true \
   npm run build
   ```
