# rAlabaster Productieplanner — Changelog

This is a practical development log, not a full semantic-versioning history. It exists so future work can quickly understand recent changes and avoid reintroducing old problems.

## 2026-09-21

### Slimmere automatische planning en doorlopende iPad-weken

- Automatische deelblokken korter dan 30 minuten worden overgeslagen, behalve
  wanneer zo'n kort blok precies het laatste restant van een taak afrondt.
- Deadline en resterende speling wegen zwaarder dan sterren; bij gelijke
  urgentie wordt ★★★ vóór ★★ en daarna ★ gepland.
- Instellen en de bijbehorende machinebewerking blijven direct gekoppeld.
- Gelijke producten worden automatisch als batch gepland. Als batching een
  andere order verslechtert, toont de planner welke order opschuift en vraagt
  hij of deadlinevolgorde of samenvoegen moet winnen.
- Mori-bewerkingen (zonder instellen) en Polijsten krijgen standaard Shaffi als
  eerste voorkeur en Peter als tweede.
- De 3-wekenplanning toont ook `Nog in te plannen` en staat als drie verticaal
  doorlopende weken onder elkaar. Op iPad zijn ma–do zichtbaar, vrijdag
  gedeeltelijk en verschijnt zaterdag door horizontaal vegen.

### Workplekken, onderhoud en gereedschap

- Nieuwe tab `Werkplekken` met centrale uurtarieven, weekcapaciteit, insteltijd,
  drie voorkeursmedewerkers, alternatieve werkplekken en machine-KPI's.
- Voorkeursmedewerkers sturen de automatische planning als zachte voorkeur;
  bestaande harde beschikbaarheids- en planningsregels blijven gelden.
- Onderhoud en storingen kunnen per machine worden geboekt met uren, stilstand,
  kosten, leverancier, factuurnummer en volgende onderhoudsdatum.
- Nieuwe tab `Gereedschap` voor voorraad/minimumvoorraad en machinegeschiktheid.
- Gereedschapsfacturen kunnen exact procentueel over meerdere machines worden
  verdeeld; deze kosten tellen mee in de werkelijke machinekost per uur.
- Centrale tarieven worden gebruikt als standaard in nieuwe calculaties en
  productstappen; expliciet opgeslagen tarieven blijven behouden.

## 2026-09-14

### Editable intended task duration in planning review

- Each internal task now shows an editable `Beoogd` duration in hours.
- Changing that duration replans the task from its selected employee, date and
  start time, then recalculates the end time and all required day blocks.
- Shorter durations remove unnecessary later days; longer durations add them.
- Both comma and point decimal hour input are accepted.
- Relevant file: `assets/planning-order-controls-v1.js`.

### Every day of a multi-day task is editable in planning review

- Multi-day tasks now render one editable row per workday in the order planning
  review, including employee, date, start time and end time.
- Extending an earlier day consumes the task's remaining minutes on later days;
  later rows shrink or disappear when no work remains.
- If the entered earlier end time exceeds all remaining planned work, that exact
  end time becomes the task finish and the task estimate is updated accordingly.
- Relevant file: `assets/planning-order-controls-v1.js`.

### Automatic planning no longer starts in the past

- Automatic order planning now starts at the current time rounded up to the next
  15-minute boundary when planning from today.
- Before 08:15 it still starts at 08:15; after the workday the allocator advances
  to the next available work period.
- Existing planned work is preserved, and explicitly entered manual times remain
  allowed through the existing manual override flow.
- Relevant files: `assets/app.part02.txt`, `assets/planning-deadline-v2.js`.

### Manual task editing and Orders input fixes

- Replaced the one-day-only save restriction with a single manual task save route.
- Each block has editable start/end dates and times; multiple edits save together.
- Manual times can be confirmed despite overlap, dependencies, deadlines, absence,
  overtime or weekend work. The chosen times are locked; no other task or customer
  deadline is changed. Completion retains its existing release/history workflow.
- Optional total-duration preservation reallocates only this task's remaining
  minutes to free future slots, merging across breaks. Turning it off derives
  the new task duration from the entered times. Pause work is an explicit option.
- Compared actual edited field values, avoiding false changes in legacy segments
  where elapsed time and productive minutes differ. Fractional legacy durations
  are displayed safely without changing unedited stored values.
- Orders search now replaces results only, retaining the search node, keyboard
  focus and query when typing, sorting or changing filters.
- Removed forced native picker activation on pointerdown; input gestures are not
  rerouted into modal buttons. This applies to future modals as well.
- Added isolated calculation and DOM regression tests with synthetic orders.
  The test harness has no database connection and is excluded from deployment.

