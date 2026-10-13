# Acquisitie — zelfstandige module

Prospects, beoordelingen, gesprekken, aanvragen en sampleverzendingen staan uitsluitend in `acquisition_*` tabellen. Bestaande plannerklanten en orders worden alleen gelezen voor analyse en uitsluiting. Er is geen automatische conversie naar klanten, calculaties, offertes, portaalaccounts of productieorders. Ralph maakt die later zelf. Een aanvraag is een acquisitierecord, geen planner-offerte.

## Publicatiestatus

Publicatie expliciet goedgekeurd door Ralph op 13 oktober 2026. Code gepubliceerd via de gekoppelde GitHub-app; Vercel bevestigt een geslaagde productiebuild voor e277db3. Navigatie en nieuwe bestanden zijn op de productie-URL gecontroleerd. De acquisition-opslag is ingericht en getest; bestaande plannerrecords zijn niet veranderd. Account- en scheduleractivering blijft nog open.

## Gebruik

Meer → Acquisitie. De tien inrichtingsstappen worden met revisiecontrole opgeslagen. Eigen voorbeelden zijn standaard niet openbaar; publicatie vereist expliciete toestemming. Klantspecifieke prijzen worden niet geïmporteerd als prospectaanbod. Klantvoorkeuren en beoordelingen worden tijdens onderzoek meegestuurd als data. Ontbrekende kostgegevens leveren geen vermeende marge op.

Na commerciële inrichting kan een beheerder een onderbouwde wereldwijde zoekronde starten. Deze gebruikt de bestaande Vercel AI Gateway, de geïnstalleerde AI SDK en Perplexity Search. Alleen bronlinks die werkelijk in de zoekresultaten voorkomen worden geaccepteerd. Adressen moeten letterlijk in opgehaalde broninhoud staan. Er worden geen adressen uit naamspatronen afgeleid. Een ontbrekend adres wordt na goedkeuring verder onderzocht, zonder Ralph met een handmatige zoektakenlijst te belasten.

Er worden maximaal tien nieuwe bedrijven per Amsterdamse dag opgeslagen. Een achterblijvende selectie krijgt bij de volgende ronde nieuw onderzoek. Geen kwaliteitsverlaging of verzonnen aanvulling. Oude onbeoordeelde prospects blijven beschikbaar. Dubbele websites en eerder gevonden/bestaande bedrijfsnamen worden uitgesloten.

## Berichten vooraf bekijken en goedkeuren

Tab Berichten en stap Toon & talen tonen de daadwerkelijke gedeelde HTML-layout: origineel logo, tekst, eigen openbaar aanbod met staffels, projectknop en ondertekening. Desktop-/telefoonweergave via een sandboxed iframe. Basisteksten en onderwerpen zijn bewerkbaar. De voorbeeldontvanger is fictief; bekijken en goedkeuren verstuurt niets.

Alle benodigde introductie-, opvolg-, interesse-, sample-, offerte- en samplefeedbackteksten moeten beschikbaar zijn. Een beheerder bevestigt expliciet dat de berichten en opmaak zijn bekeken. Goedkeuring wordt met revisiecontrole opgeslagen. De runtime vergelijkt de volledige goedgekeurde basis met de huidige teksten, aanbod, voorwaarden, ondertekening en layoutversie. Een wijziging blokkeert nieuwe verzendingen tot hernieuwde goedkeuring, ook als de oude verzendschakelaar nog aanstond.

De basisversie is Engels; niet-beoordeelde vertalingen worden niet automatisch verstuurd. De aanhef wordt ingevuld. AI schrijft alleen de korte feitelijke persoonlijke opening van de introductie; de goedgekeurde basisteksten worden niet vrij herschreven. De mailrenderer is dezelfde code voor preview en daadwerkelijke Graph HTML-berichten.

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

## Unipile: LinkedIn en Instagram (13 oktober 2026)

De aparte acquisitiemodule ondersteunt Unipile v1/DSN. Accounts blijven in de service-only `acquisition_connections` tabel, met AES-GCM versleutelde account-ID's. Wachtwoorden worden uitsluitend in Unipile Hosted Auth ingevoerd. De accounts worden aan één beheerder gekoppeld via een eenmalige, tien minuten geldige notify-capability; het accounttype wordt vervolgens via de provider gecontroleerd. Een reconnect hergebruikt het account zodat geen extra betaalde identiteit wordt aangemaakt. Ontkoppelen pauzeert verzending en verwijdert ook de Unipile-identiteit.

