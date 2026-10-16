// WFRP4e: Zamiana kości (5ed)
//
// Mechanika z WFRP 5ed: cyfry rzutu k100 zamieniane są na korzystniejszą kolejność
// (63 → 36). Dwa tryby (ustawienie "mode"):
//   manual — checkbox „Zamiana kości” w oknie testu (jak Szarża); Przewaga z 4ed
//            działa bez zmian. Domyślny.
//   auto   — Przewaga binarna: zamiana zawsze, gdy postać ma Przewagę (> 0); domyślnie
//            ZASTĘPUJE systemowy bonus z Przewagi (+10 za punkt).
//
// Moduł nie liczy zamiany sam — ona JEST już w systemie:
//   TestWFRP.computeResult() czyta preData.reversal {allowed, if}   (wfrp4e.js:7670-7723)
//   _rollIsBetter() — świadome trybu PS "fast"/"dos"/domyślnego      (wfrp4e.js:8726-8749)
//   obsługa 100 i rzutów jednocyfrowych                              (wfrp4e.js:7671-7677)
//   karta czatu rysuje originalRoll + <i class="fa-shuffle">         (test-card.hbs:5-17)
// Moduł tylko WŁĄCZA tę ścieżkę dla właściwych testów.
//
// Zweryfikowane API (numery linii w bundlach, wfrp4e 9.5.0 / warhammer-lib 3.3.2):
//   Hooks.call("wfrp4e:createRollDialog", dialog)          warhammer-lib.js:14348
//     — leci w konstruktorze, PO przypisaniu data/context/fields.
//   _prepareContext: userEntry → fields                     warhammer-lib.js:14658-14668
//     — potem computeScripts() → computeFields()            warhammer-lib.js:14674-14675
//     — skrypty talentów ustawiają data.reversal PRZED computeFields, więc decyzję
//       podejmujemy w shadowie computeFields (i nigdy nie obniżamy cudzego reversal).
//   _onRender: change na KAŻDY element z [name]            warhammer-lib.js:14451-14455
//   _onFieldChange: userEntry[name] = checked + re-render   warhammer-lib.js:14850-14866
//     — wstrzyknięty <input type="checkbox" name="pbReverse"> zachowuje się jak
//       pole z szablonu (Szarża: weapon-dialog.hbs:12-19). Re-render podmienia
//       elementy części okna, więc wstrzykujemy przy każdym _onRender.
//   _getSubmissionData(): mergeObject(this.data, this.fields)  warhammer-lib.js:14570
//     — stąd data.reversal wpada prosto do preData.reversal  (wfrp4e.js:7496)
//   bypass() (ścieżka skipDialog) też idzie przez _prepareContext + _getSubmissionData
//                                                          warhammer-lib.js:14591-14604
//   RollDialog._computeAdvantage() — bonus +10 / +1 PS      wfrp4e.js:9055-9070
//   ActorWFRP4e.isOpposing (!!flags.oppose)                 wfrp4e.js:14459
//     — używamy go zamiast .attacker (wfrp4e.js:14540), bo tamten czyta wiadomość
//       i w catch robi actor.update() — odczyt zamieniłby się w zapis.
//   AttackDialog.get attackType — istnieje TYLKO na dialogach ataku   wfrp4e.js:10597
//     — klasy dialogów nie są eksportowane na game.wfrp4e (wfrp4e.js:35199-35241),
//       więc instanceof jest niemożliwe; duck-typing jest odporniejszy od nazwy klasy.
//   Hooks.call("wfrp4e:rollTest", test, chatOptions)        wfrp4e.js:7562
//     — po computeResult, przed renderRollCard.
//   game.wfrp4e.rolls.TestWFRP                              wfrp4e.js:35220
//
// UWAGA: "wfrp4e:createRollDialog" i "wfrp4e:rollTest" to Hooks.call, nie callAll —
// zwrócenie false przerywa łańcuch innym modułom. Wszystkie handlery mają ciała blokowe.

