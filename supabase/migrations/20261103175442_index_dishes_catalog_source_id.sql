-- Supports catalog-origin lookups and keeps the catalog source foreign key indexed.
create index if not exists dishes_catalog_source_id_idx
  on public.dishes (catalog_source_id);
