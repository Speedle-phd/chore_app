import type { CatalogEntry } from './shopping'
import type { CategoryKey } from './shoppingCategories'
import type { UnitId } from './units'

/**
 * Common German groceries for suggestions before a household has its own history
 * (user decision 2026-11-15: German catalog). Each entry: name, default category,
 * usual unit. Typed items are learned per household and win over this list.
 */
const c = (category: CategoryKey, unit: UnitId | null, names: string) =>
   names.split(',').map((name): CatalogEntry => ({ name: name.trim(), category, unit }))

export const GROCERY_CATALOG_DE: readonly CatalogEntry[] = [
   // Obst & Gemüse
   ...c('produce', 'pcs', 'Äpfel, Bananen, Birnen, Orangen, Mandarinen, Zitronen, Limetten, Kiwis, Mangos, Avocados, Ananas, Melone, Wassermelone, Pfirsiche, Nektarinen, Pflaumen, Granatapfel'),
   ...c('produce', 'g', 'Erdbeeren, Himbeeren, Heidelbeeren, Weintrauben, Kirschen'),
   ...c('produce', 'pcs', 'Gurke, Paprika, Zucchini, Aubergine, Brokkoli, Blumenkohl, Kohlrabi, Eisbergsalat, Kopfsalat, Fenchel, Knoblauch, Ingwer, Chili, Rotkohl, Weißkohl, Spitzkohl, Lauch, Sellerie, Kürbis, Süßkartoffeln'),
   ...c('produce', 'kg', 'Kartoffeln, Zwiebeln, Rote Zwiebeln, Möhren, Tomaten, Rote Bete'),
   ...c('produce', 'g', 'Champignons, Cherrytomaten, Rucola, Feldsalat, Babyspinat, Spinat, Rosenkohl, Grüne Bohnen, Spargel, Radieschen, Pastinaken'),
   ...c('produce', 'bunch', 'Petersilie, Schnittlauch, Basilikum, Koriander, Dill, Minze, Frühlingszwiebeln, Rosmarin, Thymian'),
   // Backwaren
   ...c('bakery', 'pcs', 'Brot, Vollkornbrot, Toastbrot, Baguette, Brötchen, Croissants, Laugenbrezeln, Ciabatta, Wraps, Fladenbrot, Knäckebrot, Zwieback, Kuchen, Burgerbrötchen'),
   // Kühlregal
   ...c('fridge', 'l', 'Milch, Hafermilch, Buttermilch'),
   ...c('fridge', 'pcs', 'Butter, Margarine, Joghurt, Naturjoghurt, Griechischer Joghurt, Quark, Skyr, Schmand, Saure Sahne, Crème fraîche, Frischkäse, Mozzarella, Feta, Halloumi, Parmesan, Gouda, Emmentaler, Bergkäse, Camembert, Hüttenkäse, Mascarpone, Ricotta, Pudding, Eier, Hefe, Pizzateig, Blätterteig, Hummus, Tofu, Pesto'),
   ...c('fridge', 'ml', 'Sahne, Schlagsahne, Kochsahne'),
   ...c('fridge', 'g', 'Geriebener Käse, Aufschnitt, Salami, Kochschinken, Schinken, Speck, Lachs (geräuchert)'),
   // Fleisch & Fisch
   ...c('meat', 'g', 'Hackfleisch, Rinderhack, Hähnchenbrust, Hähnchenschenkel, Putenbrust, Schweinefilet, Schnitzel, Rindersteak, Gulasch, Lachs, Lachsfilet, Garnelen, Kabeljau, Thunfischsteak, Bratwurst, Würstchen, Wiener Würstchen, Leberkäse, Chorizo'),
   // Tiefkühl
   ...c('freezer', 'pack', 'Tiefkühlpizza, Pommes, Kroketten, Fischstäbchen, Erbsen (TK), Spinat (TK), Gemüsemischung (TK), Beeren (TK), Kräuter (TK), Eis, Eiswürfel, Blätterteig (TK), Rahmspinat, Maultaschen'),
   // Vorrat
   ...c('pantry', 'pack', 'Nudeln, Spaghetti, Penne, Fusilli, Lasagneplatten, Reis, Basmatireis, Risottoreis, Couscous, Bulgur, Quinoa, Linsen, Rote Linsen, Haferflocken, Müsli, Cornflakes, Mehl, Vollkornmehl, Speisestärke, Zucker, Puderzucker, Brauner Zucker, Vanillezucker, Backpulver, Natron, Trockenhefe, Paniermehl, Gemüsebrühe, Hühnerbrühe, Chips, Salzstangen, Nüsse, Mandeln, Walnüsse, Erdnüsse, Rosinen, Schokolade, Kekse, Gummibärchen, Kaffee, Kaffeebohnen, Tee, Kakao'),
   ...c('pantry', 'can', 'Passierte Tomaten, Gehackte Tomaten, Kokosmilch, Kichererbsen, Kidneybohnen, Weiße Bohnen, Mais, Thunfisch, Erbsen, Ananas (Dose)'),
   ...c('pantry', 'bottle', 'Olivenöl, Rapsöl, Sonnenblumenöl, Sesamöl, Essig, Balsamico, Sojasauce, Ketchup, Senf, Mayonnaise, Tomatenmark, Worcestersauce, Sriracha, Ahornsirup'),
   ...c('pantry', 'pcs', 'Honig, Marmelade, Nutella, Erdnussbutter, Salz, Pfeffer, Paprikapulver, Curry, Zimt, Oregano, Kreuzkümmel, Muskat, Chiliflocken, Lorbeerblätter, Brühwürfel, Oliven, Gewürzgurken, Kapern, Getrocknete Tomaten'),
   // Getränke
   ...c('drinks', 'bottle', 'Wasser, Mineralwasser, Stilles Wasser, Apfelsaft, Orangensaft, Multivitaminsaft, Apfelschorle, Cola, Limonade, Eistee, Bier, Alkoholfreies Bier, Rotwein, Weißwein, Sekt, Sirup'),
   // Haushalt
   ...c('household', 'pack', 'Toilettenpapier, Küchenrolle, Taschentücher, Spülmittel, Spülmaschinentabs, Waschmittel, Weichspüler, Allzweckreiniger, Badreiniger, WC-Reiniger, Glasreiniger, Entkalker, Müllbeutel, Gefrierbeutel, Frischhaltefolie, Alufolie, Backpapier, Schwämme, Spültücher, Batterien, Glühbirnen, Kerzen, Servietten, Streichhölzer'),
   // Drogerie
   ...c('drugstore', 'pcs', 'Zahnpasta, Zahnbürste, Zahnseide, Duschgel, Shampoo, Spülung, Seife, Flüssigseife, Deo, Rasierer, Rasierschaum, Bodylotion, Handcreme, Sonnencreme, Wattepads, Wattestäbchen, Pflaster, Tampons, Binden, Windeln, Feuchttücher, Kontaktlinsenflüssigkeit, Taschentücher (Box), Ibuprofen, Paracetamol, Vitamintabletten'),
   // Sonstiges
   ...c('other', 'pack', 'Hundefutter, Katzenfutter, Katzenstreu, Blumenerde, Geschenkpapier'),
]
