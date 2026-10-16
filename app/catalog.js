// Startkatalog med vanliga livsmedel.
// Format per rad: namn | kategori | enhet | plats | hållbarhet i dagar (oöppnad) | hållbarhet i dagar efter öppning (valfri)
// Egna varor som läggs till i appen sparas i databasen och kompletterar listan.
const CATALOG_RAW = `
Torsk|Fisk & skaldjur|g|frys|180
Torskrygg|Fisk & skaldjur|g|frys|180
Lax|Fisk & skaldjur|g|kyl|3
Laxfilé fryst|Fisk & skaldjur|g|frys|180
Rökt lax|Fisk & skaldjur|g|kyl|14|3
Gravad lax|Fisk & skaldjur|g|kyl|14|3
Sej|Fisk & skaldjur|g|frys|180
Kolja|Fisk & skaldjur|g|frys|180
Sill|Fisk & skaldjur|förp|kyl|60|7
Inlagd sill|Fisk & skaldjur|förp|kyl|90|10
Tonfisk på burk|Fisk & skaldjur|st|skafferi|1095|2
Makrill i tomatsås|Fisk & skaldjur|st|skafferi|730|2
Räkor|Fisk & skaldjur|g|frys|180
Räkor i lake|Fisk & skaldjur|g|kyl|14|3
Skagenröra|Fisk & skaldjur|g|kyl|5
Kräftor|Fisk & skaldjur|g|frys|180
Musslor|Fisk & skaldjur|g|kyl|2
Fiskpinnar|Fisk & skaldjur|förp|frys|180
Kaviar|Fisk & skaldjur|st|kyl|180|21
Ansjovis|Fisk & skaldjur|st|kyl|365|7
Nötfärs|Kött|g|kyl|3
Blandfärs|Kött|g|kyl|3
Fläskfärs|Kött|g|kyl|3
Kycklingfärs|Kött|g|kyl|3
Kycklingfilé|Kött|g|kyl|4
Kycklingfilé fryst|Kött|g|frys|270
Kycklinglårfilé|Kött|g|kyl|4
Hel kyckling|Kött|st|kyl|4
Kycklingklubbor|Kött|g|kyl|4
Fläskfilé|Kött|g|kyl|5
Fläskkotlett|Kött|g|kyl|5
Karré|Kött|g|kyl|5
Sidfläsk|Kött|g|kyl|7
Bacon|Kött|förp|kyl|21|5
Skinka|Kött|förp|kyl|21|5
Rökt skinka|Kött|förp|kyl|21|5
Kokt skinka|Kött|förp|kyl|21|5
Salami|Kött|förp|kyl|60|10
Prosciutto|Kött|förp|kyl|60|5
Falukorv|Kött|st|kyl|21|5
Prinskorv|Kött|förp|kyl|21|5
Grillkorv|Kött|förp|kyl|21|5
Chorizo|Kött|st|kyl|45|10
Köttbullar|Kött|förp|kyl|14|3
Köttbullar frysta|Kött|förp|frys|270
Entrecôte|Kött|g|kyl|5
Ryggbiff|Kött|g|kyl|5
Oxfilé|Kött|g|kyl|5
Högrev|Kött|g|kyl|5
Grytbitar nöt|Kött|g|kyl|4
Lammfärs|Kött|g|kyl|3
Lammracks|Kött|g|kyl|5
Kalkonbröst|Kött|g|kyl|4
Pålägg kalkon|Kött|förp|kyl|21|5
Leverpastej|Kött|förp|kyl|21|5
Mjölk|Mejeri|l|kyl|10|4
Lättmjölk|Mejeri|l|kyl|10|4
Mellanmjölk|Mejeri|l|kyl|10|4
Havremjölk|Mejeri|l|skafferi|180|5
Filmjölk|Mejeri|l|kyl|14|5
Yoghurt|Mejeri|l|kyl|21|5
Grekisk yoghurt|Mejeri|g|kyl|21|5
Kvarg|Mejeri|g|kyl|21|5
Gräddfil|Mejeri|dl|kyl|21|5
Crème fraiche|Mejeri|dl|kyl|21|5
Matlagningsgrädde|Mejeri|dl|kyl|30|5
Vispgrädde|Mejeri|dl|kyl|21|4
Smör|Mejeri|g|kyl|90|30
Bregott|Mejeri|g|kyl|60|30
Margarin|Mejeri|g|kyl|60|30
Hushållsost|Mejeri|g|kyl|60|21
Präst|Mejeri|g|kyl|90|21
Herrgård|Mejeri|g|kyl|90|21
Västerbottensost|Mejeri|g|kyl|90|21
Cheddar|Mejeri|g|kyl|90|21
Parmesan|Mejeri|g|kyl|180|30
Mozzarella|Mejeri|g|kyl|21|3
Riven ost|Mejeri|g|kyl|30|7
Fetaost|Mejeri|g|kyl|60|7
Halloumi|Mejeri|g|kyl|90|5
Brie|Mejeri|g|kyl|30|7
Färskost|Mejeri|g|kyl|30|7
Keso|Mejeri|g|kyl|14|4
Ricotta|Mejeri|g|kyl|14|3
Mascarpone|Mejeri|g|kyl|21|4
Ägg|Ägg|st|kyl|28
Äpple|Frukt|st|skafferi|21
Banan|Frukt|st|skafferi|5
Päron|Frukt|st|skafferi|10
Apelsin|Frukt|st|skafferi|21
Clementin|Frukt|st|skafferi|14
Citron|Frukt|st|kyl|21
Lime|Frukt|st|kyl|21
Avokado|Frukt|st|skafferi|5
Kiwi|Frukt|st|kyl|21
Mango|Frukt|st|skafferi|7
Ananas|Frukt|st|skafferi|5
Vindruvor|Frukt|g|kyl|7
Jordgubbar|Frukt|g|kyl|3
Hallon|Frukt|g|kyl|3
Blåbär|Frukt|g|kyl|5
Blåbär frysta|Frukt|g|frys|365
Hallon frysta|Frukt|g|frys|365
Melon|Frukt|st|skafferi|7
Vattenmelon|Frukt|st|skafferi|10
Granatäpple|Frukt|st|kyl|30
Plommon|Frukt|st|skafferi|5
Persika|Frukt|st|skafferi|5
Russin|Frukt|g|skafferi|365
Dadlar|Frukt|g|skafferi|365
Potatis|Grönsaker|kg|skafferi|30
Färskpotatis|Grönsaker|kg|kyl|10
Sötpotatis|Grönsaker|st|skafferi|21
Gul lök|Grönsaker|st|skafferi|60
Rödlök|Grönsaker|st|skafferi|45
Vitlök|Grönsaker|st|skafferi|90
Purjolök|Grönsaker|st|kyl|14
Salladslök|Grönsaker|st|kyl|7
Schalottenlök|Grönsaker|st|skafferi|45
Morot|Grönsaker|st|kyl|28
Palsternacka|Grönsaker|st|kyl|21
Rödbetor|Grönsaker|st|kyl|28
Kålrot|Grönsaker|st|kyl|30
Selleri|Grönsaker|st|kyl|21
Rotselleri|Grönsaker|st|kyl|30
Tomat|Grönsaker|st|skafferi|7
Körsbärstomater|Grönsaker|g|skafferi|7
Gurka|Grönsaker|st|kyl|7
Paprika|Grönsaker|st|kyl|10
Chili|Grönsaker|st|kyl|14
Zucchini|Grönsaker|st|kyl|7
Aubergine|Grönsaker|st|kyl|7
Broccoli|Grönsaker|st|kyl|7
Blomkål|Grönsaker|st|kyl|10
Vitkål|Grönsaker|st|kyl|30
Rödkål|Grönsaker|st|kyl|30
Spetskål|Grönsaker|st|kyl|14
Grönkål|Grönsaker|g|kyl|5
Brysselkål|Grönsaker|g|kyl|7
Spenat|Grönsaker|g|kyl|4
Spenat fryst|Grönsaker|g|frys|365
Isbergssallad|Grönsaker|st|kyl|7
Romansallad|Grönsaker|st|kyl|7
Rucola|Grönsaker|g|kyl|4
Sallad blandad|Grönsaker|g|kyl|4
Champinjoner|Grönsaker|g|kyl|5
Svamp|Grönsaker|g|kyl|4
Majs|Grönsaker|st|skafferi|730|3
Majs fryst|Grönsaker|g|frys|365
Ärtor frysta|Grönsaker|g|frys|365
Haricots verts|Grönsaker|g|kyl|5
Wokgrönsaker frysta|Grönsaker|g|frys|365
Sparris|Grönsaker|g|kyl|4
Fänkål|Grönsaker|st|kyl|10
Syltlök|Skafferi|st|skafferi|730|30
Ingefära|Grönsaker|g|kyl|21
Färsk basilika|Grönsaker|st|kyl|7
Färsk persilja|Grönsaker|st|kyl|7
Färsk dill|Grönsaker|st|kyl|7
Färsk koriander|Grönsaker|st|kyl|5
Gräslök|Grönsaker|st|kyl|7
Bröd|Bröd|st|skafferi|5
Formbröd|Bröd|st|skafferi|7
Rågbröd|Bröd|st|skafferi|7
Surdegsbröd|Bröd|st|skafferi|4
Baguette|Bröd|st|skafferi|2
Bröd fryst|Bröd|st|frys|90
Knäckebröd|Bröd|förp|skafferi|180
Ströbröd|Bröd|g|skafferi|365
Tortillabröd|Bröd|förp|skafferi|30|7
Hamburgerbröd|Bröd|förp|skafferi|7
Korvbröd|Bröd|förp|skafferi|7
Pitabröd|Bröd|förp|skafferi|10
Kanelbullar|Bröd|förp|frys|90
Pasta|Skafferi|g|skafferi|730
Spaghetti|Skafferi|g|skafferi|730
Makaroner|Skafferi|g|skafferi|730
Penne|Skafferi|g|skafferi|730
Färsk pasta|Skafferi|g|kyl|21|3
Lasagneplattor|Skafferi|g|skafferi|730
Nudlar|Skafferi|g|skafferi|365
Ris|Skafferi|g|skafferi|730
Jasminris|Skafferi|g|skafferi|730
Basmatiris|Skafferi|g|skafferi|730
Risottoris|Skafferi|g|skafferi|730
Bulgur|Skafferi|g|skafferi|365
Couscous|Skafferi|g|skafferi|365
Quinoa|Skafferi|g|skafferi|365
Havregryn|Skafferi|g|skafferi|365
Müsli|Skafferi|g|skafferi|180
Flingor|Skafferi|g|skafferi|180
Vetemjöl|Skafferi|g|skafferi|365
Grahamsmjöl|Skafferi|g|skafferi|180
Majsstärkelse|Skafferi|g|skafferi|730
Strösocker|Skafferi|g|skafferi|1095
Florsocker|Skafferi|g|skafferi|1095
Farinsocker|Skafferi|g|skafferi|730
Bakpulver|Skafferi|g|skafferi|365
Jäst|Skafferi|st|kyl|21
Torrjäst|Skafferi|st|skafferi|365
Kakao|Skafferi|g|skafferi|730
Choklad|Skafferi|g|skafferi|180
Honung|Skafferi|g|skafferi|730
Sirap|Skafferi|g|skafferi|730
Krossade tomater|Skafferi|st|skafferi|730|4
Passerade tomater|Skafferi|st|skafferi|730|4
Tomatpuré|Skafferi|st|skafferi|730|14
Kokosmjölk|Skafferi|st|skafferi|730|3
Kikärtor|Skafferi|st|skafferi|1095|3
Vita bönor|Skafferi|st|skafferi|1095|3
Kidneybönor|Skafferi|st|skafferi|1095|3
Svarta bönor|Skafferi|st|skafferi|1095|3
Linser röda|Skafferi|g|skafferi|730
Buljong|Skafferi|st|skafferi|730
Fond|Skafferi|st|skafferi|365|30
Olja|Skafferi|l|skafferi|365|180
Olivolja|Skafferi|l|skafferi|540|180
Rapsolja|Skafferi|l|skafferi|365|180
Sesamolja|Skafferi|dl|skafferi|365|180
Vinäger|Skafferi|dl|skafferi|1095
Balsamvinäger|Skafferi|dl|skafferi|1095
Soja|Skafferi|dl|skafferi|730|180
Sweet chili|Skafferi|st|skafferi|365|90
Ketchup|Skafferi|st|skafferi|365|60
Senap|Skafferi|st|skafferi|365|90
Majonnäs|Skafferi|st|skafferi|180|30
Pesto|Skafferi|st|skafferi|365|7
Sriracha|Skafferi|st|skafferi|365|180
Tacosås|Skafferi|st|skafferi|365|14
Tacokrydda|Kryddor|st|skafferi|365
Sylt|Skafferi|st|skafferi|365|30
Lingonsylt|Skafferi|st|skafferi|365|30
Jordnötssmör|Skafferi|st|skafferi|365|90
Nutella|Skafferi|st|skafferi|365|90
Nötter|Skafferi|g|skafferi|180
Mandlar|Skafferi|g|skafferi|365
Cashewnötter|Skafferi|g|skafferi|180
Solrosfrön|Skafferi|g|skafferi|180
Chips|Skafferi|förp|skafferi|120
Popcorn|Skafferi|förp|skafferi|365
Kex|Skafferi|förp|skafferi|180
Kaffe|Skafferi|g|skafferi|365|30
Te|Skafferi|förp|skafferi|730
Salt|Kryddor|g|skafferi|3650
Svartpeppar|Kryddor|g|skafferi|730
Paprikapulver|Kryddor|g|skafferi|730
Spiskummin|Kryddor|g|skafferi|730
Kanel|Kryddor|g|skafferi|730
Kardemumma|Kryddor|g|skafferi|730
Oregano|Kryddor|g|skafferi|730
Timjan|Kryddor|g|skafferi|730
Basilika torkad|Kryddor|g|skafferi|730
Curry|Kryddor|g|skafferi|730
Gurkmeja|Kryddor|g|skafferi|730
Chiliflakes|Kryddor|g|skafferi|730
Vitlökspulver|Kryddor|g|skafferi|730
Lagerblad|Kryddor|g|skafferi|730
Vaniljsocker|Kryddor|g|skafferi|730
Glass|Fryst|l|frys|365
Pommes frites|Fryst|g|frys|365
Färdigrätt fryst|Fryst|st|frys|180
Pizza fryst|Fryst|st|frys|270
Pannkakor frysta|Fryst|förp|frys|180
Hummus|Färdigmat|g|kyl|14|5
Tzatziki|Färdigmat|g|kyl|10|4
Färdig sallad|Färdigmat|st|kyl|3
Läsk|Dryck|l|skafferi|180|5
Juice|Dryck|l|kyl|21|5
Apelsinjuice|Dryck|l|kyl|21|5
Mineralvatten|Dryck|l|skafferi|365|3
Öl|Dryck|st|skafferi|365
Vitt vin|Dryck|st|skafferi|730|4
Rött vin|Dryck|st|skafferi|730|4
Tofu|Vegetariskt|g|kyl|30|4
Quornfärs|Vegetariskt|g|frys|365
Sojafärs|Vegetariskt|g|frys|365
Vegobullar|Vegetariskt|förp|frys|365
Falafel|Vegetariskt|förp|frys|365
`;

const CATALOG = CATALOG_RAW.trim().split('\n').map(line => {
  const [name, category, unit, place, days, openDays] = line.split('|');
  return {
    name, category, unit, place,
    shelfDays: Number(days) || null,
    openDays: openDays ? Number(openDays) : null,
  };
});