const MODULE_ID = "wfrp4e-dice-swap";
const NOTE_MARK = "pb-swap-note";
const FIELD = "pbReverse"; // nazwa pola w oknie testu i klucz context dla makr

const loc = (k) => game.i18n.localize(k);
const log = (...a) => console.log(`${MODULE_ID} |`, ...a);

let _wired = false;

/* ------------------------------------------------------------------ */
/* Ustawienia                                                          */
/* ------------------------------------------------------------------ */

Hooks.once("init", () => {
  const reg = (key, data) =>
    game.settings.register(MODULE_ID, key, { scope: "world", config: true, ...data });

  reg("enabled", {
    name: "PB.Settings.Enabled.Name",
    hint: "PB.Settings.Enabled.Hint",
    type: Boolean,
    default: true,
  });

  reg("mode", {
    name: "PB.Settings.Mode.Name",
    hint: "PB.Settings.Mode.Hint",
    type: String,
    default: "manual",
    choices: {
      manual: "PB.Settings.Mode.Manual",
      auto: "PB.Settings.Mode.Auto",
    },
  });

  reg("keepSystemBonus", {
    name: "PB.Settings.KeepSystemBonus.Name",
    hint: "PB.Settings.KeepSystemBonus.Hint",
    type: Boolean,
    default: false,
  });

  reg("scope", {
    name: "PB.Settings.Scope.Name",
    hint: "PB.Settings.Scope.Hint",
    type: String,
    default: "combat",
    choices: {
      combat: "PB.Settings.Scope.Combat",
      all: "PB.Settings.Scope.All",
    },
  });

  reg("chatNote", {
    name: "PB.Settings.ChatNote.Name",
    hint: "PB.Settings.ChatNote.Hint",
    type: Boolean,
    default: true,
  });
});

// Obronny odczyt — ustawienie może jeszcze nie istnieć.
function setting(key, fallback) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch (e) {
    return fallback;
  }
}

const isManual = () => setting("mode", "manual") !== "auto";

/* ------------------------------------------------------------------ */
/* Helpery                                                             */
/* ------------------------------------------------------------------ */

const targetCount = (t) => t?.length ?? t?.size ?? 0;

// Przy Przewadze grupowej wartość na aktorze bywa nieaktualna: _handleGroupAdvantage
// (wfrp4e.js:6897) wycina ją z aktualizacji, a synchronizację robi tylko GM i tylko dla
// combatantów (wfrp4e.js:14754-14763). Czytamy wtedy źródło prawdy.
function advantageOf(actor) {
  try {
    if (game.settings.get("wfrp4e", "useGroupAdvantage")) {
      const v = game.settings.get("wfrp4e", "groupAdvantageValues") || {};
      return Number(v[actor?.advantageGroup]) || 0; // advantageGroup: wfrp4e.js:14575
    }
  } catch (e) {
    /* brak ustawienia — spadamy do wartości z aktora */
  }
  return Number(actor?.system?.status?.advantage?.value) || 0;
}

function hasAdvantage(actor) {
  return advantageOf(actor) > 0;
}

// Walka lub test przeciwstawny — po stronie okna testu.
function isCombatDialog(dialog) {
  if (dialog?.actor?.isOpposing) return true; // obrona: flags.oppose (wfrp4e.js:14459)
  if (dialog && "attackType" in dialog) return true; // AttackDialog+ (wfrp4e.js:10597)
  if (targetCount(dialog?.data?.targets) > 0) return true; // dowolny test na cel
  return false;
}

// To samo po stronie gotowego testu (siatka bezpieczeństwa).
function isCombatTest(test) {
  if (test?.actor?.isOpposing) return true;
  if (["WeaponTest", "TraitTest"].includes(test?.preData?.rollClass)) return true; // wfrp4e.js:7484
  if (targetCount(test?.context?.targets) > 0) return true;
  return false;
}

