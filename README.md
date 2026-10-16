# rAlabaster Productieplanner

Vaste broncode voor de online rAlabaster productieplanner.

- Hoofdplanner: `index.html`
- Werkvloer voor medewerkers: `werkvloer.html`
- Backend/data: Supabase
- Hosting: Vercel

Deze repository is voortaan de bron voor doorlopende verbeteringen. Nieuwe commits op `main` kunnen door Vercel automatisch naar dezelfde productieomgeving worden uitgerold zodra de Git-integratie éénmalig is gekoppeld.

## Productieorders afdrukken

Bij iedere order staat **Print deze order**. In Orderoverzicht en Orders staat
**Print alle lopende orders**; deze knop neemt alle actuele lopende orders mee,
onafhankelijk van het zoekfilter of de zichtbare pagina. De aparte afdrukweergave
haalt orders, taken, klantgegevens en de werkvloerstand opnieuw op uit Supabase.
Bij een leesfout wordt geen verouderde afdruk gemaakt.

Elke order krijgt één A4 met het bestaande rAlabaster-logo. Lange routes worden
passend geschaald. Het afdrukvenster bevat ook een knop om opnieuw af te drukken of
als PDF op te slaan. Sta pop-ups toe en zet browserkop- en voetteksten uit.

Gereed product komt uit een expliciete ordertelling of de telling van de laatste
productiestap, met de bestaande werkvloeraggregatie (inclusief startstanden en
historie). Tussenstanden worden niet opgeteld over opeenvolgende stappen.
Percentageregistraties, standaard nullen en handmatige routecorrecties zijn geen
bewijs van een eindtelling: ontbrekende aantallen blijven **Onbekend**.

De afdruk gebruikt uitsluitend productievelden. Financiële velden en financiële
zinnen in opmerkingen worden niet opgenomen. Er zijn geen databasewrites of
schemawijzigingen toegevoegd.

Verificatie: `node --test tests/order-print.test.cjs`. De optionele echte
Chromiumtest gebruikt `playwright` en `pdf-lib` uit de testomgeving:
`CHROMIUM_EXECUTABLE=/path/to/chromium node --test tests/order-print-browser.test.cjs`.
Tijdens implementatie zijn de 45 actuele lopende orders gerenderd naar 45 A4's;
alle 276 stappen en alle ordervoetteksten waren aanwezig. Ook losse afdrukken,
gecombineerde afdrukken, lange opmerkingen en onbekende aantallen zijn getest.