## 2026-09-12

### Added persistent project memory

- Added `PROJECT_CONTEXT.md` with architecture, planning rules, performance rules, workflow conventions, and data/sync guidance.
- Added `DECISIONS.md` with durable product/technical decisions.
- Added this `CHANGELOG.md`.

### Existing-order → Calculatie workflow

- Added a bridge from an opened order to Calculatie.
- Existing order can be edited without creating a duplicate.
- Intended controls include order fields, pricing/material values and production steps.
- Remaining movable steps are replanned after saving.
- Optional checkbox can update the product template for future orders.
- Added a follow-up fix so the `Naar calculatie` button waits for the async order modal to exist before injection.

Relevant files:
- `assets/order-calculation-bridge-v1.js`
- `assets/order-calculation-button-fix-v1.js`

### Internal expected ready date

- Added background maintenance of `internalExpectedDate`.
- Existing imported orders should also receive a calculated internal ready date.
- Calculation was deliberately kept out of ordinary render loops to protect performance.

Relevant file:
- `assets/internal-ready-date-v1.js`

### Mobile / iPad responsive UI

- Added responsive behavior for phone and iPad.
- Navigation becomes horizontally scrollable.
- Touch targets and inputs are larger.
- Forms collapse to fewer columns.
- Modals use most of the mobile viewport.
- Wide planning/table views remain horizontally scrollable.
- Added viewport safe-area support.

Relevant file:
- `assets/mobile-responsive-v1.css`

## 2026-09-11

### Performance regression fixed

Major slowdown was traced to three patterns introduced during feature work:

1. `renderOrders()` triggered a full production `scenario()` recalculation on ordinary render.
2. staff availability used a broad MutationObserver and rescanned planning cards after DOM changes.
3. product batching also used a broad MutationObserver.

Fixes:
- full planning scenarios removed from passive order rendering;
- staff availability moved away from broad DOM observation;
- batching button behavior moved away from broad continuous DOM scanning.

Result: normal navigation became fast again.

### Supabase sync redesign

- Operational data moved to normalized order/task tables.
- Full operational snapshot removed from the normal sync route.
- Cloud persistence decoupled from navigation/UI rendering.
- Local interaction remains immediate while Supabase syncs in the background.

### Performance layer

- Added indexing/caching layer for orders, tasks, scheduled entries, machine options, etc.
- Exact planning remains available for explicit planning actions.
- Passive screens use lightweight/cached calculations.

Relevant file:
- `assets/performance-v1.js`

### Deadline-driven planning

- Added deadline-based planning and scenario logic.
- Setup/run sequence preservation.
- Normal capacity / Peter / overtime scenarios available explicitly.
- Added buffer deadline model.

Relevant files:
- `assets/planning-deadline-v2.js`
- `assets/planning-deadline-fixes-v2.js`
- `assets/planning-deadline-render-fix-v1.js`

### Product batching

- Added preference for identical products to run consecutively when deadlines remain safe.
- Shared setup behavior supported where safe.

Relevant file:
- `assets/planning-product-batching-v2.js`

### Staff availability

- Added vacation/absence handling as capacity constraints.
- Added customer planning PDF functionality.

Relevant file:
- `assets/staff-availability-customer-planning-v2.js`

### Excel bulk import

- Imported initial batch of production orders and tasks from Excel.
- Material and external-cost mappings added.
- Gildemeister-specific import support added.

Important: never rerun the old import blindly over live data.

Relevant files:
- `assets/bulk-excel-import-v1.js`
- `assets/bulk-excel-gildemeister-v1.js`

---

## Update policy

After a meaningful work session, add a short entry containing:

- what changed;
- why it changed;
- important behavior/constraints;
- relevant files;
- any regression or performance lesson that must not be forgotten.

Do not use this file as a dump of every tiny CSS or text change. Keep it useful for resuming development in a future chat.

## 2026-09-21 — plannen vanuit het doorlopende wekenoverzicht

- `Nog in te plannen` staat als vaste, afzonderlijk scrollbare kolom links van de doorlopende wekenplanning.
- Openstaande taken kunnen vanuit die kolom direct worden aangepast of verwijderd.
- Per order kan een licht weergegeven planningvoorstel worden gemaakt. Het voorstel blijft concept totdat `Definitief vastleggen` wordt gekozen.
- Concepttaken kunnen worden verschoven, in duur/tijd worden aangepast of verwijderd; afhankelijke vervolgtaken schuiven daarna door naar de volgende geschikte plek.
- De iPad-weergave gebruikt de beschikbare breedte voor maandag t/m donderdag, met vrijdag gedeeltelijk zichtbaar en zaterdag via horizontaal vegen.

