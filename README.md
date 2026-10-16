# WFRP4e: Zamiana kości (5ed)

Moduł do Foundry VTT przenoszący do 4. edycji mechanikę **zamiany kości z 5. edycji Warhammera** (tę używaną w *Maledictus*): cyfry rzutu k100 zamieniają się na korzystniejszą kolejność. Rzuciłeś **63**? Z zamianą liczy się **36**.

Dwa tryby (ustawienie *Tryb*):

- **Opcja w oknie testu** (domyślny) — w oknie każdego testu jest pole **„Zamiana kości”**, zaznaczane ręcznie jak *Szarża*. Przewaga z 4. edycji (+10 za punkt) działa bez zmian; zamiana to osobny bonus, który MG może przyznać za okoliczności, talent, sprzęt — cokolwiek przy stole uznacie.
- **Przewaga binarna** — playtest zapowiedzi 5ed: Przewagę się ma albo nie ma, a gdy się ją ma, zamiana działa sama i domyślnie **zastępuje** +10 za punkt.

## Instalacja

W Foundry: **Setup → Moduły dodatkowe → Zainstaluj moduł**, w polu *Adres URL manifestu* wklej:

```
https://github.com/Ilinar/wfrp4e-dice-swap/releases/latest/download/module.json
```

Nowe wersje pojawiają się potem przy **Sprawdź aktualizacje** na liście modułów.

## Co potrafi

1. **Checkbox „Zamiana kości” w oknie testu** — w testach cech, umiejętności, broni, cech stworów, zaklęć i modlitw, tuż nad *Trybem rzutu*. Przeżywa zmianę trudności i innych pól okna. Karta testu pokazuje oba rzuty z ikoną ⇄ oraz krótki dopisek.
2. **Makra i rzuty bez okna** — przekaż `pbReverse: true` w kontekście testu (np. `actor.setupSkill("Unik", { pbReverse: true })`), żeby pole było z góry zaznaczone; przy `skipDialog` zamiana zadziała bez okna.
3. **Tryb Przewagi binarnej** — zamiana przy `Przewaga > 0`, z ustawieniami zakresu (walka / wszystkie testy) i zachowania bonusu +10. Działa też przy rzutach automatycznych (`skipDialog`, m.in. `wfrp4e-dungeon`, `wfrp4e-auto-defense`).
4. **Nie wchodzi w drogę talentom.** Talenty, które same odwracają rzut na lepsze (Plotkowanie, Konsumpcja alkoholu), mają pierwszeństwo; klątwy odwracające *na gorsze* nie są nadpisywane. Węższe odwrócenie z Badań („tylko gdy porażka staje się sukcesem”) zaznaczenie pola świadomie rozszerza do „zawsze na lepsze”.

## Bezpieczeństwo

Zamiany cyfr **nie liczy ten moduł** — jest ona wbudowana w system WFRP4e (`preData.reversal` w `TestWFRP.computeResult`) i używana przez talenty z podręcznika. Moduł jedynie ją **włącza** dla właściwych testów. Dzięki temu wszystkie przypadki brzegowe (rzut 100, rzuty jednocyfrowe, tryby poziomów sukcesu, przeliczenie krytyków i fumbli, rysowanie na karcie czatu, zapis do wiadomości) obsługuje sam system.

Natywne funkcje są wołane **najpierw**, każdy hook jest w `try/catch`, a błąd modułu nigdy nie przerywa rzutu — w najgorszym razie wynik będzie czysto systemowy. Moduł **nie zapisuje** żadnych ustawień systemu, więc jego wyłączenie natychmiast przywraca czyste zasady 4. edycji.

## Ustawienia

| Ustawienie | Domyślnie | Opis |
|---|---|---|
| Włącz zamianę kości (5ed) | włączone | Wyłączenie przywraca czyste zasady systemu. Rzuty już wykonane pozostają bez zmian. |
| Tryb | Opcja w oknie testu | Alternatywa: Przewaga binarna 5ed (zastępuje 4ed). |
| Zachowaj systemowy bonus z Przewagi | wyłączone | Tylko Przewaga binarna. Domyślnie zamiana cyfr **zastępuje** +10 za punkt. Włącz, aby oba działały naraz. |
| Zakres testów | Walka i testy przeciwstawne | Tylko Przewaga binarna. Alternatywa: wszystkie testy. Poza zakresem Przewaga działa jak w 4. edycji. |
| Dopisek na karcie testu | włączone | Linijka „Zamiana kości: 63 → 36” na karcie wyniku. |

