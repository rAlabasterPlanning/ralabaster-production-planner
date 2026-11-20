# CNC Reader: validatiematrix
Status: **ontwikkelversie / niet volledig gevalideerd**.

## Getest op 16 november 2026
- Browsercode van wizard, STEP-omhulling, STEP Part21-elementen en optionele B-Rep-reader gecontroleerd op syntaxis.
- Exacte B-Rep-uitleeslogica met gecontroleerde mock-resultaten getest: cilinderradius, cirkelradius, ondersteunt vlak-chamfer, faalt gesloten op ontbrekende geometrie. Dit test **niet** de echte Wasm-runtime of originele STEP.
- Vier reproduceerbare STEP-referentieonderdelen gemaakt met CadQuery en opnieuw ingelezen met een echte lokale OpenCascade-kernel (OCP):
  - cilinder Ø60 × 100 → cilindervlak R30;
  - schuin vlak 2 mm / 45° → cone met halve hoek 0,7854 rad;
  - bovenste afronding R3 → torusvormig oppervlak met kleine straal 3;
  - holle buis Ø60 / Ø50 → cilindervlakken R30 en R25.
- Generator van deze STEP-testmodellen staat in `tests/generate-cnc-step-fixtures.py`.
- Geen automatische machinebesturing, live-database-mutaties of NC-export.

## Nog uit te voeren (blokkeert 'klaar' / productiegebruik)
1. Werkelijke browserlaadtest van beide WebAssembly-kernels en CDN-artefacten op het Vercel-previewdomein, inclusief netwerkfalen, bestandlimieten en langzame apparaten.
2. Volledige B-Rep-identificatie van conische chamfers, niet alleen planar chamfers, en fillets voor lineaire/complexe randen; harde tests op asymmetrische onderdelen, assemblages en shells.
3. Referentie-assortiment met minimaal 20 echte rAlabaster-tekeningen + corresponderende STEP/STP-modellen met alle afmetingen handmatig als ground truth gemeten.
4. Verificatie van de positionering van radius, chamfer, groove, interne kamer, toleranties en opgegeven maatvoering; mogelijke STEP/PDF-tegenstrijdigheid moet worden opgelost voordat de programmering start.
5. Meerdere STEP eenheden (mm, inch), verschillende CAD-exporters, samengestelde modellen, gedraaide assen, beschadigde bestanden en optioneel meerdere solids.
6. Echte PDF-tekeningen: vector-PDF, multipage, annotaties, doorsnede, scans met slechte kwaliteit en onduidelijke of ontbrekende maatvoering.
7. Eindgebruikerscontrole via 3D-voorbeeld en duidelijk aangewezen nulpunt/opspanning.
8. G-codegenerator apart machinevalideren met echte Fanuc 11TT-programma's en gecontroleerde dry-run.

## Productregel
**Nooit 100% herkenning claimen.** Alleen expliciet gevalideerde features worden als bevestigd behandeld. Elke afwijking/onbekende maat moet terug naar review. Afgekeurde/niet-gevalideerde modellen mogen geen NC-export opleveren.

## Architectuur
- PDF / beelden: multimodale AI met gestructureerde evidence, gevolgd door menselijke validatie.
- STEP: triangulatie voor globale omhulling en assen; optionele exacte B-Rep-kernel voor primaire oppervlakken, radii, planar chamfers en boringkandidaten.
- Vergelijking van STEP- en PDF-hoofdmaten signaleert verschillen boven 0,1 mm of 0,1% (hoogste geldt); niet automatisch corrigeren.
- Fanuc-generator blijft gescheiden van herkenning en vereist eigen machinevalidatie.