// Oburęczność: OpposedHandler (wfrp4e.js:17086-17103) podaje jako offhandReverse JUŻ
// ODWRÓCONY rzut głównej ręki, a WeaponTest.roll() (wfrp4e.js:10484) przypina go do
// preData.roll. Nasze if:"better" odwróciłoby go z powrotem i skasowało regułę.
// Test "unopposed" to atrapa — nie renderuje karty ani nie odpala hooków (wfrp4e.js:7581).
function isExcludedContext(ctx) {
  return !!(ctx?.dualWieldOffhand || ctx?.unopposed);
}

function inScopeDialog(dialog) {
  return setting("scope", "combat") !== "combat" || isCombatDialog(dialog);
}

function inScopeTest(test) {
  return setting("scope", "combat") !== "combat" || isCombatTest(test);
}

// Tryb manual: wybór gracza w oknie, a bez niego wartość z context (makra, skipDialog:
// actor.setupSkill(..., { pbReverse: true })). Odznaczenie w oknie wygrywa z makrem.
function wantsReverse(dialog) {
  const entry = dialog?.userEntry;
  if (entry && FIELD in entry) return !!entry[FIELD];
  return !!dialog?.context?.[FIELD];
}

/* ------------------------------------------------------------------ */
/* Tryb manual — checkbox w oknie testu                                */
/* ------------------------------------------------------------------ */

function injectReverseField(dialog) {
  const root = dialog.element;
  if (!root || root.querySelector(`[name="${FIELD}"]`)) return;

  const group = document.createElement("div");
  group.classList.add("form-group", "pb-reverse");
  group.dataset.tooltip = loc("PB.Dialog.ReverseHint");
  group.dataset.tooltipDirection = "LEFT";

  const label = document.createElement("label");
  label.textContent = loc("PB.Dialog.Reverse");

  const fields = document.createElement("div");
  fields.classList.add("form-fields");

  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = FIELD;
  input.checked = wantsReverse(dialog);

  fields.append(input);
  group.append(label, fields);

  // Tuż nad „Trybem rzutu”, czyli pod Trudnością/Szarżą/Lokacją trafienia.
  const rollMode = root.querySelector('[name="rollMode"]')?.closest(".form-group");
  if (rollMode) {
    rollMode.before(group);
    return;
  }
  const host =
    root.querySelector('[data-application-part="specific"]') ??
    root.querySelector('[data-application-part="fields"]');
  host?.append(group);
}

function wireManualDialog(dialog) {
  // Wstrzyknięcie PRZED bazowym _onRender — ten podpina change na wszystkie [name]
  // (warhammer-lib.js:14451), więc obsługę kliknięcia dostajemy od systemu za darmo.
  if (typeof dialog._onRender === "function") {
    const baseRender = dialog._onRender.bind(dialog);
    dialog._onRender = async function (...args) {
      try {
        injectReverseField(dialog);
      } catch (e) {
        console.error(`${MODULE_ID} | checkbox w oknie testu — pomijam`, e);
      }
      return baseRender(...args);
    };
  }

  const base = dialog.computeFields.bind(dialog);
  dialog.computeFields = async function () {
    await base(); // najpierw natywne — przy błędzie modułu zostaje wynik systemowy
    try {
      // _prepareContext nigdy nie czyści this.data, więc własny zapis zdejmujemy,
      // przywracając ewentualne węższe odwrócenie talentu, które podnieśliśmy.
      const own = dialog.data.reversal;
      if (own?.source === MODULE_ID) {
        if (own.prior) dialog.data.reversal = own.prior;
        else delete dialog.data.reversal;
      }
      if (!wantsReverse(dialog)) return;

      const cur = dialog.data.reversal;
      // Talent z "better" już robi to samo; "worse"/"failure" (klątwy) — NIE RUSZAMY.
      // Węższe "success" (Badania) gracz świadomie podnosi do "better".
      if (cur?.allowed && cur.if !== "success") return;
      dialog.data.reversal = {
        allowed: true,
        if: "better",
        source: MODULE_ID,
        ...(cur?.allowed ? { prior: cur } : {}),
      };
    } catch (e) {
      console.error(`${MODULE_ID} | computeFields — rzut bez zmian`, e);
    }
  };
}