### Tryb Przewagi binarnej — uwagi

> Przy zakresie „Walka i testy przeciwstawne" rzut z **cechy** (WW, US) ani z umiejętności **nie jest** testem bojowym, dopóki nie ma celu ani trwającego testu przeciwstawnego — moduł go wtedy celowo nie rusza. Za walkę uznawany jest atak **bronią lub cechą stwora** (bez potrzeby celowania), obrona w teście przeciwstawnym oraz każdy test wykonany na cel.

**Twarda binarność licznika** (żeby Przewaga nie rosła powyżej 1) nie jest ustawieniem modułu — system ma to od zawsze: *Ustawienia systemu → Limit Punktów Przewag = 1*. Moduł tego nie rusza, bo własna klamra kłóci się z Przewagą grupową i po cichu psuje zasady wydawania Przewagi (akcje grupowe z *Up in Arms*, właściwość Rozcinająca).

## Zgodność

- Foundry VTT v13–v14
- System `wfrp4e` — testowane na 9.5.0
- `lib-wrapper` opcjonalnie (jest ręczny fallback), `warhammer-lib` przychodzi z systemem
- Współpracuje z `wfrp4e-dungeon` i `wfrp4e-auto-defense` (rzuty automatyczne), z Przewagą grupową oraz z regułami domowymi systemu

## Skutki uboczne zamiany (świadome, sprawdzone w kodzie — oba tryby)

Zamiana cyfr zmienia sam rzut, a system w kilku miejscach czyta jego cyfry. Warto to znać:

- **Krytyki i fumble z dubletów są bezpieczne.** Dublet (11, 22, … 99) jest palindromem, więc nigdy nie jest zamieniany, a żaden inny rzut nie zamieni się w dublet. Rzut 100 też jest nietykalny.
- **Największy efekt to ucieczka z automatycznej porażki.** 96 → 69, 97 → 79, 98 → 89 omijają zarówno próg automatycznej porażki, jak i wymuszone PS −1. Pasmo automatycznej porażki kurczy się z pięciu rzutów do dwóch (99 i 100).
- **Przebijająca może stracić krytyka.** Krytyk Przebijającej zapada przy rzucie podzielnym przez 10; 30 → 3 go kasuje.
- **Modlitwy: Gniew Bogów.** Wywołuje go cyfra jedności; 30 → 3 przy Grzechu 3 uruchomi Gniew, którego bez zamiany by nie było.
- **Pancerz Częściowy.** System sprawdza parzystość rzutu; zamiana ją odwraca.
- **Tryb „Szybki PS” odwraca regułę.** Przy tym trybie system uznaje za lepszy *wyższy* udany rzut (bo PS to cyfra dziesiątek), więc 38 przy celu 85 zmieni się w 83. Moduł ostrzega o tym MG przy starcie.
- **Dice So Nice** pokaże kość 63, a karta 36 — kość rzucana jest przed zamianą.
- **Oburęczność** jest celowo wyłączona: system liczy rzut ręki zbrojnej jako odwrócony rzut głównej, więc ponowna zamiana skasowałaby tę zasadę.
- **„Edytuj test”** ma pierwszeństwo: rzut wpisany ręcznie przez MG nie jest zamieniany.
- **Przerzut** karty rzuconej z zamianą też jest z zamianą (zapamiętana na karcie).

## Znane ograniczenia

- Moduł nie implementuje odwrócenia *na gorsze* (Niekorzyści).
- W trybie Przewagi binarnej licznik Przewagi nadal rośnie normalnie (2, 3, 4…), choć dla rzutu liczy się tylko „>0”.

## English (summary)

Brings the **WFRP 5th edition dice swap** to 4e: the digits of a d100 test roll are swapped to whichever order is better (63 → 36). By default it is a **"Swap dice" checkbox in every test dialog** (like Charging), leaving 4e Advantage untouched; macros can pre-tick it with `pbReverse: true` in the test context. An alternative **Binary Advantage** mode applies the swap automatically whenever the character has Advantage and replaces the +10 per point bonus. The swap itself is the system's own `preData.reversal` mechanic, so all edge cases — 100, single-digit rolls, SL methods, criticals and fumbles, chat card rendering — are handled natively. Talent-driven reversals take precedence. Localized (pl/en).

## Autor

[Ilinar](https://github.com/Ilinar)

## Zastrzeżenie

Nieoficjalny moduł fanowski, niezwiązany z Games Workshop ani Cubicle 7. Warhammer Fantasy Roleplay jest znakiem towarowym Games Workshop Ltd.
