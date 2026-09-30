# rAlabaster Planner – actuele projectstatus

Laatst bijgewerkt: 30 september 2026  
Productie: https://ralabasterplanner.vercel.app

Dit bestand is het vaste overdrachtslogboek voor de planner. Het blijft in de repository staan wanneer een ChatGPT-gesprek onvolledig wordt geladen.

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
