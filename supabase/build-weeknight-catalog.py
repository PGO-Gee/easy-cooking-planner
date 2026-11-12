"""Regenerate the idempotent data seed: python3 supabase/build-weeknight-catalog.py."""
import json
from pathlib import Path

directory = Path(__file__).resolve().parent
rows = json.loads((directory / 'catalog-weeknight-recipes.json').read_text())
payload = json.dumps([{k: v for k, v in row.items() if k != 'photo'} for row in rows], ensure_ascii=False, indent=2)
assert '$catalog$' not in payload
sql = f"""-- Generated from catalog-weeknight-recipes.json by build-weeknight-catalog.py.
-- 13 new meals; Buchweizen-Eintopf already exists and is retained unchanged.
-- Recipe quantities serve two; nutrition is an estimate per portion.
-- Assumptions: Kathriki = Kritharaki; Schlemmer-Filet = Bordelaise (380 g / two).
-- Requires the existing recipe catalogue migrations, including recipe_type.
-- Repeated execution preserves existing catalogue entries and household copies.
insert into public.catalog_dishes
  (name, ingredient, cooking_time_minutes, emoji, ingredients, nutrition, recipe_type, recipe)
select name, ingredient, cooking_time_minutes, emoji, ingredients, nutrition, recipe_type, recipe
from jsonb_to_recordset($catalog$
{payload}
$catalog$::jsonb) as dish(
  name text, normalized_name text, ingredient text, cooking_time_minutes integer,
  emoji text, ingredients jsonb, nutrition jsonb, recipe_type text, recipe jsonb
)
on conflict (normalized_name) do nothing
returning name;
"""
(directory / 'catalog-weeknight-additions.sql').write_text(sql)
