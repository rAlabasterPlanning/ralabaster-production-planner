# rAlabaster AI CNC Programmer — implementatieplan en acceptatiecriteria

Status: **in ontwikkeling**, niet machinegevalideerd. Deze module staat eerst los van de live productieplanner. Geen writes naar orders, calculaties, machines of productie zonder expliciete vrijgave.

## Einddoel
Van technische tekening (PDF, DXF, STEP) → herkende geometrie met bronverwijzing → machineprofiel → volledig voorgesteld Fanuc-programma → gehele code in één doorlopend scherm, blok-voor-blok AI-review → geometrie-, syntax- en veiligheidscontroles → gecontroleerde NC-export → voorspelde cyclustijd/ruw gewicht/kostprijs → product, calculatie, offerte en order in de bestaande Planner → werkelijke uren/materialen terugkoppelen.

## Ontwerpprincipes
- **AI leest en stelt voor; deterministische geometrie- en NC-generator schrijft de instructies.** Geen vrije LLM-uitvoer rechtstreeks als uitvoerbaar CNC-bestand.
- Alle maten krijgen: eenheid, waarde, *bronpagina + maatlijn of CAD-element*, type (direct / afgeleid / aanname), confidence, reviewer en versie.
- Onduidelijke, conflicterende of ontbrekende maten blokkeren NC-export; gebruiker corrigeert ze op een overlay op de oorspronkelijke tekening.
- STEP uitlezen via CAD-kernel (Open CASCADE), DXF via vectorparser (ezdxf), PDF via tekstlagen + multimodale herkenning. De PDF-maatvoering gaat voor schematisch pixelschalen; scale-from-image nooit stilzwijgend gebruiken.
- Vorminterpretatie moet Z0, opspanning, nulpunt, X diameter versus radius, front/back en binnen/buiten expliciet vastleggen.
- Machineregelsets per **machine + besturing + software/parameterconfiguratie**. Begin ZL-15 / Fanuc 11TT, daarna SL-25 / Fanuc 15T. ZL-15 dubbelrevolver/synchronisatie is een aparte fase.
- Het aangeleverde Fanuc 11TT-document is een **onbewezen specificatie**, niet een gevalideerd programma. G71-variant, G70, F-interpretatie, Tnn00/Tnnnn, G96/G97, G50, M8/M9, G2/G3, turretbewegingen, M1, terugtrekveiligheid en puntkomma's moeten met echte machineprogramma's gecontroleerd worden.
- Bij interne kamer: terugtrekroute *eerst veilige Z, dan X*, **buiten de P/Q-finishingcontour**.
- Blokreviews blijven zichtbaar in dezelfde complete code-editor; wijziging van afhankelijke blokken maakt alle betreffende beoordelingen ongeldig.
- Bewaar programmasjabloon, materiaal, gereedschap, stock, setup, simulatieversie, postprocessorversie, code-hash, reviewer, statussen en revisiehistorie.
- Pas na 1) volledige tekeningreview, 2) postprocessor-validatie, 3) deterministische checks, 4) onafhankelijke simulatie, 5) expliciete menselijk vrijgave mag NC-export.
- Na export: machinevalidatie vereist (o.a. dry-run, single-block, feed override, relevante veiligheidsprocedures). De software mag geen directe machinebewegingen sturen.

## Tijden & kostprijzen
- Cyclustijd = gedetailleerde bewegingstijd + G71-specifieke passes + acceleration/deceleration & machine-overhead (gekalibreerd) + toolwissels + eventuele M-codes.
- G96 S constante snijsnelheid verandert rpm met diameter; begrens met G50 en daadwerkelijke configuratie. Maak onderscheid tussen feed per rev / feed per minute volgens daadwerkelijke machineparameters.
- Separaat rekenen: machinetijd, arbeidstijd (automatisch draaien vs bij machine aanwezig), setup per batch, externe bewerking, droogtijd (wel doorlooptijd, geen machinekosten), zagen, schuren/polijsten, verpakken.
- Materiaal: bruto volume/gewicht (albastdichtheid als instelbare materiaalwaarde), snijverlies, ruwe blokindeling, werkelijke start-/eindgewichten en uitvalpercentage.
- Kostprijs = materiaal + bewerkingen + insteltijd/batch + overhead/afschrijving volgens tariefconfiguratie + uitval + verpakking; verkoopprijs met **brutomarge** of apart een **opslagfactor**, nooit door elkaar.
- Alle aannames en vertrouwen zichtbaar. Sla voorspelling én werkelijk resultaat apart op. Per machine, gereedschap, productfamilie en operator calibreren via historisch geregistreerde tijden.
- Bestaande Planner heeft producttemplates, calculaties, werkplekken en tarieven. Die blijven de enige bron voor goedgekeurde masterdata. Gebruik concept/kopie totdat expliciet bevestigd.

## Bouwfasen
1. **Afzonderlijk prototype (huidige branch):** handmatige inputs, één doorlopende programmaraamwerkweergave, blokreviews, invoer voor kosten, concept-JSON, NC-export uit.
2. **Tekeninglezer:** upload + veilig bestandbeheer, PDF-visie + CAD-kernel, geometrieprofiel, overlay en maatcontrole. Benchmark 20 voorbeelden en 5 niet-gezien testtekeningen.
3. **Fanuc-generator:** bewezen NC-blokken van 20 productieprogramma's structureren, machineprofielen, vaste templates, P/Q-allocatie, modal state engine, veilige bewegingen, linting. Test tegen echte Fanuc-programma's; geen export voordat bewezen.
4. **Tijdcalculator:** gereedschaps- en bewegingenmodel, machine-overhead en gevalideerde vergelijking met praktijkcycli.
5. **Plannerintegratie:** conceptcalculatie → producttemplate en route; pas bij aparte goedkeuring schrijven naar echte orders, offertes of planning. Supabase tabellen, RLS, audits en api-permissies.
6. **AI-assistent:** interactieve chat naast *de volledige code*, blokgewijze uitleg, veilige wijzigingsvoorstellen in gestructureerde bewerkingsparameters (niet losse code).
7. **Uitbreiding:** Fanuc 15T, meer revolvers, overige machines.

## Acceptance tests
- PDF met twee aanzichten: alle directe maten terug te leiden naar exact aangewezen bron.
- STEP-profiel: consistente mm, X-diameter en Z0; geen onzichtbare automatische gok over de opspanning.
- Ontbrekende wanddikte/ondermaat: waarschuwing en NC-export geblokkeerd.
- G71 P/Q uniek en profiel niet vervuild door terugtrekbeweging.
- Binnencontour: veilig eerst Z dan X op de juiste machine- en werkstukconfiguratie.
- Bediening: complete code blijft zichtbaar; blokselectie, review, wijziging en hervalidatie.
- Schatting versus realisatie per bewerking en machine terug te vinden.
- Geen live wijzigingen door conceptberekeningen; expliciete approval voor koppeling naar order/voorraad.
- Testen met werkelijk door rAlabaster bewezen NC-programma's voordat NC-export vrijgegeven wordt.
