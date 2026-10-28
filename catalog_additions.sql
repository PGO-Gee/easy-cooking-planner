-- Ergänzungen für den Standardkatalog „Wochentisch“.
-- Vorhandene Gerichte werden anhand des normalisierten Namens übersprungen.
-- Ernährung und Nährwerte sind grobe Richtwerte pro Portion.
-- Bestehende Standardgerichte werden beim Ausführen ebenfalls auf kanonische Zutaten gebracht.
WITH ingredient_alias(alias, canonical) AS (
  VALUES
    ('apfel', 'Äpfel'), ('äpfel', 'Äpfel'), ('aprikose', 'Aprikosen'), ('aprikosen', 'Aprikosen'),
    ('avocado', 'Avocados'), ('avocados', 'Avocados'), ('banane', 'Bananen'), ('bananen', 'Bananen'),
    ('birne', 'Birnen'), ('birnen', 'Birnen'), ('dattel', 'Datteln'), ('datteln', 'Datteln'),
    ('blaubeere', 'Blaubeeren'), ('blaubeeren', 'Blaubeeren'), ('brombeere', 'Brombeeren'), ('brombeeren', 'Brombeeren'),
    ('erdbeere', 'Erdbeeren'), ('erdbeeren', 'Erdbeeren'), ('feige', 'Feigen'), ('feigen', 'Feigen'),
    ('granatapfel', 'Granatäpfel'), ('granatäpfel', 'Granatäpfel'), ('himbeere', 'Himbeeren'), ('himbeeren', 'Himbeeren'),
    ('johannisbeere', 'Johannisbeeren'), ('johannisbeeren', 'Johannisbeeren'), ('kirsche', 'Kirschen'), ('kirschen', 'Kirschen'),
    ('kiwi', 'Kiwis'), ('kiwis', 'Kiwis'), ('mandarine', 'Mandarinen'), ('mandarinen', 'Mandarinen'),
    ('mango', 'Mangos'), ('mangos', 'Mangos'), ('melone', 'Melonen'), ('melonen', 'Melonen'),
    ('orange', 'Orangen'), ('orangen', 'Orangen'), ('pfirsich', 'Pfirsiche'), ('pfirsiche', 'Pfirsiche'),
    ('pflaume', 'Pflaumen'), ('pflaumen', 'Pflaumen'), ('weintraube', 'Weintrauben'), ('weintrauben', 'Weintrauben'),
    ('zitrone', 'Zitronen'), ('zitronen', 'Zitronen'), ('limette', 'Limetten'), ('limetten', 'Limetten'),
    ('aubergine', 'Auberginen'), ('auberginen', 'Auberginen'), ('gurke', 'Gurken'), ('gurken', 'Gurken'),
    ('kürbis', 'Kürbisse'), ('kürbisse', 'Kürbisse'),
    ('erbsen', 'Erbsen'), ('erbse', 'Erbsen'), ('frühlingszwiebel', 'Frühlingszwiebeln'), ('frühlingszwiebeln', 'Frühlingszwiebeln'),
    ('grüne bohne', 'Grüne Bohnen'), ('grüne bohnen', 'Grüne Bohnen'), ('mungobohnensprosse', 'Mungobohnensprossen'),
    ('mungobohnensprossen', 'Mungobohnensprossen'), ('pastinake', 'Pastinaken'), ('pastinaken', 'Pastinaken'),
    ('rettich', 'Rettiche'), ('rettiche', 'Rettiche'), ('rote bete', 'Rote Bete'), ('rote beten', 'Rote Bete'),
    ('schalotte', 'Schalotten'), ('schalotten', 'Schalotten'), ('süßkartoffel', 'Süßkartoffeln'), ('süßkartoffeln', 'Süßkartoffeln'),
    ('zucchino', 'Zucchini'), ('zucchini', 'Zucchini'), ('chilischote', 'Chilischoten'), ('chilischoten', 'Chilischoten'),
    ('kichererbse', 'Kichererbsen'), ('kichererbsen', 'Kichererbsen'), ('linse', 'Linsen'), ('linsen', 'Linsen'),
    ('rote linse', 'Rote Linsen'), ('rote linsen', 'Rote Linsen'), ('berglinse', 'Berglinsen'), ('berglinsen', 'Berglinsen'),
    ('kidneybohne', 'Kidneybohnen'), ('kidneybohnen', 'Kidneybohnen'), ('weiße bohne', 'Weiße Bohnen'), ('weiße bohnen', 'Weiße Bohnen'),
    ('schwarze bohne', 'Schwarze Bohnen'), ('schwarze bohnen', 'Schwarze Bohnen'), ('champignon', 'Champignons'), ('champignons', 'Champignons'),
    ('austernpilz', 'Austernpilze'), ('austernpilze', 'Austernpilze'), ('ei', 'Eier'), ('eier', 'Eier'),
    ('baguette', 'Baguettes'), ('baguettes', 'Baguettes'), ('tortilla-wrap', 'Tortilla-Wraps'), ('tortilla-wraps', 'Tortilla-Wraps'),
    ('forelle', 'Forellen'), ('forellen', 'Forellen'), ('garnele', 'Garnelen'), ('garnelen', 'Garnelen'),
    ('sardelle', 'Sardellen'), ('sardellen', 'Sardellen'), ('mandel', 'Mandeln'), ('mandeln', 'Mandeln'),
    ('walnuss', 'Walnüsse'), ('walnüsse', 'Walnüsse'), ('cashewkern', 'Cashewkerne'), ('cashewkerne', 'Cashewkerne'),
    ('erdnuss', 'Erdnüsse'), ('erdnüsse', 'Erdnüsse'), ('pinienkern', 'Pinienkerne'), ('pinienkerne', 'Pinienkerne'),
    ('sonnenblumenkern', 'Sonnenblumenkerne'), ('sonnenblumenkerne', 'Sonnenblumenkerne'),
    ('kürbiskern', 'Kürbiskerne'), ('kürbiskerne', 'Kürbiskerne'), ('rosine', 'Rosinen'), ('rosinen', 'Rosinen'),
    ('borlotti-bohnen', 'Borlotti-Bohnen'), ('borlotti bohnen', 'Borlotti-Bohnen'),
    ('zwiebel', 'Zwiebeln'), ('zwiebeln', 'Zwiebeln'),
    ('rind', 'Rindfleisch'), ('rindfleisch', 'Rindfleisch'), ('rinderfilet', 'Rindfleisch'), ('rinder-patty', 'Rindfleisch'),
    ('rinderpatty', 'Rindfleisch'), ('rinder patty', 'Rindfleisch'), ('rinderhackfleisch', 'Rindfleisch'), ('rinderhack', 'Rindfleisch'),
    ('rindergulasch', 'Rindfleisch'), ('rindersteak', 'Rindfleisch'), ('rinderbraten', 'Rindfleisch'), ('rinderrouladen', 'Rindfleisch'),
    ('rindergeschnetzeltes', 'Rindfleisch'), ('rinderschulter', 'Rindfleisch'), ('rinderhüfte', 'Rindfleisch'),
    ('schwein', 'Schweinefleisch'), ('schweinefleisch', 'Schweinefleisch'), ('schweinefilet', 'Schweinefleisch'), ('schweineschnitzel', 'Schweinefleisch'),
    ('schweinebraten', 'Schweinefleisch'), ('schweinehackfleisch', 'Schweinefleisch'), ('schweinehack', 'Schweinefleisch'),
    ('schweinesteak', 'Schweinefleisch'), ('schweinenacken', 'Schweinefleisch'), ('schweinenackensteak', 'Schweinefleisch'), ('schweinebauch', 'Schweinefleisch'),
    ('bacon', 'Schweinefleisch'), ('speck', 'Schweinefleisch'), ('kasseler', 'Schweinefleisch'), ('prosciutto', 'Schweinefleisch'),
    ('huhn', 'Hähnchen'), ('hühnchen', 'Hähnchen'), ('hähnchen', 'Hähnchen'), ('hähnchenbrust', 'Hähnchen'),
    ('hähnchenbrustfilet', 'Hähnchen'), ('hähnchenfilet', 'Hähnchen'), ('hühnchenfilet', 'Hähnchen'),
    ('hähnchenschenkel', 'Hähnchen'), ('hähnchenkeule', 'Hähnchen'), ('hähnchenflügel', 'Hähnchen'), ('hähnchenstreifen', 'Hähnchen'),
    ('chicken', 'Hähnchen'), ('chicken nuggets', 'Hähnchen'),
    ('pute', 'Pute'), ('putenbrust', 'Pute'), ('putenfilet', 'Pute'), ('putenschnitzel', 'Pute'), ('putenkeule', 'Pute'), ('putenhack', 'Pute'),
    ('ente', 'Ente'), ('entenbrust', 'Ente'), ('entenfilet', 'Ente'), ('entenschenkel', 'Ente'),
    ('reis', 'Reis'), ('basmatireis', 'Reis'), ('jasminreis', 'Reis'), ('risottoreis', 'Reis'), ('vollkornreis', 'Reis'),
    ('käse', 'Käse'), ('feta', 'Käse'), ('mozzarella', 'Käse'), ('parmesan', 'Käse'), ('gouda', 'Käse'),
    ('emmentaler', 'Käse'), ('cheddar', 'Käse'), ('hirtenkäse', 'Käse'), ('halloumi', 'Käse'),
    ('ziegenkäse', 'Käse'), ('frischkäse', 'Käse'), ('doppelrahmfrischkäse', 'Käse'),
    ('hüttenkäse', 'Käse'), ('mascarpone', 'Käse'), ('ricotta', 'Käse'), ('bergkäse', 'Käse'),
    ('edamer', 'Käse'), ('butterkäse', 'Käse'), ('gorgonzola', 'Käse'), ('blauschimmelkäse', 'Käse'),
    ('burrata', 'Käse'), ('pecorino', 'Käse'), ('grana padano', 'Käse'), ('provolone', 'Käse'), ('ziegenfrischkäse', 'Käse'),
    ('möhre', 'Karotten'), ('möhren', 'Karotten'), ('karotte', 'Karotten'), ('karotten', 'Karotten'),
    ('kartoffel', 'Kartoffeln'), ('kartoffeln', 'Kartoffeln'),
    ('tomate', 'Tomaten'), ('tomaten', 'Tomaten')
), rewritten AS (
  SELECT dish.id,
         COALESCE((
           SELECT jsonb_agg(to_jsonb(item.canonical_name) ORDER BY item.first_position)
           FROM (
             SELECT named.canonical_name, MIN(named.position) AS first_position
             FROM (
               SELECT element.ordinality AS position,
                      COALESCE(alias.canonical, element.value) AS canonical_name
               FROM jsonb_array_elements_text(COALESCE(dish.ingredients, '[]'::jsonb))
                 WITH ORDINALITY AS element(value, ordinality)
               LEFT JOIN ingredient_alias AS alias ON alias.alias = lower(btrim(element.value))
             ) AS named
             GROUP BY named.canonical_name
           ) AS item
         ), '[]'::jsonb) AS ingredients
  FROM public.catalog_dishes AS dish
)
UPDATE public.catalog_dishes AS dish
SET ingredients = rewritten.ingredients
FROM rewritten
WHERE dish.id = rewritten.id
  AND dish.ingredients IS DISTINCT FROM rewritten.ingredients;

