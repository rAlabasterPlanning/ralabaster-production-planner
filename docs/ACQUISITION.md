# Acquisitie — zelfstandige module

Prospects, beoordelingen, gesprekken, aanvragen en sampleverzendingen staan uitsluitend in `acquisition_*` tabellen. Bestaande plannerklanten en orders worden alleen gelezen voor analyse en uitsluiting. Er is geen automatische conversie naar klanten, calculaties, offertes, portaalaccounts of productieorders. Ralph maakt die later zelf. Een aanvraag is een acquisitierecord, geen planner-offerte.

## Publicatiestatus

Publicatie expliciet goedgekeurd door Ralph op 13 oktober 2026. Code gepubliceerd via de gekoppelde GitHub-app; Vercel bevestigt een geslaagde productiebuild voor e277db3. Navigatie en nieuwe bestanden zijn op de productie-URL gecontroleerd. De acquisition-opslag is ingericht en getest; bestaande plannerrecords zijn niet veranderd. Account- en scheduleractivering blijft nog open.

## Gebruik

Meer → Acquisitie. De tien inrichtingsstappen worden met revisiecontrole opgeslagen. Eigen voorbeelden zijn standaard niet openbaar; publicatie vereist expliciete toestemming. Klantspecifieke prijzen worden niet geïmporteerd als prospectaanbod. Klantvoorkeuren en beoordelingen worden tijdens onderzoek meegestuurd als data. Ontbrekende kostgegevens leveren geen vermeende marge op.

Na commerciële inrichting kan een beheerder een onderbouwde wereldwijde zoekronde starten. Deze gebruikt de bestaande Vercel AI Gateway, de geïnstalleerde AI SDK en Perplexity Search. Alleen bronlinks die werkelijk in de zoekresultaten voorkomen worden geaccepteerd. Adressen moeten letterlijk in opgehaalde broninhoud staan. Er worden geen adressen uit naamspatronen afgeleid. Een ontbrekend adres wordt na goedkeuring verder onderzocht, zonder Ralph met een handmatige zoektakenlijst te belasten.

Er worden maximaal tien nieuwe bedrijven per Amsterdamse dag opgeslagen. Een achterblijvende selectie krijgt bij de volgende ronde nieuw onderzoek. Geen kwaliteitsverlaging of verzonnen aanvulling. Oude onbeoordeelde prospects blijven beschikbaar. Dubbele websites en eerder gevonden/bestaande bedrijfsnamen worden uitgesloten.

## Eenmalige technische activering

De bestaande plannerdeployment is `https://ralabasterplanner.vercel.app`. De huidige Vercel connector kan deze deployment niet vinden in het aangesloten team; technische accountprovisioning kan daardoor niet uit deze sessie worden uitgevoerd. Configureer uitsluitend in de juiste hostingomgeving, nooit in frontend, chat, broncode of wizard-data:

- `SUPABASE_SERVICE_ROLE_KEY`: servercredential voor de bestaande Supabase database. Alleen servergebruik.
- `ACQUISITION_TOKEN_KEY`: base64 van 32 willekeurige bytes, gebruikt voor AES-256-GCM encryptie van refreshtokens.
- `ACQUISITION_MICROSOFT_CLIENT_ID` / `ACQUISITION_MICROSOFT_CLIENT_SECRET`: Microsoft appregistratie voor de mailbox.
- `ACQUISITION_MICROSOFT_TENANT`: optioneel; default `common`.
- `ACQUISITION_PUBLIC_ORIGIN`: optioneel; standaard plannerorigin hierboven.
- `CRON_SECRET`: willekeurig servergeheim voor de cron-endpoints.
- `ACQUISITION_SCHEDULER_READY=true`: pas nadat de scheduler op de juiste deployment werkelijk is ingesteld en getest.
- `ACQUISITION_MODEL`: optionele modeloverride; standaard bestaand plannermodel via Vercel AI Gateway.