Eenmalige serverconfiguratie, naast de bestaande service-key, encryptiesleutel en scheduler:

- `ACQUISITION_UNIPILE_DSN`: de HTTPS DSN uit het Unipile-dashboard, bijvoorbeeld `https://api1.unipile.com:12345` (geen `/api/v1` suffix). Alleen Unipile API-hosts worden geaccepteerd.
- `ACQUISITION_UNIPILE_API_KEY`: server-only sleutel uit hetzelfde Unipile-proefaccount. Niet in Git, browser, settings of chat plakken.
- Herdeploy na het instellen van environment variables. Deze connector is niet getest met een echte Unipile-identiteit zolang het proefaccount en deze secrets ontbreken.

In **Meer → Acquisitie → Inrichting → Accounts** selecteert Ralph de gewenste kanalen en koppelt hij LinkedIn/Instagram. Microsoft is alleen verplicht als mail geselecteerd is. In **Berichten** staan afzonderlijke concepten voor uitnodigingen, chats, opvolging, sample- en offerteaanvragen. Wijzigingen aan kanalen, teksten, aanbod of voorwaarden maken de eerdere berichtgoedkeuring ongeldig. Chats gebruiken plain text met goedgekeurde staffels en een persoonlijke intake-link; LinkedIn en Instagram bepalen zelf hun UI-opmaak. Uitnodigingen zijn maximaal 200 tekens; een langere tekst blokkeert goedkeuring/verzending.

De bestaande beveiligde `acquisition-job` voert de sociale ronde uit onder dezelfde exclusieve databaselease als mail. Productieplanning is nog afhankelijk van een werkende scheduler; configureer de bestaande search-job dagelijks en followup-job regelmatig volgens de eerder beschreven hostingvoorwaarden, en zet `ACQUISITION_SCHEDULER_READY=true` pas na verificatie. Zonder scheduler geen actieve automatische opvolging. Dagplafonds in Europe/Amsterdam: 10 LinkedIn-uitnodigingen, 10 LinkedIn-chats, 10 Instagram-chats. Ambigue verzendpogingen tellen conservatief mee en worden nooit automatisch herhaald. Een ronde verwerkt maximaal 20 sociale verzendingen; grotere achterstanden worden in volgende rondes opgepakt. Tien dagelijkse prospects garanderen niet tien acties per kanaal: geschikte onderbouwde profielen, acceptaties en providerbeschikbaarheid bepalen de werkelijke aantallen.

Onderzoek zoekt alleen publieke, letterlijk gevonden profiel-URL's. LinkedIn vereist een benoemde persoon en `/in/`-profiel; geen bedrijfspagina. Instagram gebruikt het bedrijfsprofiel en voor chats het `provider_messaging_id`. LinkedIn-uitnodigingen worden gevolgd door wachten op acceptatie via `is_relationship`, daarna start de chat. Er worden geen InMails gebruikt. Mail en sociale reeksen worden niet tegelijkertijd op hetzelfde bedrijf gestart. Binnen sociale kanalen kan hetzelfde goedgekeurde bedrijf op LinkedIn en Instagram worden benaderd. Een reactie stopt beide standaardreeksen; afwijzing stopt het hele traject. Gevolgde gesprekken worden vóór koude opvolging gepolld en bericht-ID's worden deduplicated. Bij meer dan 500 berichten in een gesprek wacht het kanaal op synchronisatie. Providerfouten stoppen het betreffende kanaal voor die ronde en worden zichtbaar bij Acties. Quotes en fysieke sampleverzending blijven bij Ralph/het team; aanvragen blijven in de eigen acquisitietabellen.

Praktijktest na configuratie: koppelen/reconnect/ontkoppelen, berichten expliciet goedkeuren, één goedgekeurd proefbedrijf uitnodigen, acceptatie afwachten, chat en intake testen, reactie/opt-out en dagplafonds controleren. Geen verzending vóór goedkeuring en activatie. De lokale tests gebruiken gemockte providerresponses en bewijzen geen providerbeschikbaarheid of accountveiligheid.
