-- Entire fixture and all writes are rolled back. No real accounts are needed.
begin;
do $test$
declare
 household uuid:=gen_random_uuid(); member uuid:=gen_random_uuid(); recipe uuid:=gen_random_uuid(); request uuid:=gen_random_uuid();
 base jsonb; local_state jsonb; response jsonb; replay jsonb; cloud jsonb; other jsonb; conflict jsonb; bad jsonb;
begin
 insert into public.households(id,name,created_by) values(household,'Synthetic cooking test',member);
 insert into public.household_members(household_id,user_id) values(household,member);
 perform set_config('request.jwt.claim.sub',member::text,true);
 base:=public.read_household_v3(household)->'state';
 local_state:=base||jsonb_build_object('dishes',jsonb_build_array(jsonb_build_object('id',recipe,'name','Curry','ingredients',jsonb_build_array('Hähnchenbrust'),'type','meal','time',30,'recipe',jsonb_build_object('servings',2,'ingredients',jsonb_build_array(jsonb_build_object('name','Hähnchenbrust','amount',200,'unit','g')),'steps','[]'::jsonb))),
 'plans',jsonb_build_object('2026-11-09',jsonb_build_array('[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,jsonb_build_array(recipe))),
 'pinnedMeals',jsonb_build_object('2026-11-09',jsonb_build_array('[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,jsonb_build_array(false))),
 'restDays','{"2026-11-16":[0]}'::jsonb,
 'cookingEntries',jsonb_build_object('batch',jsonb_build_object('id','batch','dishId',recipe,'date','2026-11-15','position',0,'portions',2.5,'restDates',jsonb_build_array('2026-11-16'),'pinned',false)));
 local_state:=jsonb_set(local_state,'{planningSettings}',(local_state->'planningSettings')||'{"configured":true,"adults":2,"children":1,"childFactor":0.5,"days":2}');
 response:=public.sync_household_v3(household,request,base,local_state);
 if response->'state'->'cookingEntries'->'batch'->'portions'<>'2.5' then raise exception 'fractional portions lost';end if;
 if response->'state'->'restDays'->'2026-11-16'<>'[0]' then raise exception 'cross-week rest link lost';end if;
 replay:=public.sync_household_v3(household,request,base,local_state);if replay<>response then raise exception 'retry mismatch';end if;
 cloud:=response->'state';
 other:=jsonb_set(cloud,'{cookingEntries,batch,portions}','3');response:=public.sync_household_v3(household,gen_random_uuid(),cloud,other);
 local_state:=jsonb_set(cloud,'{cookingEntries,batch,portions}','4');response:=public.sync_household_v3(household,gen_random_uuid(),cloud,local_state);
 if jsonb_array_length(response->'conflicts')<>1 or response->'conflicts'->0->>'kind'<>'cooking-plan' or response->'state'->'cookingEntries'->'batch'->'portions'<>'3' then raise exception 'atomic plan conflict failed: %',response;end if;
 conflict:=response->'conflicts'->0;request:=gen_random_uuid();response:=public.resolve_household_conflict_v3(household,request,conflict,'local');
 if response->'state'->'cookingEntries'->'batch'->'portions'<>'4' then raise exception 'resolution lost cooking portions';end if;
 if public.resolve_household_conflict_v3(household,request,conflict,'local')<>response then raise exception 'resolve retry mismatch';end if;
 cloud:=response->'state';local_state:=jsonb_set(cloud,'{quantityOverrides}','{"[\"2026-11-09\",\"hähnchenbrust\",\"g\"]":600}');response:=public.sync_household_v3(household,gen_random_uuid(),cloud,local_state);
 if response->'state'->'quantityOverrides'<>local_state->'quantityOverrides' then raise exception 'quantity override lost';end if;
 -- Manual shopping amounts preserve their units through sync and reload.
 cloud:=response->'state';
 local_state:=cloud||'{"manualShoppingItems":{"2026-11-09":["Mehl","Eier"]},"shoppingQuantities":{"mehl":{"amount":500,"unit":"g"},"eier":2}}'::jsonb;
 response:=public.sync_household_v3(household,gen_random_uuid(),cloud,local_state);
 if response->'state'->'shoppingQuantities' is distinct from local_state->'shoppingQuantities' or
    public.read_household_v3(household)->'state'->'shoppingQuantities' is distinct from local_state->'shoppingQuantities' then
   raise exception 'manual shopping amount or unit lost';
 end if;
 -- A v1/v2 writer cannot silently change a migrated plan.
 bad:=jsonb_set(response->'state','{plans,2026-11-09,6}','[]');
 begin perform wochentisch_sync.write_state(household,bad);raise exception 'legacy writer accepted plan change';exception when invalid_parameter_value then null;end;
 bad:=jsonb_set(response->'state','{cookingEntries,batch,restDates}','["2026-11-17"]');
 begin perform wochentisch_private.validate_cooking_state(bad);raise exception 'orphan rest accepted';exception when invalid_parameter_value then null;end;
 bad:=jsonb_set(response->'state','{cookingEntries,batch,portions}','0');
 begin perform wochentisch_private.validate_cooking_state(bad);raise exception 'zero portions accepted';exception when invalid_parameter_value then null;end;
 -- A recipe deletion concurrent with a portion change restores a consistent plan.
 cloud:=response->'state';other:=jsonb_set(cloud,'{cookingEntries,batch,portions}','5');perform public.sync_household_v3(household,gen_random_uuid(),cloud,other);
 local_state:=cloud||'{"dishes":[],"plans":{},"pinnedMeals":{},"restDays":{},"cookingEntries":{}}';response:=public.sync_household_v3(household,gen_random_uuid(),cloud,local_state);
 if jsonb_array_length(response->'conflicts')<1 or jsonb_array_length(wochentisch_sync.dangling_meals(response->'state'))<>0 then raise exception 'cross-unit consistency guard failed';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin perform public.read_household_v3(household);raise exception 'foreign read accepted';exception when insufficient_privilege then null;end;
 begin perform public.sync_household_v3(household,gen_random_uuid(),cloud,cloud);raise exception 'foreign write accepted';exception when insufficient_privilege then null;end;
 if has_function_privilege('anon','public.read_household_v3(uuid)','execute') or has_table_privilege('authenticated','wochentisch_private.cooking_state','select') then raise exception 'private state exposed';end if;
end;
$test$;
rollback;
