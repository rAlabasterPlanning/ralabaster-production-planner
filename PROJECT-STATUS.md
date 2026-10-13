# rAlabaster Planner – actuele projectstatus

Laatst bijgewerkt: 13 oktober 2026
Productie: https://ralabasterplanner.vercel.app

Dit bestand is het vaste overdrachtslogboek voor de planner. Het blijft in de repository staan wanneer een ChatGPT-gesprek onvolledig wordt geladen.

## Acquisitie — berichtvoorbeelden en goedkeuring (13 oktober 2026)

- Tab Berichten en inrichting Toon & talen: bewerkbare onderwerpen/basisteksten en echte mailopmaak, desktop en telefoon.
- Dezelfde HTML-renderer wordt gebruikt voor preview en Graph-verzending. Origineel logo, goedgekeurde productvoorbeelden, staffels en ondertekening.
- Verzenden vereist aparte expliciete goedkeuring van alle berichttypen. Tekst-, aanbod-, voorwaarden-, afzender- en layoutwijzigingen maken die goedkeuring ongeldig.
- AI past alleen de persoonlijke openingsalinea aan. Niet-beoordeelde talen vallen terug op de beoordeelde Engelse basis.
- Bekijk-/goedkeuracties versturen niets en raken uitsluitend de aparte acquisitie-inrichting.

## Acquisitie openen en logo hersteld (13 oktober 2026)

- Headernavigatie opent de lazy acquisitiemodule rechtstreeks; de bestaande touch-router onderschept niet meer de initialisatie.
- Via Meer en directe link gecontroleerd met de werkelijke dynamisch geladen module, aparte databasequeries en een weergegeven eerste inrichtingsstap.
- Het originele witte logo op grijze achtergrond wordt zonder omkerend filter getoond. Mobiel geen botsende minimum-/maximumbreedte en geen afsnijding.
- Gerichte navigatie-, inrichting- en logobrontests slagen. De brede oude interactiesuite heeft 11 bestaande afwijkingen; alle 11 zijn ook zonder deze wijziging gereproduceerd. Geen wijzigingen aan productieplanning gedaan.

## Acquisitie — aparte module, gepubliceerd (13 oktober 2026)

- Publicatie expliciet goedgekeurd door Ralph. Live via GitHub/Vercel (commit e277db3).
- Nieuwe databaseopslag is toegepast en getest; bestaande plannergegevens zijn niet gewijzigd.
- Meer → Acquisitie, met tien opgeslagen inrichtingsstappen, klantanalyse, prospectbeoordeling en eigen opvolging/aanvragen.
- Eigen acquisition-tabellen; bestaande klanten/orders alleen lezen. Geen automatische omzetting naar plannerklant, calculatie, offerte, portaalaccount of productieorder. Ralph maakt die zelf.
- Brongebonden wereldwijde zoekfunctie via bestaande AI Gateway; feedback en huidige klantprofielen sturen de selectie. Expliciet goedgekeurd aanbod met echte staffels.
- Outlook OAuth en serveropvolging voorbereid; automatisch verzenden blijft uit tot commerciële inrichting, mailbox en scheduler zijn aangesloten en getest.
- LinkedIn/Instagram zijn nog geen automatische koude-berichtenkanalen. Dit staat zichtbaar in de inrichting.
- Prospectgebonden sample-/offertepagina met private STEP/tekening-upload. Aanvragen blijven binnen Acquisitie.
- Technische activering en verificatie: docs/ACQUISITION.md. Hostingproject niet zichtbaar via de huidige Vercel-connector; accountprovisioning en unattended scheduler nog open.

## Tijdafwijking per machine (13 oktober 2026)

- Gepubliceerd op 13 oktober 2026 (commit 6a35758).
- Ralph corrigeerde de gewenste meting: gemiddelde productietijd per goed stuk tegenover de calculatietijd, weergegeven als ondertekende afwijking.
- 4 min begroot / 5 min werkelijk = +25% rood; 4 min begroot / 3 min werkelijk = −25% groen; gelijk = 0% neutraal.
- De machinekaart toont beide minutenwaarden, order en gemeld goed aantal. Live en achteraf ingevoerde productie worden meegenomen, inclusief afgesloten historie ouder dan 30 dagen.
- Instellen, storing, wachten en gereedschap beïnvloeden dit cyclustijdpercentage niet. Handwerk gebruikt verdeelde productieve medewerkeruren.
- Ontbrekende aantallen of tijden blijven expliciet onbekend. Bedragen en tarieven zijn niet nodig voor deze meting.
- Read-only RPC production_cost_snapshot is al aanwezig en levert de benodigde berekende route en historie. Het registreren blijft ongewijzigd.
- Verificatie: 20 rekentests en browserflows op tv/iPad/telefoon; eerdere databasecontrole onder authenticated in een teruggerolde transactie.

## Productiepagina en startstanden (13 oktober 2026)