/* ------------------------------------------------------------------ */
/* Tryb auto — Przewaga binarna                                        */
/* ------------------------------------------------------------------ */

function wireAutoDialog(dialog) {
  if (!inScopeDialog(dialog)) return;

  // Wygaszenie systemowego bonusu z Przewagi. Shadow instancji, nie ustawienie świata:
  // "autoFillAdvantage" bywa zapisywane przez sam system przy Przewadze grupowej
  // (wfrp4e.js:16423), więc modyfikowanie go zostawiałoby trwały ślad w świecie.
  // Shadow zakładamy tylko na okna w zakresie — poza zakresem Przewaga działa jak w 4ed.
  if (!setting("keepSystemBonus", false)) dialog._computeAdvantage = function () {};

  // Decyzję o zamianie podejmujemy dopiero w computeFields, czyli PO computeScripts
  // (warhammer-lib.js:14674-14675) i przy AKTUALNEJ Przewadze — gracz może ją zmienić
  // w oknie testu (base-dialog.hbs:5 → _onAdvantageChanged, wfrp4e.js:9107), a hook
  // konstruktora leci tylko raz.
  const base = dialog.computeFields.bind(dialog);
  dialog.computeFields = async function () {
    await base(); // najpierw natywne — przy błędzie modułu zostaje wynik systemowy
    try {
      // _prepareContext nigdy nie czyści this.data (warhammer-lib.js:14636-14676),
      // więc własny zapis kasujemy przed ponowną oceną warunków.
      if (dialog.data.reversal?.source === MODULE_ID) delete dialog.data.reversal;
      if (dialog.data.reversal?.allowed) return; // talent/klątwa — NIE OBNIŻAMY
      if (!hasAdvantage(dialog.actor)) return;
      dialog.data.reversal = { allowed: true, if: "better", source: MODULE_ID };
    } catch (e) {
      console.error(`${MODULE_ID} | computeFields — rzut bez zmian`, e);
    }
  };
}

/* ------------------------------------------------------------------ */
/* Wpięcie główne — okno testu                                         */
/* ------------------------------------------------------------------ */

Hooks.on("wfrp4e:createRollDialog", (dialog) => {
  try {
    if (game.system?.id !== "wfrp4e") return;
    if (!setting("enabled", false)) return;
    if (!dialog?.data || !dialog.actor) return;
    if (typeof dialog.computeFields !== "function") return;
    if (isExcludedContext(dialog.context)) return;

    if (isManual()) wireManualDialog(dialog);
    else wireAutoDialog(dialog);
  } catch (e) {
    console.error(`${MODULE_ID} | createRollDialog — rzut bez zmian`, e);
  }
});

/* ------------------------------------------------------------------ */
/* Siatka bezpieczeństwa — testy budowane bez okna + Edytuj test       */
/* ------------------------------------------------------------------ */

function netBeforeComputeResult(test) {
  if (!setting("enabled", false)) return;
  if (!test?.preData) return;

  // Edytuj test: edit() (wfrp4e.js:7618) przypina ręcznie wpisany rzut i woła roll()
  // ponownie. Bez tego MG wpisujący 63 dostałby 36 — ostatnie słowo należy do MG.
  if (test.context?.edited) {
    if (test.preData.reversal?.source === MODULE_ID)
      test.preData.reversal = { allowed: false, if: "better" };
    return;
  }

  // W trybie manual zamiana wynika wyłącznie z wyboru w oknie testu.
  if (isManual()) return;

  if (test.preData.reversal?.allowed) return; // ustawione przez okno albo talent
  if (isExcludedContext(test.options) || isExcludedContext(test.context)) return;
  if (!hasAdvantage(test.actor)) return;
  if (!inScopeTest(test)) return;

  test.preData.reversal = { allowed: true, if: "better", source: MODULE_ID };
}

