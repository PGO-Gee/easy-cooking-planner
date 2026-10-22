-- Ergänzungen für den Standardkatalog „Wochentisch“.
-- Vorhandene Gerichte werden anhand des normalisierten Namens übersprungen.
-- Ernährung und Nährwerte sind grobe Richtwerte pro Portion.
WITH additions(name, normalized_name, ingredient, cooking_time_minutes, emoji, ingredients, nutrition) AS (
  VALUES
    ('Schnitzel mit Pommes', 'schnitzelmitpommes', 'Schwein', 40, '🍟', '["Schweineschnitzel", "Pommes", "Eier", "Paniermehl", "Sonnenblumenöl"]'::jsonb, '{"fat": 34, "kcal": 760, "carbs": 68, "protein": 38}'::jsonb),
    ('Gulasch mit Reis', 'gulaschmitreis', 'Rind', 90, '🍲', '["Rindergulasch", "Reis", "Zwiebeln", "Paprika", "Rinderbrühe", "Tomatenmark"]'::jsonb, '{"fat": 21, "kcal": 650, "carbs": 72, "protein": 39}'::jsonb),
    ('Frikadellen mit Kartoffelpüree', 'frikadellenmitkartoffelpüree', 'Rind', 45, '🥔', '["Rinderhackfleisch", "Kartoffeln", "Eier", "Paniermehl", "Zwiebeln", "Milch", "Butter"]'::jsonb, '{"fat": 28, "kcal": 680, "carbs": 62, "protein": 36}'::jsonb),
    ('Hühnerfrikassee mit Reis', 'hühnerfrikasseemitreis', 'Hühnchen', 45, '🍛', '["Hähnchenbrust", "Reis", "Erbsen", "Karotten", "Champignons", "Hühnerbrühe", "Sahne"]'::jsonb, '{"fat": 19, "kcal": 590, "carbs": 68, "protein": 40}'::jsonb),
    ('Currywurst mit Pommes', 'currywurstmitpommes', 'Schwein', 25, '🌭', '["Bratwurst", "Pommes", "Ketchup", "Currypulver"]'::jsonb, '{"fat": 35, "kcal": 780, "carbs": 66, "protein": 24}'::jsonb),
    ('Kartoffelgratin', 'kartoffelgratin', 'Vegetarisch', 65, '🥔', '["Kartoffeln", "Sahne", "Emmentaler", "Knoblauch", "Muskatnuss"]'::jsonb, '{"fat": 28, "kcal": 560, "carbs": 54, "protein": 20}'::jsonb),
    ('Schweinebraten mit Semmelknödeln', 'schweinebratenmitsemmelknödeln', 'Schwein', 120, '🍖', '["Schweinebraten", "Semmelknödel", "Zwiebeln", "Karotten", "Gemüsebrühe"]'::jsonb, '{"fat": 27, "kcal": 720, "carbs": 62, "protein": 42}'::jsonb),
    ('Hähnchenschenkel mit Ofenkartoffeln', 'hähnchenschenkelmitofenkartoffeln', 'Hühnchen', 60, '🍗', '["Hähnchenschenkel", "Kartoffeln", "Zwiebeln", "Paprikapulver", "Rosmarin"]'::jsonb, '{"fat": 24, "kcal": 640, "carbs": 58, "protein": 39}'::jsonb),
    ('Bauernomelett mit Kartoffeln', 'bauernomelettmitkartoffeln', 'Vegetarisch', 30, '🍳', '["Eier", "Kartoffeln", "Zwiebeln", "Paprika", "Schnittlauch"]'::jsonb, '{"fat": 22, "kcal": 490, "carbs": 43, "protein": 25}'::jsonb),
    ('Fischstäbchen mit Kartoffelpüree', 'fischstäbchenmitkartoffelpüree', 'Fisch', 30, '🐟', '["Fischstäbchen", "Kartoffeln", "Milch", "Butter"]'::jsonb, '{"fat": 23, "kcal": 570, "carbs": 62, "protein": 24}'::jsonb),
    ('Kartoffelpuffer mit Apfelmus', 'kartoffelpuffermitapfelmus', 'Vegetarisch', 40, '🥔', '["Kartoffeln", "Eier", "Weizenmehl", "Apfelmus", "Sonnenblumenöl"]'::jsonb, '{"fat": 18, "kcal": 480, "carbs": 70, "protein": 12}'::jsonb),
    ('Rotes Thai-Curry mit Hähnchen und Reis', 'rotethaicurrymithähnchenundreis', 'Hühnchen', 35, '🍛', '["Hähnchenbrust", "Jasminreis", "Kokosmilch", "Currypaste", "Paprika", "Zucchini"]'::jsonb, '{"fat": 22, "kcal": 650, "carbs": 74, "protein": 38}'::jsonb),
    ('Butter Chicken mit Reis', 'butterchickenmitreis', 'Hühnchen', 45, '🍛', '["Hähnchenbrust", "Basmatireis", "Passierte Tomaten", "Sahne", "Butter", "Ingwer", "Knoblauch", "Currypulver"]'::jsonb, '{"fat": 25, "kcal": 680, "carbs": 72, "protein": 39}'::jsonb),
    ('Gebratener Reis mit Hähnchen und Ei', 'gebratenerreismithähnchenundei', 'Hühnchen', 25, '🍚', '["Reis", "Hähnchenbrust", "Eier", "Erbsen", "Karotten", "Sojasauce", "Sesamöl"]'::jsonb, '{"fat": 17, "kcal": 590, "carbs": 68, "protein": 39}'::jsonb),
    ('Hähnchen-Woknudeln', 'hähnchenwoknudeln', 'Hühnchen', 25, '🍜', '["Mie-Nudeln", "Hähnchenbrust", "Brokkoli", "Karotten", "Paprika", "Sojasauce", "Ingwer", "Sesamöl"]'::jsonb, '{"fat": 16, "kcal": 570, "carbs": 70, "protein": 37}'::jsonb),
    ('Miso-Ramen mit Hähnchen', 'misoramenmithähnchen', 'Hühnchen', 40, '🍜', '["Ramen-Nudeln", "Hähnchenbrust", "Hühnerbrühe", "Miso", "Eier", "Shiitake", "Frühlingszwiebeln", "Sojasauce"]'::jsonb, '{"fat": 17, "kcal": 560, "carbs": 62, "protein": 39}'::jsonb),
    ('Tofu-Curry mit Reis', 'tofucurrymitreis', 'Vegetarisch', 35, '🍛', '["Tofu", "Reis", "Kokosmilch", "Currypaste", "Brokkoli", "Paprika"]'::jsonb, '{"fat": 21, "kcal": 590, "carbs": 68, "protein": 24}'::jsonb),
    ('Pad Thai mit Hähnchen', 'padthaimithähnchen', 'Hühnchen', 35, '🍜', '["Reisnudeln", "Hähnchenbrust", "Eier", "Mungobohnensprossen", "Erdnüsse", "Limette", "Sojasauce"]'::jsonb, '{"fat": 19, "kcal": 620, "carbs": 76, "protein": 35}'::jsonb),
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