Microsoft Web redirect URI: `https://ralabasterplanner.vercel.app/api/acquisition?action=callback`. Delegated permissions: User.Read, Mail.ReadWrite, Mail.Send, offline_access. OAuth gebruikt state, browsercookie, PKCE en eenmalige serverstate. Refresh tokens worden alleen versleuteld opgeslagen; geen toegang voor anon/authenticated. Na technische inrichting kan Ralph in stap Accounts veilig zijn mailbox selecteren. Het ingevulde afzenderadres moet overeenkomen met die mailbox.

De scheduler doet GET met `Authorization: Bearer <CRON_SECRET>`:

- `/api/acquisition-job?task=search` ieder uur. De handler zoekt na het ingestelde Amsterdamse tijdstip en vult de dagselectie aan.
- `/api/acquisition-job?task=followup` ieder kwartier. Maximaal vier berichten per ronde; een databaselease voorkomt overlappende uitvoering.

Gebruik Vercel Cron alleen wanneer het hostingplan deze frequentie ondersteunt. Voeg na verificatie deze crons aan vercel.json toe, of gebruik een bestaande externe scheduler. Er staan bewust geen onbevestigde cronfrequenties in de productieconfiguratie.

Automatisch verzenden staat standaard uit en kan alleen worden geactiveerd na complete commerciële inrichting, werkende mailbox en geconfigureerde scheduler. Onderzoek vooraf is handmatig beschikbaar. De statuspagina beweert niet dat ontbrekende koppelingen actief zijn.

## Kanalen

Outlook/Microsoft 365: OAuth, draft → send en prospectgebonden reacties lezen zijn geïmplementeerd. Cold followups stoppen bij iedere reactie. Standaard interesse-/sample-/offertevragen krijgen een persoonlijke reactie met besloten aanvraaglink; uitzonderingen worden als beoordelingsactie getoond. Na geregistreerde sampleverzending wordt eenmaal na vijf dagen ontvangst/feedback en een mogelijk ontwerp uitgevraagd. Buiten-kantoorreacties stoppen de koude reeks; hervatting is nog niet automatisch geïmplementeerd.

LinkedIn: openbare research en profielverwijzingen; er is geen ondersteunde berichtenconnector aangesloten. Gewone login geeft geen vrije API-toegang tot koude berichten.

Instagram: openbare research; er is geen koude-DM-connector geïmplementeerd. De standaard berichten-API kan niet willekeurig alle prospects koud benaderen. Deze kanalen worden niet als gekoppeld of automatisch werkend getoond.

## Aanvragen en uploads

`/aanvraag?token=...` is prospectgebonden, heeft een einddatum en bevat alleen goedgekeurd openbaar aanbod. Samples/offerteaanvragen blijven acquisitierecords. Uploads gaan rechtstreeks naar een private bucket via een ondertekende uploadtoken; maximaal 20 MB en alleen STEP/STP/PDF/PNG/JPG. Geen bestand gaat naar de productieplanner. Aanvraagopslag is transactioneel en idempotent. De medewerker registreert de fysieke sampleverzending binnen Acquisitie.

De mailboxpipeline schrijft een verzendclaim voordat de provider wordt aangeroepen. Onzekere providerresultaten worden niet automatisch opnieuw verstuurd. Pauze/afmelding wordt vlak voor verzending opnieuw gecontroleerd. Laatste-milliseconde races tussen een al aangevraagde providerverzending en afmelding kunnen niet worden teruggedraaid.

## Verificatie

`node --test tests/acquisition.test.cjs tests/acquisition-ui.test.cjs` (jsdom uit tests dependency of via PLANNER_JSDOM_PATH). Bestaande navigatie en klantpreviewtests eveneens uitgevoerd. `tests/acquisition-db.sql` controleert onder echte database-rollen adminrechten, geheimen, stale saves, dubbele beoordeling en dubbele intake binnen een teruggerolde transactie.

Live zoekresultaten en echte verzending worden pas geverifieerd na aanbod- en accountinrichting. Er zijn tijdens ontwikkeling geen prospects aangeschreven. Visuele browser-QA is in deze managed omgeving niet beschikbaar zonder control-browser; DOM-flows zijn wel getest.
