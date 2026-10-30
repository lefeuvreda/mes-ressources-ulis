(() => {
  'use strict';
  const CLOUD = window.ULIS_CLOUD;
  const LIVE = !!CLOUD?.configured();
  const CACHE_KEY = 'mr-published-remote-v1';
  function savedRemote() { try { const a=JSON.parse(localStorage.getItem(CACHE_KEY)); return Array.isArray(a)?a:[]; } catch { return []; } }
  let RESOURCES = LIVE ? savedRemote() : (Array.isArray(window.ULIS_RESOURCES) ? window.ULIS_RESOURCES : []);
  let lastRemoteJSON = LIVE ? JSON.stringify(RESOURCES) : null;
  let refreshing = false;
  let refreshQueued = false;
  const grades = ['6e','5e','4e','3e'];
  const subjects = [
    ['Toutes les ressources','TO'],['Français','FR'],['Mathématiques','MA'],['Histoire-Géo','HG'],['Sciences','SC'],['Anglais','EN'],['Méthodes','ME'],['Mes favoris','★']
  ];
  const kinds = {cours:'Cours',methode:'Fiche méthode',outil:'Outil'};
  const store = {
    get(key,def) { try { const val=JSON.parse(localStorage.getItem('mr-'+key)); return val===null ? def : val; } catch { return def; } },
    set(key,value) { try { localStorage.setItem('mr-'+key,JSON.stringify(value)); } catch {} }
  };
  const state = {
    grade: grades.includes(store.get('grade','5e'))? store.get('grade','5e'):'5e',
    subject:'Toutes les ressources', kind:'all', search:'',
    favorites: Array.isArray(store.get('favorites',[])) ? store.get('favorites',[]) : [],
    fontSize: Number(store.get('fontSize',18)) || 18,
    spacing: Boolean(store.get('spacing',false)), comfort:Boolean(store.get('comfort',false)),
    current:null, previous:'browse'
  };
  const byId = id => document.getElementById(id);
  const node = (tag, cls, content) => { const e=document.createElement(tag); if(cls)e.className=cls; if(content!==undefined)e.textContent=String(content); return e; };
  const isFav = id => state.favorites.includes(id);
  const toggleFav = id => {
    state.favorites = isFav(id) ? state.favorites.filter(x=>x!==id) : [...state.favorites,id];
    store.set('favorites',state.favorites);
    renderCards();
    if(state.current===id) updateReaderFavorite();
  };
  function updateNetwork(){
    if(!LIVE) byId('networkStatus').textContent='Démonstration locale · sans synchronisation';
    else if(!navigator.onLine) byId('networkStatus').textContent='Hors connexion · fiches conservées';
    else byId('networkStatus').textContent='Connexion en cours…';
  }
  function status(message) { byId('networkStatus').textContent=message; }
  async function refreshCloud() {
    if (!LIVE || !navigator.onLine) { updateNetwork(); return; }
    if (refreshing) { refreshQueued=true; return; }
    refreshing=true;
    try {
      const rows=await CLOUD.published();
      const signature=JSON.stringify(rows);
      if(signature!==lastRemoteJSON) {
        RESOURCES=rows;lastRemoteJSON=signature;
        try { localStorage.setItem(CACHE_KEY,signature); }catch{}
        renderCards();
        if(state.current && !RESOURCES.some(r=>r.id===state.current)){
          showBrowse();status('Bibliothèque actualisée · fiche retirée');
        }else if(state.current && !byId('readView').hidden) {
          // Une fiche ouverte est rafraîchie si son contenu a changé.
          const top=window.scrollY;showReader(state.current);window.scrollTo(0,top);
        }
      }
      status('Fiches à jour · synchronisation active');
    } catch(err) {
      status('Synchronisation indisponible · dernière version enregistrée');
      console.warn('Synchronisation des ressources :',err.message);
    } finally {
      refreshing=false;
      if(refreshQueued){refreshQueued=false;void refreshCloud();}
    }
  }
  function activateCloud() {
    if(!LIVE) return;
    status(RESOURCES.length?'Dernière version sauvegardée · actualisation…':'Chargement des fiches…');
    void refreshCloud();
    try { CLOUD.watch(()=>void refreshCloud(), s=>{if(s==='CHANNEL_ERROR'||s==='TIMED_OUT')status('Reconnexion en cours…');}); }
    catch(err) {status('Connexion indisponible · dernière version enregistrée');}
    // Secours contre coupures des websockets, verrouillage ou retour d'une tablette en veille.
    window.setInterval(()=>{if(!document.hidden)void refreshCloud();},20000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCloud();});
    window.addEventListener('focus',()=>void refreshCloud());
  }
  function init(){
    byId('searchInput').addEventListener('input',e=>{state.search=e.target.value.trim().toLocaleLowerCase('fr');renderCards();});
    byId('typeFilter').addEventListener('change',e=>{state.kind=e.target.value;renderCards();});
    byId('btnBack').addEventListener('click',showBrowse);
    byId('btnHelp').addEventListener('click',()=>showView('help'));
    byId('btnHelpBack').addEventListener('click',()=>showView(state.previous==='read'?'read':'browse'));
    byId('btnSmaller').addEventListener('click',()=>{state.fontSize=Math.max(16,state.fontSize-2);setReadingPrefs();});
    byId('btnLarger').addEventListener('click',()=>{state.fontSize=Math.min(28,state.fontSize+2);setReadingPrefs();});
    byId('btnSpacing').addEventListener('click',()=>{state.spacing=!state.spacing;setReadingPrefs();});
    byId('btnComfort').addEventListener('click',()=>{state.comfort=!state.comfort;setReadingPrefs();});
    byId('btnRead').addEventListener('click',toggleSpeech);
    byId('btnFavoriteRead').addEventListener('click',()=>{if(state.current)toggleFav(state.current)});
    byId('closeImageDialog').addEventListener('click',()=>byId('imageDialog').close());
    byId('imageDialog').addEventListener('click',event=>{
      if(event.target===byId('imageDialog'))byId('imageDialog').close();
    });
    window.addEventListener('online',()=>{updateNetwork();void refreshCloud();});window.addEventListener('offline',updateNetwork);
    updateNetwork();renderGrades();renderSubjects();renderCards();setReadingPrefs();activateCloud();
    if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }
  function renderGrades(){
    const wrap=byId('gradeTabs');wrap.replaceChildren();
    for(const grade of grades){
      const b=node('button','',grade); b.type='button';b.setAttribute('aria-pressed',String(state.grade===grade));
      b.addEventListener('click',()=>{state.grade=grade;store.set('grade',grade);renderGrades();renderCards();});wrap.append(b);
    }
  }
  function renderSubjects(){
    const wrap=byId('subjectButtons');wrap.replaceChildren();
    for(const [subject,code] of subjects){
      const b=node('button','subject-button');b.type='button';b.setAttribute('aria-pressed',String(subject===state.subject));
      b.append(node('span','subject-code',code),node('span','',subject));
      b.addEventListener('click',()=>{state.subject=subject;renderSubjects();renderCards();});wrap.append(b);
    }
  }
  function matches(resource){
    return (resource.level===state.grade || resource.level==='Tous')
      && (state.subject==='Toutes les ressources' || state.subject==='Mes favoris' || resource.subject===state.subject)
      && (state.subject!=='Mes favoris' || isFav(resource.id))
      && (state.kind==='all' || resource.kind===state.kind)
      && [resource.title,resource.summary,resource.subject,resource.keywords||''].join(' ').toLocaleLowerCase('fr').includes(state.search);
  }
  function renderCards(){
    const filtered=RESOURCES.filter(matches);
    const wrap=byId('resourceGrid');wrap.replaceChildren();
    byId('sectionTitle').textContent=state.subject==='Toutes les ressources'?'Toutes les ressources':state.subject;
    byId('sectionEyebrow').textContent=`RESSOURCES · ${state.grade.toUpperCase()}`;
    byId('resultCount').textContent=`${filtered.length} fiche${filtered.length!==1?'s':''}`;
    byId('emptyMessage').hidden=filtered.length>0;
    for(const r of filtered){
      const card=node('article','resource-card');const top=node('div','card-top');
      top.append(node('span','card-subject',r.subject),node('span','card-type',kinds[r.kind]||r.kind));
      card.append(top,node('h3','',r.title),node('p','',r.summary));
      const bottom=node('div','card-bottom');const open=node('button','open-resource','Ouvrir la fiche →');
      open.type='button';open.setAttribute('aria-label',`Ouvrir : ${r.title}`);open.addEventListener('click',()=>showReader(r.id));
      const star=node('button','star-button',isFav(r.id)?'★':'☆');star.type='button';star.setAttribute('aria-pressed',String(isFav(r.id)));
      star.title=isFav(r.id)?'Retirer des favoris':'Ajouter aux favoris';star.setAttribute('aria-label',`${star.title} : ${r.title}`);star.addEventListener('click',()=>toggleFav(r.id));
      bottom.append(open,star);card.append(bottom);wrap.append(card);
    }
  }
  function showView(view){
    if(view==='help') state.previous=byId('readView').hidden?'browse':'read';
    const views={browse:'browseView',read:'readView',help:'helpView'};
    for(const [key,id] of Object.entries(views)) byId(id).hidden=key!==view;
    if(view!=='read')stopSpeech();
    window.scrollTo({top:0,behavior:'instant'});
    byId('main').focus({preventScroll:true});
  }
  function showBrowse(){showView('browse');}
  function showReader(id){
    const r=RESOURCES.find(x=>x.id===id);if(!r)return;
    state.current=id;stopSpeech();
    byId('readMeta').textContent=`${r.level==='Tous'?'Tous niveaux':r.level} · ${r.subject} · ${kinds[r.kind]}`;
    byId('readTitle').textContent=r.title;byId('readSummary').textContent=r.summary;
    const body=byId('articleBody');body.replaceChildren();
    for(const block of r.blocks){
      if(block.kind==='text'){
        body.append(node('h2','',block.title),node('p','',block.text));
      } else if(block.kind==='steps'||block.kind==='bullets'){
        body.append(node('h2','',block.title));const list=node(block.kind==='steps'?'ol':'ul');
        for(const line of block.items)list.append(node('li','',line));body.append(list);
      } else if(block.kind==='note'||block.kind==='example'){
        const box=node('div',block.kind);box.append(node('strong','',block.kind==='note'?'À retenir':'Exemple'),node('div','',block.text));body.append(box);
      } else if(block.kind==='image' && typeof block.src==='string'){
        const safe=allowedDocumentUrl(block.src);
        if(safe)body.append(inlineImage(safe,block.alt||'Illustration pédagogique',block.caption||''));
      } else if(block.kind==='check'){
        const box=node('section','check');box.append(node('h2','','Je vérifie que j’ai compris'),node('p','',block.question));
        const btn=node('button','','Afficher la réponse');btn.type='button';
        const answer=node('p','answer',block.answer);answer.hidden=true;
        btn.addEventListener('click',()=>{answer.hidden=!answer.hidden;btn.textContent=answer.hidden?'Afficher la réponse':'Masquer la réponse';});
        box.append(btn,answer);body.append(box);
      }
    }
    if(Array.isArray(r.documents) && r.documents.length){
      const content=node('section','supplementary-media');
      const list=node('ul','document-list');
      for(const doc of r.documents){
        const url=allowedDocumentUrl(doc.url);
        if(!url)continue;
        if(isImageUrl(url)){
          // Les images jointes par « Importer et joindre à la fiche »
          // apparaissent directement dans la fiche, GIF animés compris.
          content.append(inlineImage(url,doc.title||'Illustration pédagogique',doc.title||''));
        }else{
          const li=node('li');const link=node('a','',doc.title||'Ouvrir un document');
          link.href=url;link.target='_blank';link.rel='noopener noreferrer';li.append(link);list.append(li);
        }
      }
      if(content.children.length||list.children.length){
        body.append(node('h2','','Documents et images complémentaires'));
        if(content.children.length)body.append(content);
        if(list.children.length)body.append(list);
      }
    }
    updateReaderFavorite();setReadingPrefs();showView('read');
  }
  function allowedDocumentUrl(value){
    if(typeof value!=='string'||!value.trim())return null;
    try{const url=new URL(value,document.baseURI);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}
  }
  function isImageUrl(value){
    try{return /\.(?:png|jpe?g|webp|gif)$/i.test(new URL(value,document.baseURI).pathname);}catch{return false;}
  }
  function inlineImage(src,alt,caption){
    const figure=node('figure','figure inline-media');
    const img=node('img','inline-media-image');
    img.src=src;img.alt=alt;img.loading='lazy';img.decoding='async';
    const controls=node('div','inline-media-controls');
    const enlarge=node('button','image-enlarge','Agrandir l’image');
    enlarge.type='button';
    enlarge.addEventListener('click',()=>{
      const dialog=byId('imageDialog');
      const large=byId('imageDialogPicture');
      large.src=src;large.alt=alt;
      byId('imageDialogCaption').textContent=caption||alt;
      dialog.showModal();
    });
    img.addEventListener('error',()=>{img.hidden=true;enlarge.hidden=true;figure.append(node('p','media-error','Cette image n’est pas disponible.'));});
    controls.append(enlarge);
    figure.append(img);
    if(caption)figure.append(node('figcaption','',caption));
    figure.append(controls);
    return figure;
  }
  function updateReaderFavorite(){
    const is=isFav(state.current);const b=byId('btnFavoriteRead');b.textContent=is?'★ Dans mes favoris':'☆ Ajouter aux favoris';b.setAttribute('aria-pressed',String(is));
  }
  function setReadingPrefs(){
    byId('article').style.setProperty('--text-size',state.fontSize+'px');
    byId('article').classList.toggle('wide-lines',state.spacing);byId('article').classList.toggle('comfort',state.comfort);
    byId('btnSpacing').setAttribute('aria-pressed',String(state.spacing));byId('btnComfort').setAttribute('aria-pressed',String(state.comfort));
    store.set('fontSize',state.fontSize);store.set('spacing',state.spacing);store.set('comfort',state.comfort);
  }
  let speaking=false;
  function stopSpeech(){
    if('speechSynthesis' in window)window.speechSynthesis.cancel();speaking=false;byId('btnRead').textContent='▶ Écouter';
  }
  function toggleSpeech(){
    if(!('speechSynthesis' in window)){byId('btnRead').textContent='Lecture indisponible';return;}
    if(speaking){stopSpeech();return;}
    const r=RESOURCES.find(x=>x.id===state.current);if(!r)return;
    const txt=[r.title,r.summary,...r.blocks.flatMap(b=>[b.title||'',b.text||'',...(b.items||[]),b.question||'',b.answer||''])].join('. ');
    const utter=new SpeechSynthesisUtterance(txt);utter.lang='fr-FR';utter.rate=.9;
    utter.onend=()=>{speaking=false;byId('btnRead').textContent='▶ Écouter';};
    utter.onerror=()=>{speaking=false;byId('btnRead').textContent='▶ Écouter';};
    window.speechSynthesis.cancel();window.speechSynthesis.speak(utter);speaking=true;byId('btnRead').textContent='■ Arrêter';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
