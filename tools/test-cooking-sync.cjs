/* Local PostgreSQL integration test. Set WOCHENTISCH_PGLITE_MODULE to an installed
   @electric-sql/pglite module. No connection to the hosted household is used. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.WOCHENTISCH_PGLITE_MODULE||'@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
function fn(file,name){const source=read(file),start=source.indexOf('create or replace function '+name+'(');assert(start>=0,name);const delimiter=source.slice(start).match(/as (\$\w*\$)/i)[1],body=source.indexOf(delimiter,start);return source.slice(start,source.indexOf(delimiter+';',body+delimiter.length)+delimiter.length+1)}
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema wochentisch_private;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create table public.households(id uuid primary key default gen_random_uuid(),name text,created_by uuid,updated_at timestamptz default now());
 create table public.household_members(household_id uuid references households,user_id uuid,primary key(household_id,user_id));
 create function public.is_household_member(uuid) returns boolean language sql stable as $$ select exists(select 1 from public.household_members where household_id=$1 and user_id=auth.uid()) $$;
 create table public.dishes(id uuid primary key,household_id uuid references households,name text,ingredient text,cooking_time_minutes smallint,emoji text,ingredients jsonb,nutrition jsonb,created_at timestamptz default now(),recipe jsonb,catalog_source_id uuid,catalog_source_version integer,recipe_type text default 'meal');
 create table public.weekly_plans(id uuid primary key default gen_random_uuid(),household_id uuid references households,week_start date,pantry_ingredients jsonb default '[]',rest_days smallint[] default '{}',shopping_quantities jsonb default '{}',shopping_hidden_items jsonb default '[]',unique(household_id,week_start));
 create table public.planned_meals(id uuid primary key default gen_random_uuid(),weekly_plan_id uuid references weekly_plans,dish_id uuid references dishes,day_of_week smallint,position smallint,is_pinned boolean default false,unique(weekly_plan_id,day_of_week,position));
 create table public.shopping_items(id uuid primary key default gen_random_uuid(),weekly_plan_id uuid references weekly_plans,name text,normalized_name text,unique(weekly_plan_id,normalized_name));
 create table public.shopping_item_checks(id uuid primary key default gen_random_uuid(),weekly_plan_id uuid references weekly_plans,item_key text,unique(weekly_plan_id,item_key));
 create publication supabase_realtime;
 `);
 await db.exec(read('supabase/sync-helpers.sql'));await db.exec(read('supabase/sync-request-journal.sql'));
 await db.exec(read('supabase/sync-guard-dangling.sql'));
 const recipeMigration='supabase/migrations/20261103175353_recipe_cooking_catalog.sql',baking='supabase/migrations/20261107203423_baking_recipe_type.sql';
 await db.exec(fn(recipeMigration,'wochentisch_private.valid_recipe'));
 for(const name of ['cloud_state_v2','validate_household_recipes','write_state_v2'])await db.exec(fn(baking,'wochentisch_private.'+name));
 await db.exec(read('supabase/migrations/20261115095535_household_cooking_portions.sql'));
 await db.exec(read('supabase/migrations/20261118120000_trial_dishes.sql'));
 console.log('Migration installed in isolated PostgreSQL.');
 await db.exec(read('tests/sync-cooking-v3.sql'));
 console.log('v3 SQL transactions, trial dishes, retry, conflicts, legacy protection, validation and access checks passed.');
 for(const migration of ['20261110201227_shopping_history.sql','20261110203532_shopping_history_display_name.sql','20261125204127_shopping_clear_history.sql']){
   await db.exec(read('supabase/migrations/'+migration));
 }
 await db.exec(read('tests/shopping-clear-history.sql'));
 console.log('Shopping history attribution, week filtering, request retries and household access passed.');
 }finally{await db.close()}})().catch(error=>{console.error(error);process.exitCode=1});