WITH additions(name, normalized_name, ingredient, cooking_time_minutes, emoji, ingredients, nutrition) AS (
  VALUES
    ('Schnitzel mit Pommes', 'schnitzelmitpommes', 'Schwein', 40, '🍟', '["Schweinefleisch", "Pommes", "Eier", "Paniermehl", "Sonnenblumenöl"]'::jsonb, '{"fat": 34, "kcal": 760, "carbs": 68, "protein": 38}'::jsonb),
    ('Gulasch mit Reis', 'gulaschmitreis', 'Rind', 90, '🍲', '["Rindfleisch", "Reis", "Zwiebeln", "Paprika", "Rinderbrühe", "Tomatenmark"]'::jsonb, '{"fat": 21, "kcal": 650, "carbs": 72, "protein": 39}'::jsonb),
    ('Frikadellen mit Kartoffelpüree', 'frikadellenmitkartoffelpüree', 'Rind', 45, '🥔', '["Rindfleisch", "Kartoffeln", "Eier", "Paniermehl", "Zwiebeln", "Milch", "Butter"]'::jsonb, '{"fat": 28, "kcal": 680, "carbs": 62, "protein": 36}'::jsonb),
    ('Hühnerfrikassee mit Reis', 'hühnerfrikasseemitreis', 'Hühnchen', 45, '🍛', '["Hähnchen", "Reis", "Erbsen", "Karotten", "Champignons", "Hühnerbrühe", "Sahne"]'::jsonb, '{"fat": 19, "kcal": 590, "carbs": 68, "protein": 40}'::jsonb),
    ('Currywurst mit Pommes', 'currywurstmitpommes', 'Schwein', 25, '🌭', '["Bratwurst", "Pommes", "Ketchup", "Currypulver"]'::jsonb, '{"fat": 35, "kcal": 780, "carbs": 66, "protein": 24}'::jsonb),
    ('Kartoffelgratin', 'kartoffelgratin', 'Vegetarisch', 65, '🥔', '["Kartoffeln", "Sahne", "Käse", "Knoblauch", "Muskatnuss"]'::jsonb, '{"fat": 28, "kcal": 560, "carbs": 54, "protein": 20}'::jsonb),
    ('Schweinebraten mit Semmelknödeln', 'schweinebratenmitsemmelknödeln', 'Schwein', 120, '🍖', '["Schweinefleisch", "Semmelknödel", "Zwiebeln", "Karotten", "Gemüsebrühe"]'::jsonb, '{"fat": 27, "kcal": 720, "carbs": 62, "protein": 42}'::jsonb),
    ('Hähnchenschenkel mit Ofenkartoffeln', 'hähnchenschenkelmitofenkartoffeln', 'Hühnchen', 60, '🍗', '["Hähnchen", "Kartoffeln", "Zwiebeln", "Paprikapulver", "Rosmarin"]'::jsonb, '{"fat": 24, "kcal": 640, "carbs": 58, "protein": 39}'::jsonb),
    ('Bauernomelett mit Kartoffeln', 'bauernomelettmitkartoffeln', 'Vegetarisch', 30, '🍳', '["Eier", "Kartoffeln", "Zwiebeln", "Paprika", "Schnittlauch"]'::jsonb, '{"fat": 22, "kcal": 490, "carbs": 43, "protein": 25}'::jsonb),
    ('Fischstäbchen mit Kartoffelpüree', 'fischstäbchenmitkartoffelpüree', 'Fisch', 30, '🐟', '["Fischstäbchen", "Kartoffeln", "Milch", "Butter"]'::jsonb, '{"fat": 23, "kcal": 570, "carbs": 62, "protein": 24}'::jsonb),
    ('Kartoffelpuffer mit Apfelmus', 'kartoffelpuffermitapfelmus', 'Vegetarisch', 40, '🥔', '["Kartoffeln", "Eier", "Weizenmehl", "Apfelmus", "Sonnenblumenöl"]'::jsonb, '{"fat": 18, "kcal": 480, "carbs": 70, "protein": 12}'::jsonb),
    ('Rotes Thai-Curry mit Hähnchen und Reis', 'rotethaicurrymithähnchenundreis', 'Hühnchen', 35, '🍛', '["Hähnchen", "Reis", "Kokosmilch", "Currypaste", "Paprika", "Zucchini"]'::jsonb, '{"fat": 22, "kcal": 650, "carbs": 74, "protein": 38}'::jsonb),
    ('Butter Chicken mit Reis', 'butterchickenmitreis', 'Hühnchen', 45, '🍛', '["Hähnchen", "Reis", "Passierte Tomaten", "Sahne", "Butter", "Ingwer", "Knoblauch", "Currypulver"]'::jsonb, '{"fat": 25, "kcal": 680, "carbs": 72, "protein": 39}'::jsonb),
    ('Gebratener Reis mit Hähnchen und Ei', 'gebratenerreismithähnchenundei', 'Hühnchen', 25, '🍚', '["Reis", "Hähnchen", "Eier", "Erbsen", "Karotten", "Sojasauce", "Sesamöl"]'::jsonb, '{"fat": 17, "kcal": 590, "carbs": 68, "protein": 39}'::jsonb),
    ('Hähnchen-Woknudeln', 'hähnchenwoknudeln', 'Hühnchen', 25, '🍜', '["Mie-Nudeln", "Hähnchen", "Brokkoli", "Karotten", "Paprika", "Sojasauce", "Ingwer", "Sesamöl"]'::jsonb, '{"fat": 16, "kcal": 570, "carbs": 70, "protein": 37}'::jsonb),
    ('Miso-Ramen mit Hähnchen', 'misoramenmithähnchen', 'Hühnchen', 40, '🍜', '["Ramen-Nudeln", "Hähnchen", "Hühnerbrühe", "Miso", "Eier", "Shiitake", "Frühlingszwiebeln", "Sojasauce"]'::jsonb, '{"fat": 17, "kcal": 560, "carbs": 62, "protein": 39}'::jsonb),
    ('Tofu-Curry mit Reis', 'tofucurrymitreis', 'Vegetarisch', 35, '🍛', '["Tofu", "Reis", "Kokosmilch", "Currypaste", "Brokkoli", "Paprika"]'::jsonb, '{"fat": 21, "kcal": 590, "carbs": 68, "protein": 24}'::jsonb),
    ('Pad Thai mit Hähnchen', 'padthaimithähnchen', 'Hühnchen', 35, '🍜', '["Reisnudeln", "Hähnchen", "Eier", "Mungobohnensprossen", "Erdnüsse", "Limette", "Sojasauce"]'::jsonb, '{"fat": 19, "kcal": 620, "carbs": 76, "protein": 35}'::jsonb),
    ('Teriyaki-Lachs mit Reis', 'teriyakilachsmitreis', 'Fisch', 30, '🐟', '["Lachs", "Reis", "Sojasauce", "Honig", "Ingwer", "Sesam"]'::jsonb, '{"fat": 24, "kcal": 630, "carbs": 66, "protein": 34}'::jsonb)
)
INSERT INTO public.catalog_dishes
  (id, name, ingredient, cooking_time_minutes, emoji, ingredients, nutrition, created_at)
SELECT
  gen_random_uuid(), a.name, a.ingredient,
  a.cooking_time_minutes, a.emoji, a.ingredients, a.nutrition, now()
FROM additions a
WHERE NOT EXISTS (
  SELECT 1
  FROM public.catalog_dishes existing
  WHERE existing.normalized_name = a.normalized_name
);