Relevant: `assets/app.part03.txt`, `assets/planning-week-proposal-v1.js`, `assets/styles.css`.

### Aanvulling: doorlopend laden en compacte blokken

- Bij omlaag scrollen worden steeds vier volgende weken toegevoegd, zodat de planning praktisch oneindig doorloopt.
- De wekenplanning opent standaard in een beknopte weergave met alleen tijd, taak en machine.
- Via `Uitgebreid overzicht` / `Beknopt overzicht` kan de gebruiker direct wisselen; Planning vandaag blijft uitgebreid.

### Taakvenster en machine-iconen

- Compacte weekblokken tonen een vast icoon per soort machine/bewerking, de tijd en alleen de taaknaam zonder ordernummer.
- Bij het openen van een ingeplande taak toont het taakvenster de klantdeadline, de actuele verwachte gereeddatum en alle volgende taken met hun geplande moment.
- Bij een niet-ingeplande taak blijft deze extra orderplanning verborgen.

### Duidelijke werkpleklogo's in compacte planning

- De tijdelijke tekens zijn vervangen door zelfgetekende SVG-logo's voor draaibank, robot, schuren/polijsten, boren, zagen, lijmen, drogen, assemblage, controle en inpakken.
- Mori-werkplekken gebruiken hetzelfde draaibanklogo met een nummerbadge; Mori ZL15 #1/#2 en SL25 worden zo als 1/2/3 herkenbaar.
- Een compact blok toont alleen het logo, de tijd en bijvoorbeeld `52x Shelby`; taaknaam, werkpleknaam en ordernummer staan er niet meer in.
- De logo's zijn verder verkleind en hebben per werkplektype een eigen silhouet én kleur, zodat bijvoorbeeld draaibank, robot, schuurmachine, zaag, boor en lijmen niet meer op elkaar lijken.
- De totale ingeplande dagtijd staat voortaan op een eigen regel boven de blokken en kan het eerste werkpleklogo niet meer opzij duwen.
- Een generieke stap `Mori instellen` neemt waar mogelijk automatisch het nummer over van de aansluitende Mori-bewerking binnen dezelfde order.
# 2026-09-14 — betrouwbare schermbediening (20260914-2)

- Zoeken en deadlineprioriteit gebruiken vaste gedelegeerde events; sterren blijven werken na zoeken/pagineren en schrijven naar de actuele order.
- Datum, tijd en datum+tijd openen een gedeelde, expliciete keuzebox met kalender en invoer van uren/minuten; oorspronkelijke velden blijven de gegevensbron voor opslaan en herberekenen.
- Pointerup/coordinate-workarounds activeren geen knoppen meer achter invoervelden. Elke tik heeft één klikactie.
- Commerciële orderknoppen worden niet meer continu verwijderd en opnieuw toegevoegd; de observer stopt zodra het scherm is bijgewerkt.
- Opstartfout door de niet-bestaande saveQuickComplete-referentie hersteld naar de bestaande confirmQuickComplete-functie.
- Integratietests laden nu alle lokale scripts uit index.html in beide opstartvolgordes, met synthetische gegevens en zonder netwerk/databaseverbinding.
- 29 regressietests: zoeken met focusbehoud, sterren opslaan, openblijvende datum-/tijdkeuze, validatie/annuleren, toekomstige pop-ups, onveranderde andere taken.
# 2026-09-21 — Resterende dagcapaciteit

- In de doorlopende wekenplanning staat nu direct hoeveel tijd een medewerker die dag nog vrij heeft (`Nog 20 min`, `Vol` of `Overpland`).
- De resterende tijd blijft gebaseerd op alle ingeplande taken, ook wanneer op een werkplek wordt gefilterd.
# 2026-09-22 — AI-productieleider fase 1

- Nieuw tabblad `AI planner` met chat, actuele aandachtspunten, vrije capaciteit en batchkansen.
- De AI werkt uitsluitend in meekijk-/adviesmodus en kan de planning niet rechtstreeks wijzigen.
- `Veilig planningvoorstel` opent de bestaande conceptplanner; definitief opslaan blijft een aparte goedkeuring.
- Handmatige planningswijzigingen, feedback en redenen worden opgeslagen als beslislogboek.
- Expliciete voorkeuren kunnen aan de planner worden geleerd; terugkerende patronen worden alleen ter bevestiging voorgesteld.
- Online AI loopt via een beveiligde Vercel-functie en vereist een geldige Supabase-sessie; bij uitval blijft een lokale planneranalyse beschikbaar.