function wireTestNet() {
  const TestCls = game.wfrp4e?.rolls?.TestWFRP;
  if (typeof TestCls?.prototype?.computeResult !== "function") {
    log("API testów WFRP4e niedostępne — pomijam siatkę bezpieczeństwa.");
    return;
  }

  const useLW = typeof libWrapper !== "undefined" && game.modules.get("lib-wrapper")?.active;

  if (useLW) {
    libWrapper.register(
      MODULE_ID,
      "game.wfrp4e.rolls.TestWFRP.prototype.computeResult",
      function (wrapped, ...args) {
        try {
          netBeforeComputeResult(this);
        } catch (e) {
          console.error(`${MODULE_ID} | siatka computeResult — wynik natywny`, e);
        }
        return wrapped(...args);
      },
      "WRAPPER"
    );
    log("siatka bezpieczeństwa przez lib-wrapper");
    return;
  }

  if (TestCls.prototype.computeResult.__pbWrapped) return;
  const orig = TestCls.prototype.computeResult;
  const w = function (...args) {
    try {
      netBeforeComputeResult(this);
    } catch (e) {
      console.error(`${MODULE_ID} | siatka computeResult — wynik natywny`, e);
    }
    return orig.apply(this, args);
  };
  w.__pbWrapped = true;
  TestCls.prototype.computeResult = w;
  log("siatka bezpieczeństwa przez ręczną nakładkę (brak lib-wrapper)");
}

/* ------------------------------------------------------------------ */
/* Dopisek na karcie testu                                             */
/* ------------------------------------------------------------------ */

Hooks.on("wfrp4e:rollTest", (test) => {
  try {
    if (game.system?.id !== "wfrp4e") return;
    if (!setting("chatNote", false)) return;
    if (!test?.result) return;

    const other = (test.result.other ??= []);

    // Idempotentnie: reroll/addSL/edit ponownie zasiewają result.other z preData.other
    // (reset(), wfrp4e.js:8347-8355), więc własny dopisek najpierw usuwamy.
    for (let i = other.length - 1; i >= 0; i--)
      if (typeof other[i] === "string" && other[i].includes(NOTE_MARK)) other.splice(i, 1);

    if (!test.result.reversed) return;
    if (test.preData?.reversal?.source !== MODULE_ID) return; // zamiana z talentu — nie nasza

    other.push(
      `<span class="${NOTE_MARK}">` +
        game.i18n.format("PB.Chat.Swapped", {
          orig: test.result.originalRoll,
          roll: test.result.roll,
        }) +
        `</span>`
    );
  } catch (e) {
    console.error(`${MODULE_ID} | dopisek na karcie — wynik bez zmian`, e);
  }
});

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

Hooks.once("ready", () => {
  try {
    if (game.system?.id !== "wfrp4e") return;
    if (_wired) return;
    _wired = true;

    wireTestNet();

    // Tryb "fast" odwraca sens reguły: _rollIsBetter (wfrp4e.js:8731-8734) uznaje przy
    // dwóch sukcesach za lepszy WYŻSZY rzut, bo PS to cyfra dziesiątek.
    try {
      if (game.user?.isGM && game.settings.get("wfrp4e", "SLMethod") === "fast")
        ui.notifications.warn(loc("PB.Warn.FastSL"), { permanent: true });
    } catch (e) {
      /* brak ustawienia — pomijamy ostrzeżenie */
    }

    const api = { MODULE_ID, FIELD, isManual, advantageOf, hasAdvantage, isCombatDialog, isCombatTest };
    const mod = game.modules.get(MODULE_ID);
    if (mod) mod.api = api;
    Hooks.callAll(`${MODULE_ID}.ready`, api);
    log("gotowe");
  } catch (e) {
    console.error(`${MODULE_ID} | ready`, e);
  }
});
