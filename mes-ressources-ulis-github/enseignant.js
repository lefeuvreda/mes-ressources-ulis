(() => {
  'use strict';
  const CLOUD = window.ULIS_CLOUD;
  const LIVE = !!CLOUD?.configured();
  let authenticated = false;
  let loading = false;
  let unsubscribe = null;
  const BASE = Array.isArray(window.ULIS_RESOURCES) ? window.ULIS_RESOURCES : [];
  const STORAGE_KEY = 'mr-teacher-library-v1';
  const LEVELS = ['6e','5e','4e','3e','Tous'];
  const SUBJECTS = ['Français','Mathématiques','Histoire-Géo','Sciences','Anglais','Méthodes'];
  const KINDS = {cours:'Cours',methode:'Fiche méthode',outil:'Outil'};
  const BLOCKS = {text:'Explication',steps:'Méthode en étapes',bullets:'Liste de repères',example:'Exemple',note:'À retenir',check:'Question avec réponse',image:'Image / schéma'};
  const $ = id => document.getElementById(id);
  const el = (tag,cls,text) => { const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e; };
  const clone = value => JSON.parse(JSON.stringify(value));
  const clean = value => typeof value==='string'?value.trim():'';
  const defaultLibrary = () => BASE.map(r=>({...clone(r),status:'ready'}));
  let library = LIVE ? [] : readLocal();
  let editingId = null, dirty = false, noticeTimeout;
  function readLocal(){
    try {
      const json=localStorage.getItem(STORAGE_KEY);
      if(!json) return defaultLibrary();
      const items=JSON.parse(json);
      if(!Array.isArray(items))return defaultLibrary();
      return validateCollection(items);
    } catch(err){return defaultLibrary();}
  }
  function validateCollection(items){
    if(!Array.isArray(items)||items.length>5000)throw Error('Bibliothèque trop volumineuse ou invalide.');
    const ids=new Set();
    return items.map((r,i)=>{
      if(!r||typeof r!=='object'||Array.isArray(r))throw Error(`Ressource ${i+1} incorrecte.`);
      const id=clean(r.id);
      if(!id||id.length>160||ids.has(id))throw Error(`Identifiant de fiche invalide ou en doublon (${i+1}).`);
      ids.add(id);
      if(!LEVELS.includes(r.level)||!SUBJECTS.includes(r.subject)||!KINDS[r.kind])throw Error(`Niveau, discipline ou type invalide dans la fiche ${i+1}.`);
      if(!Array.isArray(r.blocks)||r.blocks.length>100)throw Error(`Contenu invalide dans la fiche ${i+1}.`);
      const title=clean(r.title),summary=clean(r.summary);
      if(!title||title.length>140||!summary||summary.length>340)throw Error(`Titre ou présentation incorrecte dans la fiche ${i+1}.`);
      const blocks = r.blocks.map((b,j)=>{
        if(!b || typeof b!=='object'||!BLOCKS[b.kind])throw Error(`Bloc ${j+1} invalide de la fiche ${i+1}.`);
        if(b.kind==='text')return {kind:'text',title:clean(b.title)||'À comprendre',text:clean(b.text)};
        if(b.kind==='steps'||b.kind==='bullets')return {kind:b.kind,title:clean(b.title)||'Les étapes',items:(Array.isArray(b.items)?b.items:[]).slice(0,50).map(clean)};
        if(b.kind==='example'||b.kind==='note')return {kind:b.kind,text:clean(b.text)};
        if(b.kind==='check')return {kind:'check',question:clean(b.question),answer:clean(b.answer)};
        if(b.kind==='image')return {kind:'image',src:safeAsset(b.src),alt:clean(b.alt),caption:clean(b.caption)};
      });
      const documents = (Array.isArray(r.documents)?r.documents:[]).slice(0,30).map(d=>({title:clean(d?.title),url:safeAsset(d?.url)}));
      return {id,level:r.level,subject:r.subject,kind:r.kind,title,summary,keywords:clean(r.keywords),blocks,documents,status:r.status==='draft'?'draft':'ready'};
    });
  }
  function persist(items){
    try {localStorage.setItem(STORAGE_KEY,JSON.stringify(items));library=items;return true;}
    catch(err){notify('Enregistrement impossible dans ce navigateur. Exportez une sauvegarde ou libérez du stockage.',true);return false;}
  }
  async function reloadCloud(silent = false) {
    if (!LIVE || !authenticated || loading || dirty) return;
    loading=true;
    try {
      library=validateCollection(await CLOUD.all());
      renderLibrary();
      if(!silent)notify('Bibliothèque synchronisée avec le serveur.');
      $('cloudBanner').textContent=`● En ligne — ${library.filter(r=>r.status==='ready').length} fiche(s) publiées. Toute modification enregistrée est partagée automatiquement.`;
    } catch(err) {
      $('cloudBanner').textContent='⚠ Impossible de lire les données du serveur. Les modifications sont suspendues.';
      if(!silent)notify('Synchronisation impossible : '+err.message,true);
    } finally { loading=false; }
  }
  async function saveOne(resource) {
    if(LIVE) {
      if(!authenticated)throw Error('Connexion enseignant requise.');
      await CLOUD.upsert(resource);
      library=validateCollection(await CLOUD.all());
      return true;
    }
    const items=[...library];const index=items.findIndex(r=>r.id===resource.id);
    if(index>=0)items[index]=resource;else items.push(resource);
    return persist(validateCollection(items));
  }
  async function deleteOne(id) {
    if(LIVE) {
      if(!authenticated)throw Error('Connexion enseignant requise.');
      await CLOUD.remove(id);
      library=validateCollection(await CLOUD.all());
      return true;
    }
    return persist(library.filter(r=>r.id!==id));
  }
  async function importExamples() {
    if(LIVE) {
      const example=defaultLibrary().map(r=>({...r,id:createId(),status:'draft'}));
      await CLOUD.upsertMany(example);
      library=validateCollection(await CLOUD.all());
      renderLibrary();
      notify(`${example.length} exemples ajoutés comme BROUILLONS, invisibles aux élèves.`);
    }else if(persist(defaultLibrary())){renderLibrary();notify('Exemples restaurés dans le navigateur (mode démonstration).');}
  }
  function errorMessage(err){return err?.message || 'Erreur réseau inattendue';}
  function notify(message,error=false){
    const box=$('message');box.textContent=message;box.classList.toggle('error',error);box.hidden=false;
    if(noticeTimeout)clearTimeout(noticeTimeout);
    noticeTimeout=setTimeout(()=>{box.hidden=true},8500);
  }
  function showView(view){
    for(const name of ['library','editor','export'])$(name+'View').hidden=name!==view;
    for(const button of document.querySelectorAll('.nav-link'))button.classList.toggle('is-active',button.dataset.view===view);
    if(view==='library')renderLibrary();
    window.scrollTo({top:0,behavior:'instant'});
    $('contenu').focus({preventScroll:true});
  }
  function canLeave(){return !dirty||window.confirm('Des modifications de cette fiche ne sont pas enregistrées. Les abandonner ?');}
  function navigate(view){
    if(!canLeave())return;
    if(view==='editor')startNew();
    else {dirty=false;showView(view);}
  }
  function renderLibrary(){
    $('statTotal').textContent=library.length;
    $('statReady').textContent=library.filter(r=>r.status==='ready').length;
    $('statDraft').textContent=library.filter(r=>r.status==='draft').length;
    const q=clean($('filterSearch').value).toLocaleLowerCase('fr');
    const level=$('filterLevel').value,subject=$('filterSubject').value,status=$('filterStatus').value;
    const visible=library.filter(r=>(!level||r.level===level)&&(!subject||r.subject===subject)&&(!status||r.status===status)&&(!q||[r.title,r.summary,r.keywords,r.subject].join(' ').toLocaleLowerCase('fr').includes(q)))
      .sort((a,b)=>LEVELS.indexOf(a.level)-LEVELS.indexOf(b.level)||a.subject.localeCompare(b.subject,'fr')||a.title.localeCompare(b.title,'fr'));
    $('listCount').textContent=visible.length;
    $('emptyList').hidden=visible.length!==0;
    const body=$('resourcesBody');body.replaceChildren();
    for(const r of visible){
      const tr=el('tr');const tName=el('td');tName.append(el('div','resource-name',r.title),el('div','resource-desc',r.summary));
      const levelCell=el('td');levelCell.append(el('span','tag',r.level==='Tous'?'Tous niveaux':r.level));
      const type=el('td','',KINDS[r.kind]);const status=el('td');status.append(el('span','status '+r.status,r.status==='ready'?'Publiée':'Brouillon'));
      const actions=el('td');const tools=el('div','table-actions');
      const edit=button('Modifier','text-btn',()=>openEditor(r.id));
      const duplicate=button('Dupliquer','text-btn subtle',()=>duplicateResource(r.id));
      const remove=button('Supprimer','text-btn danger-text',()=>removeResource(r.id));
      tools.append(edit,duplicate,remove);actions.append(tools);tr.append(tName,levelCell,type,status,actions);body.append(tr);
    }
  }
  function button(label,cls,handler){const b=el('button',cls,label);b.type='button';b.addEventListener('click',handler);return b;}
  function createId(){return 'fiche-'+(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2));}
  function newResource(){return {id:createId(),title:'',level:'5e',subject:'Français',kind:'cours',status:'draft',summary:'',keywords:'',blocks:[{kind:'text',title:'Ce que je dois savoir',text:''}],documents:[]};}
  function startNew(){
    editingId=null;fillEditor(newResource());$('editorHeading').textContent='Nouvelle ressource';dirty=false;showView('editor');
  }
  function openEditor(id){
    if(!canLeave())return;
    const resource=library.find(r=>r.id===id);if(!resource)return;
    editingId=id;fillEditor(resource);$('editorHeading').textContent='Modifier une ressource';dirty=false;showView('editor');
  }
  function fillEditor(r){
    $('fieldTitle').value=r.title;
    $('fieldLevel').value=r.level;$('fieldSubject').value=r.subject;$('fieldKind').value=r.kind;$('fieldStatus').value=r.status;
    $('fieldSummary').value=r.summary;$('fieldKeywords').value=r.keywords||'';
    renderBlocks(r.blocks||[]);renderDocuments(r.documents||[]);
  }
  function field(label,key,value,rows=0,help=''){
    const wrap=el('label');wrap.append(el('span','',label));
    const inp=rows?el('textarea'):el('input');inp.dataset.key=key;inp.value=value||'';
    if(rows)inp.rows=rows;else inp.type='text';
    wrap.append(inp);if(help)wrap.append(el('span','block-caption',help));return wrap;
  }
  function renderBlocks(blocks){
    const container=$('blocksEditor');container.replaceChildren();
    for(const [i,b] of blocks.entries()){
      const card=el('div','block-card');card.dataset.kind=b.kind;
      const head=el('div','block-title');head.append(el('strong','',`${i+1}. ${BLOCKS[b.kind]||b.kind}`));
      const controls=el('div','block-controls');
      const up=button('↑','square-btn',()=>modifyBlocks(i,'up'));up.title='Monter ce bloc';up.setAttribute('aria-label',`Monter le bloc ${i+1}`);up.disabled=i===0;
      const down=button('↓','square-btn',()=>modifyBlocks(i,'down'));down.title='Descendre ce bloc';down.setAttribute('aria-label',`Descendre le bloc ${i+1}`);down.disabled=i===blocks.length-1;
      const remove=button('✕','square-btn remove',()=>modifyBlocks(i,'delete'));remove.title='Supprimer ce bloc';remove.setAttribute('aria-label',`Supprimer le bloc ${i+1}`);
      controls.append(up,down,remove);head.append(controls);card.append(head);
      const inputs=el('div','block-fields');
      if(b.kind==='text')inputs.append(field('Titre de la section','title',b.title),field('Explication','text',b.text,5));
      else if(b.kind==='steps'||b.kind==='bullets')inputs.append(field('Titre','title',b.title),field('Une étape ou une idée par ligne','items',(b.items||[]).join('\n'),5));
      else if(b.kind==='note'||b.kind==='example')inputs.append(field('Texte','text',b.text,4));
      else if(b.kind==='check')inputs.append(field('Question','question',b.question,2),field('Réponse à dévoiler','answer',b.answer,3));
      else if(b.kind==='image')inputs.append(field('Chemin de l’image ou URL HTTPS','src',b.src,0,'Ex. : images/carte-france.png'),field('Description textuelle de l’image','alt',b.alt,2),field('Légende facultative','caption',b.caption));
      card.append(inputs);container.append(card);
    }
    const empty=el('p','document-note','Aucun bloc ajouté. Commencez par une explication ou une fiche méthode.');
    if(!blocks.length)container.append(empty);
  }
  function readBlocks(){
    return [...$('blocksEditor').querySelectorAll('.block-card')].map(card=>{
      const values={};for(const input of card.querySelectorAll('[data-key]'))values[input.dataset.key]=input.value;
      const kind=card.dataset.kind;
      if(kind==='text')return {kind,title:values.title||'',text:values.text||''};
      if(kind==='steps'||kind==='bullets')return {kind,title:values.title||'',items:(values.items||'').split('\n')};
      if(kind==='note'||kind==='example')return {kind,text:values.text||''};
      if(kind==='check')return {kind,question:values.question||'',answer:values.answer||''};
      return {kind:'image',src:values.src||'',alt:values.alt||'',caption:values.caption||''};
    });
  }
  function modifyBlocks(index,action){
    const blocks=readBlocks();
    if(action==='delete')blocks.splice(index,1);
    else if(action==='up'&&index>0)[blocks[index-1],blocks[index]]=[blocks[index],blocks[index-1]];
    else if(action==='down'&&index<blocks.length-1)[blocks[index+1],blocks[index]]=[blocks[index],blocks[index+1]];
    renderBlocks(blocks);dirty=true;
  }
  function appendBlock(){
    const type=$('blockType').value;const templates={text:{kind:'text',title:'',text:''},steps:{kind:'steps',title:'',items:['']},bullets:{kind:'bullets',title:'',items:['']},note:{kind:'note',text:''},example:{kind:'example',text:''},check:{kind:'check',question:'',answer:''},image:{kind:'image',src:'',alt:'',caption:''}};
    const blocks=readBlocks();blocks.push(templates[type]);renderBlocks(blocks);dirty=true;
    $('blocksEditor').lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function renderDocuments(docs){
    const container=$('documentsEditor');container.replaceChildren();
    for(const [i,d] of docs.entries()){
      const card=el('div','doc-card');const head=el('div','block-title');head.append(el('strong','','Document '+(i+1)),button('Supprimer','square-btn remove',()=>{const items=readDocuments();items.splice(i,1);renderDocuments(items);dirty=true;}));
      card.append(head);const inputs=el('div','block-fields');inputs.append(field('Titre du document','title',d.title),field('Chemin local ou URL HTTPS','url',d.url,0,'Ex. : documents/cours-histoire.pdf'));
      card.append(inputs);container.append(card);
    }
  }
  function readDocuments(){return [...$('documentsEditor').querySelectorAll('.doc-card')].map(card=>{const a={};for(const inp of card.querySelectorAll('[data-key]'))a[inp.dataset.key]=inp.value;return a;});}
  function safeAsset(value){
    const raw=clean(value);if(!raw)return '';
    if(/^https:\/\//i.test(raw))return raw;
    if(/^[a-z][\w+.-]*:/i.test(raw)||raw.startsWith('//')||raw.startsWith('/')||raw.includes('\\'))return '';
    if(raw.split('/').some(s=>s==='..')||/[<>"']/.test(raw))return '';
    return raw;
  }
  function gather(validate=true){
    const title=clean($('fieldTitle').value),summary=clean($('fieldSummary').value);
    if(validate&&(!title||!summary)){notify('Renseignez le titre et la présentation de la ressource.',true);(!title?$('fieldTitle'):$('fieldSummary')).focus();return null;}
    let blocks=readBlocks().map(b=>{
      const kind=b.kind;
      if(kind==='text')return {kind,title:clean(b.title)||'À comprendre',text:clean(b.text)};
      if(kind==='steps'||kind==='bullets')return {kind,title:clean(b.title)||'Les étapes',items:b.items.map(clean).filter(Boolean)};
      if(kind==='note'||kind==='example')return {kind,text:clean(b.text)};
      if(kind==='check')return {kind,question:clean(b.question),answer:clean(b.answer)};
      return {kind:'image',src:clean(b.src),alt:clean(b.alt),caption:clean(b.caption)};
    });
    if(validate){
      if(!blocks.length){notify('Ajoutez au moins un bloc de contenu.',true);return null;}
      for(let i=0;i<blocks.length;i++){
        const b=blocks[i];let ok=true;
        if(b.kind==='text'||b.kind==='note'||b.kind==='example')ok=!!b.text;
        else if(b.kind==='steps'||b.kind==='bullets')ok=b.items.length>0;
        else if(b.kind==='check')ok=!!b.question&&!!b.answer;
        else if(b.kind==='image')ok=!!b.src&&!!safeAsset(b.src)&&!!b.alt;
        if(!ok){notify(`Bloc ${i+1} : complétez tous les champs essentiels (et vérifiez l’URL de l’image).`,true);return null;}
      }
    }
    blocks=blocks.map(b=>b.kind==='image'?{...b,src:safeAsset(b.src)}:b);
    let documents=readDocuments().map(d=>({title:clean(d.title),url:clean(d.url)})).filter(d=>d.title||d.url);
    if(validate){for(let i=0;i<documents.length;i++)if(!documents[i].title||!safeAsset(documents[i].url)){notify(`Document ${i+1} : indiquez un titre et une URL HTTPS ou un chemin local valide.`,true);return null;}}
    documents=documents.map(d=>({...d,url:safeAsset(d.url)}));
    return {id:editingId||createId(),title,summary,level:$('fieldLevel').value,subject:$('fieldSubject').value,kind:$('fieldKind').value,status:$('fieldStatus').value,keywords:clean($('fieldKeywords').value),blocks,documents};
  }
  async function save(event){
    event.preventDefault();const resource=gather(true);if(!resource)return;
    try { validateCollection([resource]); }catch(err){notify(err.message,true);return;}
    const submit=$('saveResource');submit.disabled=true;submit.textContent=LIVE?'Enregistrement en ligne…':'Enregistrement…';
    try{
      if(!await saveOne(resource))return;
      dirty=false;
      notify(LIVE?(resource.status==='ready'?'Fiche publiée : les tablettes reçoivent la mise à jour.':'Brouillon sauvegardé : invisible aux élèves.'):'Fiche enregistrée en mode local (sans synchronisation).');
      showView('library');
    }catch(err){notify('Échec de l’enregistrement : '+errorMessage(err)+'. La fiche reste ouverte.',true);}
    finally{submit.disabled=false;submit.textContent='Enregistrer la fiche';}
  }
  async function duplicateResource(id){
    const r=library.find(x=>x.id===id);if(!r)return;
    const copy={...clone(r),id:createId(),title:r.title+' (copie)',status:'draft'};
    try{if(!await saveOne(copy))return;renderLibrary();notify('Copie enregistrée comme brouillon.');openEditor(copy.id);}
    catch(err){notify('Duplication impossible : '+errorMessage(err),true);}
  }
  let currentConfirmation = null;
  function confirmAction(title,text,action){
    $('confirmHeading').textContent=title;$('confirmText').textContent=text;currentConfirmation=action;$('confirmDialog').showModal();
  }
  function removeResource(id){
    const r=library.find(x=>x.id===id);if(!r)return;
    confirmAction('Supprimer cette fiche ?',`« ${r.title} » sera retirée ${LIVE?'de la base commune et des tablettes connectées':'de la bibliothèque locale'}.`,async()=>{
      try {if(await deleteOne(id)){renderLibrary();notify(LIVE?'Fiche supprimée sur le serveur. Les tablettes vont se mettre à jour.':'Fiche retirée localement.');}}
      catch(err){notify('Suppression impossible : '+errorMessage(err),true);}
    });
  }
  function showPreview(){
    const r=gather(true);if(!r)return;
    const content=$('previewContent');content.replaceChildren();
    content.append(el('p','eyebrow',`${r.level==='Tous'?'Tous niveaux':r.level} · ${r.subject} · ${KINDS[r.kind]}`),el('h1','',r.title),el('p','intro',r.summary));
    for(const b of r.blocks){
      if(b.kind==='text')content.append(el('h2','',b.title),el('p','',b.text));
      if(b.kind==='steps'||b.kind==='bullets'){
        content.append(el('h2','',b.title));const list=el(b.kind==='steps'?'ol':'ul');for(const item of b.items)list.append(el('li','',item));content.append(list);
      }
      if(b.kind==='note'||b.kind==='example'){const box=el('div','preview-'+b.kind);box.append(el('strong','',b.kind==='note'?'À retenir':'Exemple'),el('p','',b.text));content.append(box);}
      if(b.kind==='check'){
        const box=el('div','preview-question');box.append(el('strong','','Je vérifie que j’ai compris'),el('p','',b.question));
        const details=el('details');details.append(el('summary','','Afficher la réponse'),el('p','',b.answer));box.append(details);content.append(box);
      }
      if(b.kind==='image'){
        const figure=el('figure','preview-figure');const img=el('img','preview-image');img.alt=b.alt;img.src=b.src;img.loading='lazy';figure.append(img);if(b.caption)figure.append(el('figcaption','',b.caption));content.append(figure);
      }
    }
    if(r.documents.length){content.append(el('h2','','Documents complémentaires'));const box=el('div','preview-documents');for(const d of r.documents){const a=el('a','',d.title);a.href=d.url;a.target='_blank';a.rel='noopener noreferrer';box.append(a);}content.append(box);}
    $('previewDialog').showModal();
  }
  function download(filename,content,type){
    const blob=new Blob([content],{type});const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  function exportBackup(){
    const payload={format:'mes-ressources-enseignant',version:1,exportedAt:new Date().toISOString(),resources:library};
    const date=new Date().toISOString().slice(0,10);download(`sauvegarde-ulis-${date}.json`,JSON.stringify(payload,null,2),'application/json;charset=utf-8');notify('Sauvegarde demandée. Conservez le fichier dans un espace approprié.');
  }
  function exportStudent(){
    const published=library.filter(r=>r.status==='ready').map(r=>{
      const {status,...student}=r;return student;
    });
    const script='// Bibliothèque de cours et de méthodes ULIS — export enseignant.\n// Ne pas y placer de données personnelles.\nwindow.ULIS_RESOURCES = '+JSON.stringify(published,null,2)+';\n';
    download('content.js',script,'text/javascript;charset=utf-8');
    notify(LIVE?`Export de secours téléchargé (${published.length} fiches). La publication en ligne est déjà automatique.`:`Export local de ${published.length} fiches : sans serveur, le remplacement du fichier reste manuel.`);
  }
  async function importBackup(){
    const file=$('importFile').files?.[0];if(!file){notify('Choisissez d’abord un fichier JSON de sauvegarde.',true);return;}
    if(file.size>5*1024*1024){notify('Fichier trop volumineux (limite : 5 Mo).',true);return;}
    try{
      const obj=JSON.parse(await file.text());
      if(obj.format!=='mes-ressources-enseignant'||obj.version!==1||!Array.isArray(obj.resources))throw Error('Fichier non reconnu.');
      const items=validateCollection(obj.resources);
      if(LIVE){
        if(items.length>300)throw Error('Import en ligne limité à 300 fiches par opération.');
        const drafts=items.map(r=>({...r,id:createId(),status:'draft'}));
        confirmAction('Importer en brouillons ?',`${drafts.length} fiches vont être AJOUTÉES comme brouillons, sans remplacer les fiches existantes.`,async()=>{
          try{await CLOUD.upsertMany(drafts);library=validateCollection(await CLOUD.all());renderLibrary();showView('library');$('importFile').value='';notify('Import terminé : fiches invisibles aux élèves jusqu’à leur publication.');}
          catch(err){notify('Import impossible : '+errorMessage(err),true);}
        });
      }else{
        confirmAction('Restaurer la sauvegarde locale ?',`La bibliothèque de démonstration sera remplacée par ${items.length} fiches.`,()=>{
          if(persist(items)){renderLibrary();showView('library');notify('Bibliothèque locale restaurée.');$('importFile').value='';}
        });
      }
    }catch(err){notify('Import refusé : '+errorMessage(err),true);}
  }
  async function presentTeacher(){
    $('authScreen').hidden=true;
    $('teacherWorkspace').hidden=false;
    $('btnSignOut').hidden=false;
    authenticated=true;
    await reloadCloud(true);
    unsubscribe?.();
    try{unsubscribe=CLOUD.watch(()=>{if(!dirty)void reloadCloud(true);},status=>{
      if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')$('cloudBanner').textContent='Reconnexion en temps réel en cours ; vérification périodique active.';
    });}catch(err){notify('Notifications instantanées indisponibles : vérification périodique active.',true);}
  }
  async function showAuth(){
    authenticated=false;
    $('teacherWorkspace').hidden=true;
    $('authScreen').hidden=false;
    $('authPassword').value='';
    $('authEmail').focus();
  }
  async function beginRemote(){
    if(!LIVE){
      $('cloudBanner').textContent='MODE DÉMONSTRATION LOCALE — vos modifications ne sont PAS partagées avec les élèves. Configurez config.js et la base Supabase pour activer la publication permanente.';
      return;
    }
    await showAuth();
    $('authMessage').textContent='Vérification de la connexion…';
    try{
      if(await CLOUD.session()) {
        if(await CLOUD.isTeacher()){await presentTeacher();}
        else await CLOUD.signOut();
      }
      if(!authenticated)$('authMessage').textContent='Connectez-vous avec votre compte enseignant autorisé.';
    }catch(err){$('authMessage').textContent='Connexion au serveur impossible : '+errorMessage(err);}
    window.setInterval(()=>{if(authenticated&&!document.hidden&&!dirty)void reloadCloud(true);},30000);
    window.addEventListener('focus',()=>{if(authenticated&&!dirty)void reloadCloud(true);});
  }
  async function logIn(event){
    event.preventDefault();
    const button=$('authSubmit');button.disabled=true;
    $('authMessage').textContent='Vérification en cours…';
    try{
      await CLOUD.signIn($('authEmail').value.trim(),$('authPassword').value);
      if(!await CLOUD.isTeacher()){
        await CLOUD.signOut();throw Error('Ce compte n’est pas autorisé à administrer les contenus.');
      }
      await presentTeacher();
    }catch(err){$('authMessage').textContent='Connexion refusée : '+errorMessage(err);}
    finally{button.disabled=false;}
  }
  async function logOut(){
    if(!canLeave())return;
    try{unsubscribe?.();unsubscribe=null;await CLOUD.signOut();library=[];dirty=false;await showAuth();}
    catch(err){notify('Déconnexion impossible : '+errorMessage(err),true);}
  }
  function init(){
    for(const b of document.querySelectorAll('.nav-link'))b.addEventListener('click',()=>navigate(b.dataset.view));
    $('newTop').addEventListener('click',()=>navigate('editor'));
    $('backList').addEventListener('click',()=>navigate('library'));
    $('cancelEdit').addEventListener('click',()=>navigate('library'));
    $('resourceForm').addEventListener('submit',save);
    $('resourceForm').addEventListener('input',()=>{dirty=true;});$('resourceForm').addEventListener('change',()=>{dirty=true;});
    $('addBlock').addEventListener('click',appendBlock);
    $('addDocument').addEventListener('click',()=>{const d=readDocuments();d.push({title:'',url:''});renderDocuments(d);dirty=true;});
    $('previewResource').addEventListener('click',showPreview);
    $('closePreview').addEventListener('click',()=>$('previewDialog').close());
    $('backupBtn').addEventListener('click',exportBackup);
    $('publishBtn').addEventListener('click',exportStudent);
    $('importBtn').addEventListener('click',importBackup);
    $('restoreDefaults').addEventListener('click',()=>confirmAction(LIVE?'Importer les exemples en brouillons ?':'Restaurer les exemples ?',LIVE?`Ajouter ${BASE.length} fiches de démonstration EN BROUILLONS, sans effacer les cours existants ?`:'Remplacer la bibliothèque locale par les exemples ?',async()=>{
      try {await importExamples();}catch(err){notify('Import des exemples impossible : '+errorMessage(err),true);}
    }));
    for(const id of ['filterSearch','filterLevel','filterSubject','filterStatus'])$(id).addEventListener(id==='filterSearch'?'input':'change',renderLibrary);
    $('resetFilters').addEventListener('click',()=>{for(const id of ['filterSearch','filterLevel','filterSubject','filterStatus'])$(id).value='';renderLibrary();});
    $('confirmCancel').addEventListener('click',()=>$('confirmDialog').close());
    $('confirmOk').addEventListener('click',()=>{const fn=currentConfirmation;currentConfirmation=null;$('confirmDialog').close();if(fn)fn();});
    window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
    $('authForm').addEventListener('submit',logIn);
    $('btnSignOut').addEventListener('click',logOut);
    renderLibrary();
    void beginRemote();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
