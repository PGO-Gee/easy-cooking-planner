-- Zentrale Gerichte für alle bereits angelegten Haushalte.
-- Einmalig im Supabase SQL Editor ausführen.
-- Bereits vorhandene Gerichte mit gleichem Namen werden nicht dupliziert.

insert into public.dishes
  (household_id, name, ingredient, cooking_time_minutes, emoji, ingredients, nutrition)
select h.id, seed.name, seed.ingredient, seed.cooking_time_minutes, seed.emoji,
       seed.ingredients::jsonb, seed.nutrition::jsonb
from public.households h
cross join (values
  ('Reis mit Hühnchen und Gemüse','Hühnchen',35,'🍚','["Reis","Hühnchen","Paprika","Brokkoli","Karotten"]','{"kcal":560,"protein":42,"fat":12,"carbs":68}'),
  ('Pizza Prosciutto e funghi','Wurst',30,'🍕','["Pizzateig","Tomatensoße","Mozzarella","Prosciutto","Champignons"]','{"kcal":780,"protein":38,"fat":31,"carbs":84}'),
  ('Spaghetti Bolognese','Rind',35,'🍝','["Spaghetti","Hackfleisch","Passierte Tomaten","Zwiebel","Karotten"]','{"kcal":650,"protein":34,"fat":22,"carbs":78}'),
  ('Nudeln mit Fleisch und Gemüse','Rind',30,'🍝','["Nudeln","Fleisch","Paprika","Zucchini","Karotten"]','{"kcal":640,"protein":35,"fat":20,"carbs":76}'),
  ('Nudelsuppe mit Würstchen','Schwein',30,'🍲','["Suppennudeln","Würstchen","Karotten","Sellerie","Lauch"]','{"kcal":430,"protein":18,"fat":19,"carbs":47}'),
  ('Fisch mit Kartoffeln','Fisch',40,'🐟','["Fischfilet","Kartoffeln","Zitrone"]','{"kcal":520,"protein":36,"fat":16,"carbs":56}'),
  ('Pommes und Chicken Nuggets','Hühnchen',25,'🍟','["Pommes","Chicken Nuggets"]','{"kcal":700,"protein":24,"fat":38,"carbs":62}'),
  ('Hühnchen-Wraps','Hühnchen',25,'🌯','["Wraps","Hühnchen","Salat","Tomaten","Gurke","Joghurtsoße"]','{"kcal":540,"protein":38,"fat":17,"carbs":57}'),
  ('Pelmeni (russische Teigtaschen)','Rind',45,'🥟','["Pelmeni","Schmand"]','{"kcal":620,"protein":27,"fat":25,"carbs":70}'),
  ('Burger und Kartoffel-Pommes','Rind',40,'🍔','["Burgerbrötchen","Rinderpatty","Käse","Salat","Tomaten","Kartoffeln"]','{"kcal":820,"protein":38,"fat":42,"carbs":72}'),
  ('Plov mit Hühnchen','Hühnchen',55,'🍛','["Reis","Hühnchen","Karotten","Zwiebel"]','{"kcal":610,"protein":36,"fat":18,"carbs":76}'),
  ('Hühnchen mit Kartoffeln','Hühnchen',50,'🍗','["Hühnchen","Kartoffeln","Zwiebel"]','{"kcal":590,"protein":42,"fat":18,"carbs":58}'),
  ('Reis-Bowl mit Salat','Vegetarisch',25,'🥗','["Reis","Salat","Gurke","Tomaten","Avocado"]','{"kcal":480,"protein":10,"fat":16,"carbs":72}'),
  ('Linsensuppe','Vegetarisch',40,'🍲','["Linsen","Karotten","Sellerie","Zwiebel"]','{"kcal":390,"protein":23,"fat":8,"carbs":55}'),
  ('Chili con Carne mit Reis','Rind',45,'🌶️','["Hackfleisch","Kidneybohnen","Passierte Tomaten","Reis","Zwiebel"]','{"kcal":670,"protein":38,"fat":21,"carbs":78}'),
  ('Buchweizen-Eintopf','Vegetarisch',45,'🍲','["Buchweizen","Kartoffeln","Karotten","Zwiebel"]','{"kcal":420,"protein":15,"fat":10,"carbs":70}'),
  ('Ofenkartoffel mit Quark','Vegetarisch',55,'🥔','["Kartoffeln","Quark","Schnittlauch"]','{"kcal":460,"protein":25,"fat":12,"carbs":65}'),
  ('Thunfisch-Nudeln','Fisch',25,'🍝','["Nudeln","Thunfisch","Sahne","Zwiebel"]','{"kcal":590,"protein":34,"fat":17,"carbs":75}')
) as seed(name, ingredient, cooking_time_minutes, emoji, ingredients, nutrition)
where not exists (
  select 1 from public.dishes existing
  where existing.household_id = h.id and lower(existing.name) = lower(seed.name)
);

