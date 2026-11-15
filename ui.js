/* Presentation only. Household state continues to be owned by app.js. */
function focusPlanEntry(days,today,validIds){
  const candidates=days.flatMap((entry,day)=>entry.day.map((id,meal)=>({id,day,meal,date:entry.date})))
    .filter(entry=>!validIds||validIds.has(entry.id));
  const localKey=date=>typeof date==='string'?date:[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  return candidates.find(entry=>localKey(entry.date)>=localKey(today))||candidates[0]||null;
}
function accountInitials(name){const words=String(name||'').trim().split(/[\s._-]+/u).filter(Boolean);return words.length?[words[0],...(words.length>1?[words[words.length-1]]:[])].map(word=>Array.from(word)[0]).join('').toLocaleUpperCase('de-DE').slice(0,4):''}
if(typeof module!=='undefined')module.exports={focusPlanEntry,accountInitials};

function updateAccountIdentity(user){
  const userId=user?.id||currentUserId;let name='';
  if(user){const display=user.user_metadata?.display_name;name=(typeof display==='string'&&display.trim())||String(user.email||'').split('@')[0];if(userId)try{localStorage.setItem(`wochentisch-display-name:${userId}`,name)}catch{}}
  else if(userId)try{name=localStorage.getItem(`wochentisch-display-name:${userId}`)||''}catch{}
  const avatar=document.getElementById('account-avatar');if(avatar){avatar.replaceChildren(accountInitials(name)?document.createTextNode(accountInitials(name)):uiIcon('profile'));avatar.setAttribute('aria-label',name?`Konto und Einstellungen für ${name}`:'Konto und Einstellungen');avatar.title=name||'Dein Konto'}
  const heading=document.getElementById('account-name');if(heading)heading.textContent=name||'Dein Konto';
}
function galleryPhoto(dish,fallback,index){
  const photo=recipePhoto(dish,{thumbnail:true,loading:index<4?'eager':'lazy'});if(!photo)return fallback;
  const original=photo.src,file=catalogRecipePhotoFiles.get(catalogDishNameKey(dish.name));
  photo.src=`./images/recipes/${file}-card.webp?v=1`;photo.width=384;photo.height=288;photo.decoding='async';
  if(index<2)photo.fetchPriority='high';
  photo.addEventListener('error',()=>{photo.src=original;photo.addEventListener('error',()=>photo.replaceWith(fallback),{once:true})},{once:true});return photo;
}

const uiIcons={
  week:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2"/>',
  dishes:'<path d="M12 5v16M3 3l9 2 9-2v16l-9 2-9-2z"/>',
  cooking:'<path d="M5 10h14v5a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6zM2 11h3m14 0h3M8 3v3m4-4v4m4-3v3"/>',
  shopping:'<path d="M3 9h18l-2 12H5zM8 9l4-7 4 7M9 13v4m6-4v4"/>',
  sliders:'<path d="M3 6h5m4 0h9M3 12h11m4 0h3M3 18h3m4 0h11M8 3v6m6 0v6M6 15v6"/>',
  profile:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  pin:'<path d="M8 3h8l-1 7 4 5H5l4-5zM12 15v7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  back:'<path d="m14 6-6 6 6 6"/>',
  edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/>',
  rest:'<path d="M4 9a8 8 0 1 1 0 7M4 3v6h6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
};
function uiIcon(name){const span=document.createElement('span');span.className='ui-icon';span.setAttribute('aria-hidden','true');span.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${uiIcons[name]||uiIcons.more}</svg>`;return span}
function uiPlaceholder(className='recipe-placeholder'){const placeholder=document.createElement('div');placeholder.className=className;placeholder.setAttribute('aria-hidden','true');placeholder.append(uiIcon('dishes'));return placeholder}
function uiButton(label,action,{icon='',className='secondary-button'}={}){const button=document.createElement('button');button.type='button';button.className=className;if(icon)button.append(uiIcon(icon));button.append(document.createTextNode(label));button.addEventListener('click',action);return button}
function cookingEntryOverlay(dialog){
  // Keep this menu out of the native dialog top layer: iOS can reposition it
  // after showModal() has focused its contents on a scrolled page.
  const layer=document.createElement('div');layer.className='cooking-entry-overlay';layer.hidden=true;
  dialog.setAttribute('aria-modal','true');layer.append(dialog);document.body.append(layer);
  let opener=null,inertSiblings=[],locked=false,backdropPressed=false;
  const close=dialog.close.bind(dialog);
  const release=()=>{
    layer.hidden=true;
    inertSiblings.forEach(element=>{element.inert=false});inertSiblings=[];
    if(locked){locked=false;unlockPageScroll()}
  };
  dialog.showModal=()=>{
    if(dialog.open)return;
    opener=document.activeElement;lockPageScroll();locked=true;
    try{
      syncVisualViewport();
      inertSiblings=[...document.body.children].filter(element=>element!==layer&&!element.inert);
      inertSiblings.forEach(element=>{element.inert=true});
      layer.hidden=false;dialog.setAttribute('open','');dialog.scrollTop=0;
      dialog.querySelector('.close-button').focus({preventScroll:true});
    }catch(error){dialog.removeAttribute('open');release();throw error}
  };
  dialog.close=(...args)=>{
    if(!dialog.open)return;
    close(...args);release();
    if(opener?.isConnected)opener.focus({preventScroll:true});
  };
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();return}
    if(event.key!=='Tab')return;
    const targets=[...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(element=>!element.disabled&&element.tabIndex>=0&&element.getClientRects().length);
    const first=targets[0],last=targets.at(-1);
    if(event.shiftKey&&event.target===first){event.preventDefault();last?.focus({preventScroll:true})}
    else if(!event.shiftKey&&event.target===last){event.preventDefault();first?.focus({preventScroll:true})}
  });
  layer.addEventListener('pointerdown',event=>{backdropPressed=event.target===layer});
  layer.addEventListener('click',event=>{if(event.target===layer&&backdropPressed)dialog.close()});
  return dialog;
}
function uiDialog(id,title){
  let dialog=document.getElementById(id);if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id=id;dialog.className='ui-dialog';dialog.setAttribute('aria-labelledby',`${id}-title`);
  const head=document.createElement('div');head.className='dialog-head';const heading=document.createElement('h2');heading.id=`${id}-title`;heading.textContent=title;
  const close=uiButton('×',()=>dialog.close(),{className:'close-button'});close.setAttribute('aria-label','Schließen');head.append(heading,close);dialog.append(head);document.body.append(dialog);
  if(id==='cooking-entry-dialog')return cookingEntryOverlay(dialog);
  let opener=null;const show=dialog.showModal.bind(dialog);dialog.showModal=()=>{if(dialog.open)return;opener=document.activeElement;lockPageScroll();try{syncVisualViewport();show()}catch(error){unlockPageScroll();throw error}};
  dialog.addEventListener('close',()=>{unlockPageScroll();if(opener?.isConnected)opener.focus({preventScroll:true})});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()}});
  return dialog;
}
function uiMenu(label,id){const details=document.createElement('details');details.className='ui-menu';details.id=id;const summary=document.createElement('summary');summary.append(uiIcon('sliders'),document.createTextNode(label));const panel=document.createElement('div');panel.className='ui-menu-panel';details.append(summary,panel);return {details,panel}}
let uiSelectedDay=0,uiSelectedMeal=0,uiRangeKey='',uiRecipeOpener=null,accountAvatar=null;
function uiDesktop(){return !compactNavigationQuery.matches}
function selectDesktopMeal(meal){
  if(!uiDesktop())return false;
  uiSelectedDay=Number(meal.closest('.day-content').dataset.day);uiSelectedMeal=Number(meal.dataset.mealIndex);renderWeekPreview();return true;
}
function enhanceWeekView(days){
  const grid=$('#calendar'),range=keyFor(days[0].date);
  if(range!==uiRangeKey){uiSelectedDay=0;uiSelectedMeal=0;uiRangeKey=range}
  const focus=focusPlanEntry(days,new Date(),new Set(state.dishes.map(d=>d.id)));
  grid.querySelectorAll('.day-card').forEach((card,index)=>{
    card.dataset.dayIndex=index;card.style.order=focus?.day===index?'-1':String(index);
    card.classList.toggle('focus-day',focus?.day===index);card.classList.toggle('empty-day',!days[index].day.length&&!days[index].isRest);
    card.classList.toggle('is-rest-day',days[index].isRest&&!days[index].day.length);
    const dayHead=card.querySelector('.day-head');dayHead.replaceChildren();
    const dayButton=uiButton(days[index].date.toLocaleDateString('de-DE',{weekday:'short',day:'numeric'}),()=>{uiSelectedDay=index;uiSelectedMeal=0;if(uiDesktop())renderWeekPreview();else chooseDish(index)},{className:'day-select'});
    dayButton.setAttribute('aria-label',`${formatChooserDate(days[index].date)} auswählen`);dayHead.append(dayButton);
    const rest=card.querySelector('.rest-day-tile');if(rest){const label=document.createElement('span');const linked=window.WochentischCookingPlan.restsAt(state,keyFor(days[index].date));label.className='linked-rest-copy';label.textContent='Reste';rest.replaceChildren(label,uiIcon('rest'));rest.addEventListener('click',()=>{uiSelectedDay=index;uiSelectedMeal=0;if(linked.length)openLinkedRest(days[index].date);else if(uiDesktop())renderWeekPreview();else chooseDish(index)});rest.tabIndex=0;rest.role='button';rest.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();rest.click()}})}
    if(card.classList.contains('empty-day')){const add=card.querySelector('.add-meal');add.replaceChildren(document.createTextNode('Nicht geplant'),uiIcon('plus'));if(uiDesktop()){add.onclick=event=>{event.stopImmediatePropagation();uiSelectedDay=index;uiSelectedMeal=0;renderWeekPreview()};add.addEventListener('click',add.onclick,{capture:true})}}
    card.querySelectorAll('.meal-card').forEach((meal,mealIndex)=>{
      const dish=state.dishes.find(d=>d.id===meal.dataset.dishId);if(!dish)return;
      meal.classList.toggle('focus-meal',focus?.day===index&&focus.meal===mealIndex);
      if(meal.classList.contains('focus-meal')){const date=document.createElement('p');date.className='meal-date';date.textContent=formatChooserDate(days[index].date);meal.querySelector('.meal-title').before(date)}
      const picture=meal.querySelector('.recipe-list-photo');if(picture&&meal.classList.contains('focus-meal')){const full=recipePhoto(dish);if(full)picture.src=full.src}
      if(!picture)meal.prepend(uiPlaceholder('meal-image-placeholder'));
      meal.querySelector('.meal-ingredient').textContent=plannedEntryLabel(days[index].date,mealIndex);
      meal.querySelector('.meal-time').textContent=`${dish.time||30} Min.`;
      meal.querySelector('.meal-nutrition').hidden=true;
      const pin=meal.querySelector('.meal-pin');pin.replaceChildren(uiIcon('pin'));
      const remove=meal.querySelector('.meal-remove');remove.hidden=true;

    });
  });
  $('#week-period').textContent=formatRange(days[0].date);renderWeekPreview();
}
function renderWeekPreview(){
  const days=planDaysInRange(),entry=days[uiSelectedDay]||days[0],preview=$('#week-preview');if(!preview||!entry)return;
  $('#calendar').querySelectorAll('.day-card').forEach((card,index)=>{card.classList.toggle('selected-day',index===uiSelectedDay);card.querySelector('.day-select').setAttribute('aria-pressed',String(index===uiSelectedDay))});
  preview.replaceChildren();const dishes=entry.day.map(id=>state.dishes.find(d=>d.id===id)).filter(Boolean);uiSelectedMeal=Math.min(uiSelectedMeal,Math.max(0,dishes.length-1));const dish=dishes[uiSelectedMeal];
  if(!dish){const body=document.createElement('div');body.className='week-preview-body empty-preview';const date=document.createElement('p');date.textContent=formatChooserDate(entry.date);const h=document.createElement('h2');h.textContent=entry.isRest?'Reste':'Nicht geplant';const copy=document.createElement('p'),linked=window.WochentischCookingPlan.restsAt(state,keyFor(entry.date));copy.textContent=entry.isRest?'':'Wähle ein Gericht aus deiner Sammlung.';if(linked.length)body.append(uiButton('Restetag ansehen',()=>openLinkedRest(entry.date),{className:'primary-button'}));body.append(date,h,copy,uiButton('Gericht auswählen',()=>chooseDish(uiSelectedDay),{className:'primary-button',icon:'plus'}));preview.append(body);preview.classList.toggle('rest-preview',entry.isRest);return}
  preview.classList.remove('rest-preview');const photo=recipePhoto(dish);if(photo)preview.append(photo);else{const placeholder=document.createElement('div');placeholder.className='recipe-placeholder';placeholder.append(uiIcon('dishes'));preview.append(placeholder)}
  const body=document.createElement('div');body.className='week-preview-body';const date=document.createElement('p');date.className='recipe-date';date.textContent=formatChooserDate(entry.date);
  const title=document.createElement('h2');title.textContent=dish.name;const meta=document.createElement('p');meta.className='preview-meta';meta.textContent=`${dish.time||30} Min. · ${plannedEntryLabel(entry.date,uiSelectedMeal)}`;
  const pin=uiButton('',()=>setMealPinned(entry.date,uiSelectedMeal,dish.id),{icon:'pin',className:'preview-pin'});pin.setAttribute('aria-label','Gericht fixieren');pin.setAttribute('aria-pressed',String(Boolean(pinnedMealsForDate(entry.date)[uiSelectedMeal])));
  body.append(date,title,pin,meta);const heading=document.createElement('h3');heading.textContent='Zutaten';body.append(heading);appendRecipeIngredients(body,dish,window.WochentischCookingPlan.total(window.WochentischCookingPlan.entryAt(state,keyFor(entry.date),uiSelectedMeal)));
  body.append(uiButton('Kochmenge ändern',()=>openCookingEntryOptions(entry.date,uiSelectedMeal,{editQuantity:true}),{className:'secondary-button'}));
  body.append(uiButton('Rezept ansehen',()=>openRecipe(dish.id,{from:'week',servings:window.WochentischCookingPlan.total(window.WochentischCookingPlan.entryAt(state,keyFor(entry.date),uiSelectedMeal))}),{icon:'dishes',className:'primary-button'}));
  body.append(uiButton('Weiteres Gericht hinzufügen',()=>chooseDish(uiSelectedDay),{icon:'plus',className:'text-button'}));
  if(dishes.length>1){const others=document.createElement('div');others.className='preview-other';dishes.forEach((item,index)=>{const b=uiButton(item.name,()=>{uiSelectedMeal=index;renderWeekPreview()});b.setAttribute('aria-pressed',String(index===uiSelectedMeal));others.append(b)});body.append(others)}
  preview.append(body);
}
function openMealActions(day,mealIndex){openCookingEntryOptions(rangeDates()[day],mealIndex)}
function appendCookingEntryActions(dialog,date,mealIndex,dishId){
  const day=rangeDates().findIndex(target=>keyFor(target)===keyFor(date));
  dialog.append(uiButton(pinnedMealsForDate(date)[mealIndex]?'Fixierung aufheben':'Gericht fixieren',()=>{dialog.close();setMealPinned(date,mealIndex,dishId)},{icon:'pin'}),uiButton('Weiteres Gericht hinzufügen',()=>{dialog.close();chooseDish(day)},{icon:'plus'}));
  dialog.append(uiButton('Gericht entfernen',()=>{dialog.close();removeMealFromDay(date,mealIndex,dishId)},{className:'text-button danger-action'}));
}

function showDesktopRecipe(){
  if(!uiDesktop()||recipeDetailPreviousView!=='week')return;
  const dialog=uiDialog('recipe-detail-dialog','Rezept');const content=$('#cooking-content');uiRecipeOpener=document.activeElement;dialog.append(content);$('#week-view').classList.remove('hidden');$('#cooking-view').classList.add('hidden');dialog.showModal();
  dialog.addEventListener('close',()=>{$('#cooking-view').append(content);if(cookingStage==='overview'){setView('week',{render:false});uiRecipeOpener?.focus({preventScroll:true})}},{once:true});
}
function enhanceRecipeOverview(dish){
  const content=$('#cooking-content');content.className='recipe-overview-content';
  const photo=content.querySelector(':scope > .recipe-detail-photo');content.querySelector('.recipe-detail-heading').before(photo||uiPlaceholder());
  const steps=[...content.querySelectorAll('.recipe-overview-panel')][1];if(steps&&steps.tagName!=='DETAILS'){const disclosure=document.createElement('details');disclosure.className='recipe-overview-panel recipe-preparation';const summary=document.createElement('summary');summary.textContent='Zubereitung ansehen';disclosure.append(summary,...[...steps.children].filter(el=>el.tagName!=='H3'));steps.replaceWith(disclosure)}
  const back=content.querySelector('.recipe-back');back.textContent=recipeDetailPreviousView==='week'?'‹ Wochenplan':recipeDetailPreviousView==='dishes'?'‹ Gerichte':'‹ Zubereiten';
  back.addEventListener('click',()=>content.closest('dialog')?.close());
  const edit=uiButton('Bearbeiten',()=>openDish(dish.id),{icon:'edit',className:'recipe-edit secondary-button'});content.insertBefore(edit,back.nextSibling);
  syncDesignNavigation();
}
function enhanceCookingList(){
  const content=$('#cooking-content');content.className='';const sections=content.querySelectorAll('.recipe-picker-section'),search=$('#cooking-search'),collection=sections[1];
  const picker=document.createElement('details');picker.className='collection-picker';const summary=document.createElement('summary');summary.textContent='Aus meiner Sammlung wählen';collection.before(picker);picker.append(summary,search,collection);collection.querySelector('h2').hidden=true;
  const focus=focusPlanEntry(planDaysInRange(),new Date(),new Set(state.dishes.map(d=>d.id)));if(!focus){picker.open=true;return}
  sections[0].querySelector('h2').textContent='Weitere Gerichte';sections[0].querySelectorAll('.recipe-list-card').forEach(card=>{if(card.dataset.dishId===focus.id)card.remove()});if(!sections[0].querySelector('.recipe-list-card'))sections[0].hidden=true;
  const dish=state.dishes.find(d=>d.id===focus.id),hero=document.createElement('section');hero.className='prepare-hero';hero.append(recipePhoto(dish)||uiPlaceholder());const body=document.createElement('div');body.className='week-preview-body';const date=document.createElement('p');date.className='recipe-date';date.textContent=formatChooserDate(focus.date);const h=document.createElement('h2');h.textContent=dish.name;const meta=document.createElement('p');meta.textContent=`${dish.time||30} Min. · ${dish.recipe?.servings||'–'} Portionen`;body.append(date,h,meta,uiButton('Zubereitung starten',async()=>{await openRecipe(dish.id);if(cookingProgress&&!cookingProgress.completed)return;if(dish.recipe?.steps?.length)await startCooking(dish)},{className:'primary-button',icon:'cooking'}));hero.append(body);content.prepend(hero);
}
function enhanceCookingStep(){
  const content=$('#cooking-content');content.className='cooking-step-content';const ingredients=content.querySelector('.cook-ingredients-details');if(ingredients){const details=document.createElement('details');details.className='cook-ingredients-details';details.open=uiDesktop();const summary=document.createElement('summary');summary.textContent='Zutaten griffbereit';details.append(summary,...ingredients.childNodes);ingredients.replaceWith(details)}syncDesignNavigation();
}
function syncDesignNavigation(){
  placeAccountAvatar();
  updateAccountIdentity();
  const actual=savedView(),active=actual==='cooking'&&cookingStage==='overview'?recipeDetailPreviousView:actual;
  document.querySelectorAll('.nav-item,.mobile-nav button').forEach(button=>{const selected=button.dataset.view===active;button.classList.toggle('active',selected);if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
  document.documentElement.dataset.view=actual;document.documentElement.dataset.cookingStage=cookingStage;
}
function placeAccountAvatar(){
  if(!accountAvatar)return;
  const view=savedView()==='cooking'?document.getElementById('cooking-view'):document.querySelector('.view:not(.hidden)');if(!view)return;
  let title=view.querySelector('.page-heading h1');
  if(view.id==='cooking-view'&&cookingStage==='overview')title=document.querySelector('#cooking-content .recipe-detail-heading h2')||title;
  if(view.id==='cooking-view'&&cookingStage==='cook')title=document.querySelector('#cooking-content .cook-step-title')||title;
  if(!title)return;
  let row=title.parentElement;
  if(!row.classList.contains('screen-title')){row=document.createElement('div');row.className='screen-title';title.before(row);row.append(title)}
  row.prepend(accountAvatar);
}
let shoppingAssociationTimeout=0;
function openShoppingAssociation(tile,labels,{autoDismiss=false}={}){
  clearTimeout(shoppingAssociationTimeout);
  const dialog=uiDialog('shopping-association','Zugeordnete Gerichte');dialog.querySelectorAll(':scope > :not(.dialog-head)').forEach(el=>el.remove());
  const list=document.createElement('ul');labels.forEach(label=>{const li=document.createElement('li');li.textContent=label;list.append(li)});dialog.append(list);dialog.showModal();
  if(autoDismiss)shoppingAssociationTimeout=setTimeout(()=>{if(dialog.open)dialog.close()},3000);
  dialog.addEventListener('close',()=>clearTimeout(shoppingAssociationTimeout),{once:true});
}
function wireShoppingAssociation(tile,labels){
  let timer=0,start=null,suppressUntil=0,suppressClick=false;const cancel=()=>{clearTimeout(timer);timer=0;start=null};const show=(autoDismiss=false)=>{cancel();suppressClick=autoDismiss;suppressUntil=Date.now()+900;openShoppingAssociation(tile,labels,{autoDismiss})};
  tile.addEventListener('pointerdown',event=>{cancel();if(event.button!==0)return;suppressClick=false;start={x:event.clientX,y:event.clientY};timer=setTimeout(()=>show(true),500)});
  tile.addEventListener('pointermove',event=>{if(start&&Math.hypot(start.x-event.clientX,start.y-event.clientY)>8)cancel()});
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>tile.addEventListener(type,cancel));
  const scrollCancel=()=>cancel();window.addEventListener('scroll',scrollCancel,{capture:true,passive:true});
  // Abort the global listener when a list rerender removes this tile.
  tile._disposeAssociation=()=>{cancel();window.removeEventListener('scroll',scrollCancel,true)};
  tile.addEventListener('click',event=>{if(suppressClick||Date.now()<suppressUntil){suppressClick=false;event.preventDefault();event.stopImmediatePropagation()}},true);
  tile.addEventListener('contextmenu',event=>{event.preventDefault();show()});
  tile.addEventListener('keydown',event=>{if(event.key===' ')suppressClick=false;if(event.key==='Enter'||(event.key==='F10'&&event.shiftKey)){event.preventDefault();show()}});
}
function enhanceShoppingList(){
  const open=$('#shopping-open'),done=$('#shopping-done');
  // Merge each category while preserving the same name ordering for checked items.
  const groups=new Map();[open,done].forEach(container=>{let category='Sonstiges';[...container.children].forEach(child=>{if(child.tagName==='H3')category=child.textContent;else{if(!groups.has(category))groups.set(category,[]);groups.get(category).push(child)}})});
  open.replaceChildren();done.replaceChildren();
  const order=['Gemüse','Obst','Brot & Backwaren','Fleisch & Fisch','Kühlregal','Tiefkühl','Getränke','Vorrat','Drogerie & Haushalt','Tierbedarf','Sonstiges'];
  order.forEach(category=>{const items=groups.get(category);if(!items?.length)return;const h=document.createElement('h3');h.className='shopping-category-title';h.textContent=category;open.append(h);items.sort((a,b)=>a.querySelector('strong').textContent.localeCompare(b.querySelector('strong').textContent,'de')).forEach(shell=>{open.append(shell);const quantity=shell.querySelector('.shopping-quantity');if(quantity){const details=document.createElement('details');details.className='quantity-disclosure';const summary=document.createElement('summary');summary.textContent=`${quantity.querySelector('output').textContent} ×`;summary.setAttribute('aria-label',quantity.getAttribute('aria-label')+' bearbeiten');quantity.before(details);details.append(summary,quantity)}})});
  $('#shopping-done-section').hidden=true;const checked=open.querySelectorAll('.is-checked').length;$('#shopping-open-count').textContent=`${open.querySelectorAll('.shopping-tile').length-checked} offen · ${checked} erledigt`;
  $('#shopping-overview').textContent=$('#shopping-meal-filter').value?'Filter zurücksetzen':'';
}
function configureRecipeForm(){
  const form=$('#dish-form');form.classList.add('recipe-form');
  const timeLabel=document.createElement('label');timeLabel.className='recipe-minutes-label';timeLabel.textContent='Zeit in Minuten';const minutes=document.createElement('input');minutes.id='dish-minutes';minutes.type='number';minutes.min='1';minutes.max='1440';minutes.required=true;minutes.inputMode='numeric';timeLabel.append(minutes);
  const meta=document.createElement('div');meta.className='recipe-base-fields';$('.time-slider-label').before(meta);meta.append(timeLabel,$('.recipe-servings-control'));
  const wrap=(id,title,nodes)=>{const details=document.createElement('details');details.id=id;details.className='editor-disclosure';const summary=document.createElement('summary');summary.textContent=title;details.append(summary);nodes[0].before(details);nodes.forEach(node=>details.append(node));return details};
  const ingredients=wrap('editor-ingredients','Zutaten',[...recipeEditorGroups.ingredients].filter(el=>!el.classList.contains('recipe-servings-control')));
  const preparation=wrap('editor-preparation','Zubereitung',[...recipeEditorGroups.preparation]);
  const nutrition=wrap('editor-nutrition','Nährwerte · optional',recipeEditorGroups.nutrition);
  const imports=document.createElement('details');imports.className='editor-disclosure';const summary=document.createElement('summary');summary.textContent='Rezept importieren';imports.append(summary);nutrition.after(imports);Object.values(sectionImportPanels).forEach(entry=>{entry.panel.hidden=false;imports.append(entry.panel)});
  $('#recipe-editor-heading').hidden=true;
  form.addEventListener('invalid',event=>{let node=event.target.parentElement;while(node&&node!==form){if(node.tagName==='DETAILS')node.open=true;node=node.parentElement}},true);
  return {ingredients,preparation,nutrition};
}
function uiSetRecipeMinutes(minutes){const field=$('#dish-minutes');if(field)field.value=String(minutes)}
function renderRecipeForm(){
  const form=$('#dish-form');form.noValidate=true;form.classList.remove('is-dish-wizard','is-dish-edit-wizard');
  Object.values(recipeEditorGroups).flat().forEach(el=>el.hidden=false);$('.recipe-servings-control').hidden=false;$('.recipe-editor-hint').hidden=false;portionHint.hidden=true;servingsSuffix.hidden=false;$('.recipe-servings-field').textContent='Basis-Portionen';$('#recipe-servings').placeholder='–';
  Object.values(sectionImportPanels).forEach(entry=>entry.panel.hidden=false);dishImportSource.hidden=!dishImport;dishImportDefaults.hidden=!dishImport;
  $('.recipe-editor-section').hidden=false;$('#recipe-editor-heading').hidden=true;$('#dish-form .form-row').hidden=false;$('#cancel-dialog').hidden=false;$('#delete-dish').hidden=!$('#dish-id').value||recipeEditorMode==='catalog';form.querySelector('[type="submit"]').hidden=false;
  updateDishTypeFields();
}
function initializeDesign(){
  // Keep touch/mouse focus quiet while retaining visible keyboard navigation.
  document.addEventListener('pointerdown',()=>{document.documentElement.dataset.inputModality='pointer'},true);
  document.addEventListener('keydown',event=>{if(!event.metaKey&&!event.ctrlKey&&!event.altKey)document.documentElement.dataset.inputModality='keyboard'},true);

  document.documentElement.classList.add('design');
  const nav=document.createElement('nav');nav.className='mobile-nav';nav.setAttribute('aria-label','Hauptnavigation');
  [['week','Wochenplan'],['dishes','Gerichte'],['cooking','Zubereiten'],['shopping','Einkauf']].forEach(([view,label])=>{const button=uiButton(label,()=>{if(view==='cooking'){void saveCookingProgress();cookingStage='list';selectedRecipeDishId=''}setView(view);window.scrollTo(0,0)},{icon:view,className:'mobile-nav-item'});button.dataset.view=view;nav.append(button);const desktop=$(`#sidebar .nav-item[data-view="${view}"]`);desktop.replaceChildren(uiIcon(view),document.createTextNode(label));if(view==='cooking')desktop.addEventListener('click',event=>{event.stopImmediatePropagation();void saveCookingProgress();cookingStage='list';selectedRecipeDishId='';setView('cooking');closeMobileMenu()},{capture:true});});
  // Counters remain as compatibility targets for the existing state renderer.
  const counters=document.createElement('div');counters.hidden=true;['nav-count','dish-count','shopping-nav-count'].forEach(id=>{if(!document.getElementById(id)){const node=document.createElement('span');node.id=id;counters.append(node)}});document.body.append(counters);const dock=document.createElement('div');dock.className='mobile-nav-dock';dock.append(nav);$('.app-shell').append(dock);
  const account=uiDialog('account-dialog','Dein Konto');const accountMenu=$('#profile-actions-menu');const accountName=document.createElement('p');accountName.id='account-name';accountName.className='account-name';account.append(accountName,accountMenu);accountMenu.hidden=false;
  const openAccount=()=>{accountMenu.hidden=false;account.showModal()};account.addEventListener('click',event=>{if(event.target.closest('.profile-action,.nav-item'))account.close()});
  const admin=$('#catalog-admin-nav');accountMenu.append(admin);
  accountAvatar=uiButton('',openAccount,{className:'account-avatar'});accountAvatar.id='account-avatar';accountAvatar.setAttribute('aria-haspopup','dialog');$('#household-open').querySelector('span:last-child').textContent='Profil & Haushalt';
  const weekHeading=$('#week-view .page-heading');weekHeading.querySelector('h1').firstChild.textContent='Wochenplan';const period=document.createElement('p');period.className='subheading';period.id='week-period';weekHeading.querySelector('.subheading').replaceWith(period);
  const plan=uiMenu('Planen','plan-menu');weekHeading.append(plan.details);const toolbar=$('#week-view .week-toolbar');const planHeading=document.createElement('div');planHeading.className='plan-menu-heading';planHeading.textContent='Deine Wochenplanung';$('#mix-btn').replaceChildren(uiIcon('sliders'),document.createTextNode('7 Tage mischen'));plan.panel.append(planHeading,toolbar,$('#mix-btn'));
  plan.panel.addEventListener('click',event=>{if(event.target.closest('button')&&!event.target.closest('.week-switch'))plan.details.open=false});
  const layout=document.createElement('div');layout.className='week-layout';$('#calendar').before(layout);const preview=document.createElement('section');preview.id='week-preview';preview.setAttribute('aria-label','Ausgewählter Tag');layout.append($('#calendar'),preview);
  $('#dishes-view h1').firstChild.textContent='Gerichte';$('#dishes-type').before($('#search-dishes').closest('.search-box'));$('#dishes-view').append($('#catalog-btn'));$('#catalog-btn').textContent='Standardkatalog entdecken';$('#add-dish-btn').replaceChildren(uiIcon('plus'),document.createTextNode('Hinzufügen'));
  $('.main-ingredient-hint').textContent='Zum Beispiel Vegetarisch oder Suppe.';
  const shopMenu=uiMenu('Liste','shopping-menu');$('#shopping-view .page-heading').append(shopMenu.details);const tools=$('#shopping-view .shopping-screen-tools');shopMenu.panel.append(tools,$('#shopping-history-open'),$('#shopping-clear'));$('#shopping-view .page-heading').after($('#shopping-add-form'),$('#shopping-overview'));$('#shopping-add-form button[type="submit"]').replaceChildren(uiIcon('plus'));$('#shopping-add-form button[type="submit"]').setAttribute('aria-label','Artikel hinzufügen');$('#shopping-view .shopping-section > h2').firstChild.textContent='Einkaufsliste ';
  shopMenu.panel.addEventListener('click',event=>{if(event.target.closest('button'))shopMenu.details.open=false});$('#shopping-meal-filter').addEventListener('change',()=>shopMenu.details.open=false);
  configureRecipeForm();
  document.addEventListener('click',event=>document.querySelectorAll('.ui-menu[open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.ui-menu[open]').forEach(menu=>{menu.open=false;menu.querySelector('summary').focus()})});
  let baseline=window.innerHeight;const keyboard=()=>{const editable=document.activeElement?.matches('input:not([type=checkbox]):not([type=range]),textarea,select');const height=window.visualViewport?.height||window.innerHeight;if(!editable)baseline=window.innerHeight;document.documentElement.classList.toggle('keyboard-open',Boolean(editable&&baseline-height>150))};window.visualViewport?.addEventListener('resize',keyboard);document.addEventListener('focusin',keyboard);document.addEventListener('focusout',()=>requestAnimationFrame(keyboard));
  compactNavigationQuery.addEventListener('change',()=>{const dialog=$('#recipe-detail-dialog');if(dialog?.open&&!uiDesktop())dialog.close();renderCalendar();syncDesignNavigation()});syncDesignNavigation();
}