- Actieve machines bovenaan, grote product/medewerker/voortgang, directe knop Aantallen doorgeven. Vrije machines compact; orders verschijnen bij werkkeuze.
- Orderprognose en verdere acties staan onder Details & acties. Beheerfuncties staan onder Meer.
- Registratieherinneringen staan als één duidelijke inline melding en markeren de knop bij de machine.
- Meer → Startstand / telling (of Details bij een machine) legt totale productietijd, goed gemaakte stuks en uitval vast per machine/bewerking, inclusief werk van vóór de invoering.
- De database bewaart een gecontroleerde aansluiting op bestaande registraties, met wijzigingshistorie en bescherming tegen dubbele opslag/verouderde invoer. Volgende tellingen sluiten aan op de startstand.
- Tempo, voortgang en orderprognose nemen de startstand mee; oude plannerbaseline wordt voor die bewerking niet nogmaals toegevoegd.
- Verificatie: 31 rekentests, uitgebreide browserflows op tv/iPad/telefoon en teruggerolde databasecontrole voor startstand, vervolgtelling, herhaalde opslag en concurrentie.

## Uitbreiding werkvloer: orderprognose en meetmomenten

Publicatie goedgekeurd door Ralph op 13 oktober 2026.

- Per machine: huidige taakafwijking, opgetelde tijdwinst/uitloop van eerdere taken en verwachte totale ordertijd tegenover voorcalculatie.
- Machinekleur: groen volgens norm of sneller, oranje bij uitloop tot 20%, rood vanaf 20%. Ontbrekende registratie krijgt apart een signaal.
- Begrote taken van 4 tot 8 uur: meetmoment halverwege de productietijd. Meerdaagse taken: rond middag en voor einde werkdag. Pauzes tellen niet als productietijd.
- Registratiepop-up vraagt cumulatieve aantallen, uitval en verbruik. De server boekt alleen het verschil; herhaalde opslag en dagafsluiting tellen niets dubbel.
- Prognose gebruikt werkelijk bestede tijd, resterende productie op gemeten tempo en normen voor latere taken. Onvolledige gegevens worden zichtbaar vermeld.
- Verificatie: 30 rekentests, browserflows op tv/iPad/telefoon en teruggerolde databasecontrole voor totalen, voorraadverschillen, herhaalde opslag en stale invoer.

## Live en gecontroleerd

- Order- en offertedata worden niet meer als volledige lijsten overschreven bij het opslaan vanuit een ander scherm.
- Bescherming tegen onbedoeld verwijderen is actief voor orders, offertes en taken.
- Deadlines en taakstatussen gebruiken de nieuwste serverversie, zodat een ouder apparaat recente wijzigingen niet terugzet.
- Snelle orders kunnen met een bestaande klant of een losse klantnaam worden toegevoegd en verschijnen bovenaan om later aan te vullen.
- Klantmodus en marges verbergen zijn beschikbaar via Instellingen.
- Een order kan vanuit het orderoverzicht worden afgerond, waarna nacalculatie kan worden gecontroleerd en een pakbon als PDF in een Outlook-bericht kan worden geopend.
- De mobiele weergave voor order afronden is hersteld.

## Back-up en herstel

- Elk uur wordt automatisch een databaseherstelpunt gemaakt; bewaartermijn 7 dagen.
- Dagelijks wordt automatisch een herstelpunt gemaakt; bewaartermijn 90 dagen.
- Via **Instellingen → Back-up en herstel** kan een beheerder:
  - de back-upstatus bekijken;
  - handmatig een herstelpunt maken;
  - een volledige JSON-back-up downloaden;
  - een herstelpunt vooraf bekijken;
  - na expliciete bevestiging veilig herstellen.
- Voor elk herstel wordt eerst automatisch een extra herstelpunt gemaakt.
- Herstel is transactioneel getest met 53 orders en 362 taken.
- Automatische externe opslag naar OneDrive staat nog open. Tot die koppeling klaar is, kan de volledige JSON-back-up handmatig in OneDrive worden bewaard.

## Belangrijke recente wijzigingen

- `36729027ec51c060a1aa35676c804280e3a64428` — Back-up- en herstelcentrum.
- `34d99736a8ef3a30578a9dbabe6b181251e81eed` — Bescherming voor orderstatus en taakvoortgang.
- `da93ea538c673ac31be2947c6ae95190f2ce941b` — Bescherming voor deadlines op meerdere apparaten.
- `8960a14156587c2d8e6d13177dbcbdcf7de6b015` — Mobiele orderafronding.
- `c6fe25be0cf1f178db7cdb0810f75a51fb168066` — Nacalculatie en Outlook-pakbon.
- `8505f...` — Dagelijkse back-ups en offertebeveiliging.

## Werkwijze bij vervolgwerk

1. Controleer dit bestand en de laatste commits voordat nieuwe wijzigingen worden gemaakt.
2. Werk deze status bij na iedere livegang die gegevens, back-ups of hoofdprocessen wijzigt.
3. Ververs alle gebruikte apparaten na een nieuwe livegang.
4. Behandel GitHub, de database-migraties en dit statusbestand als de vaste technische bron wanneer chatberichten ontbreken.

## Open punt

- OneDrive eenmalig koppelen voor automatische externe back-upkopieën.
