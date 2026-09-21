# Ostoja — dom nad jeziorem

Interaktywny spacer 3D po domu z drewna i kamienia nad jeziorem, o zachodzie słońca. Krótki film prowadzi pod drzwi, które otwierają się do modelu 3D. Dalej można swobodnie rozglądać się po wnętrzu, wyjść na taras i popatrzeć na jezioro.

Strona jest w pełni statyczna (HTML, CSS, JavaScript i Three.js). Nie ma backendu, kont, śledzenia ani zewnętrznych CDN, a wszystkie biblioteki są w repozytorium.

## Sterowanie

| Akcja | Mysz / klawiatura | Dotyk |
| --- | --- | --- |
| Rozglądanie się | przeciągnij | przesuń palcem |
| Przejście w wybrane miejsce | kliknij podłogę | dotknij podłogi |
| Chodzenie | `W` `A` `S` `D` lub strzałki | przyciski kierunku |
| Kolejny etap spaceru | `Spacja` lub „Dalej” | „→” |
| Ukrycie interfejsu | `H` lub ikona oka | ikona oka |

Pasek u dołu pozwala przejść bezpośrednio do jednego z pięciu etapów: Próg, Salon, Nad jeziorem, Taras, Kuchnia.

## Uruchomienie lokalne

Stronę trzeba otworzyć przez serwer HTTP, bo moduły JavaScript i model 3D nie wczytają się z `file://`. Wystarczy dowolny serwer statyczny wskazujący na katalog `dist`, na przykład:

```bash
python -m http.server 8080 --directory dist
```

Następnie otwórz http://localhost:8080. Wymagana jest przeglądarka z WebGL 2 (aktualny Chrome, Edge, Firefox lub Safari).

## Publikacja (GitHub Pages)

Workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) publikuje katalog `dist` po każdym pushu na gałąź `main`. Źródło publikacji w repozytorium: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Wszystkie ścieżki są względne, więc strona działa pod adresem `https://<użytkownik>.github.io/<repozytorium>/`. Pełna wizyta pobiera około 25 MB (model 11 MB, film 7 MB albo 3 MB na telefonie).

## Struktura

```
dist/
  index.html, style.css   interfejs
  app.js                  scena, przejście z filmu do 3D, nawigacja i kolizje
  forest.js               las na wzgórzach, generowany przy wczytaniu (instancjonowany)
  quality.js              adaptacja jakości do wydajności urządzenia
  picking.js              wybór miejsca na podłodze po kliknięciu
  assets/                 model GLB (Draco), film intro, obrazy, panorama HDR
  vendor/                 Three.js r180 i dekoder Draco
```

## Technika

- Model przygotowany w Blenderze, eksport glTF z kompresją Draco i teksturami 1K.
- Jezioro z lustrzanym odbiciem krajobrazu, falami, efektem Fresnela i ścieżką słońca.
- Las (świerki, sosny i drzewa liściaste) rośnie w kępach, tylko tam, gdzie widać go z domu. Każdy gatunek to kilka instancjonowanych partii, więc fragmenty poza kadrem nie są rysowane.
- Postprocessing z MSAA, SSAO (desktop), subtelny bloom i tonemapping ACES.
- Jakość dopasowuje się do wydajności: przy trwałych spadkach klatek najpierw tanieją efekty, dopiero potem rozdzielczość, a po poprawie jakość wraca.
- Obsługiwane `prefers-reduced-motion`: bez filmu i przejazdów kamery, zamiast nich krótkie wygaszenia.

## Licencje i źródła

- Kod aplikacji: © autor repozytorium.
- [Three.js](https://threejs.org) — licencja MIT, zob. [`dist/vendor/THREE-LICENSE.txt`](dist/vendor/THREE-LICENSE.txt). Dekoder Draco — Apache 2.0.
- Tekstury i panorama z [Poly Haven](https://polyhaven.com) (CC0): [fine_grained_wood](https://polyhaven.com/a/fine_grained_wood), [wood_floor](https://polyhaven.com/a/wood_floor), [rough_linen](https://polyhaven.com/a/rough_linen), [rock_boulder_dry](https://polyhaven.com/a/rock_boulder_dry), [aerial_grass_rock](https://polyhaven.com/a/aerial_grass_rock), [kitchen_wood](https://polyhaven.com/a/kitchen_wood), [qwantani_sunset_puresky](https://polyhaven.com/a/qwantani_sunset_puresky).
- Film intro i obrazy hero należą do autora projektu.
