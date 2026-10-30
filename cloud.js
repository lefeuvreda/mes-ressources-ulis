/* Accès partagé élève/enseignant. Le serveur applique les droits via RLS. */
(() => {
  'use strict';
  const cfg = window.ULIS_CONFIG || {};
  function configured() {
    try {
      const url = new URL(cfg.supabaseUrl);
      const key = cfg.supabasePublishableKey;
      // La clé secrète ne doit jamais être exposée sur GitHub Pages.
      return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co')
        && url.username === '' && url.password === ''
        && typeof key === 'string' && key.trim().length > 16
        && !/^sb_secret_/i.test(key.trim());
    } catch { return false; }
  }
  let instance;
  function client() {
    if (!configured()) throw new Error('Renseignez config.js avec les identifiants publics de votre projet Supabase.');
    if (!window.supabase?.createClient) throw new Error('La bibliothèque de synchronisation Supabase est inaccessible. Vérifiez la connexion internet.');
    if (!instance) instance = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
    });
    return instance;
  }
  const unwrap = rows => (rows || []).map(r => ({...r.payload, id:r.id, status:r.status}));
  function assertOk(result) { if (result.error) throw result.error; return result.data; }
  async function published() {
    const data = assertOk(await client().from('resources').select('id,status,payload').eq('status','ready').order('id'));
    return unwrap(data);
  }
  async function all() {
    const data = assertOk(await client().from('resources').select('id,status,payload').order('id'));
    return unwrap(data);
  }
  function toRow(resource) {
    const {status, ...payload} = resource;
    return {id:String(resource.id),status:status==='ready'?'ready':'draft',payload};
  }
  async function upsert(resource) {
    assertOk(await client().from('resources').upsert(toRow(resource),{onConflict:'id'}));
  }
  async function upsertMany(resources) {
    for(let i=0;i<resources.length;i+=75) {
      const batch=resources.slice(i,i+75).map(toRow);
      assertOk(await client().from('resources').upsert(batch,{onConflict:'id'}));
    }
  }
  async function remove(id) {
    assertOk(await client().from('resources').delete().eq('id',id));
  }
  async function signIn(email, password) {
    assertOk(await client().auth.signInWithPassword({email,password}));
  }
  async function session() {
    const result=await client().auth.getSession();
    return assertOk(result)?.session || null;
  }
  async function isTeacher() {
    return assertOk(await client().rpc('is_teacher'))===true;
  }
  async function signOut() { assertOk(await client().auth.signOut()); }
  /* Notifications sans exposition du contenu des brouillons. Toutes les suppressions
     ou dépublications passent aussi par ce signal de révision. */
  function watch(onChange, onStatus) {
    const channel=client().channel('ulis-library-revision')
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'library_revision',filter:'id=eq.1'},onChange)
      .subscribe(status=>{if(onStatus)onStatus(status);});
    return () => client().removeChannel(channel);
  }
  /* Médiathèque publique : seuls les comptes enseignants autorisés ont des
     permissions d'écriture et de liste. Les URL publiques ne sont PAS privées. */
  const MEDIA_BUCKET = 'ulis-public-media';
  const MIME_TYPES = Object.freeze({
    pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
    gif:'image/gif',webp:'image/webp',mp3:'audio/mpeg',ogg:'audio/ogg',
    mp4:'video/mp4',webm:'video/webm'
  });
  const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
  function mediaExtension(name) { return String(name).split('.').pop().toLowerCase(); }
  function checkMedia(file) {
    if (!file || typeof file.name !== 'string') throw Error('Fichier invalide.');
    const ext=mediaExtension(file.name), expected=MIME_TYPES[ext];
    if (!expected) throw Error(`Format non autorisé : ${file.name}. Utilisez PDF, GIF, PNG, JPG, WebP, MP3, OGG, MP4 ou WebM.`);
    if (!file.size || file.size > MAX_MEDIA_BYTES) throw Error(`Fichier ${file.name} : taille maximale de 20 Mo.`);
    if (file.type && file.type !== expected && !(ext==='jpg' && file.type==='image/jpg')) {
      throw Error(`Le type du fichier ${file.name} ne correspond pas à son extension.`);
    }
    return expected;
  }
  function mediaSafeName(name) {
    const trimmed=String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^[-.]+/,'').slice(-90);
    return trimmed || 'media';
  }
  async function uploadMedia(file) {
    const contentType=checkMedia(file);
    const id=crypto.randomUUID();
    const path=`uploads/${id}-${mediaSafeName(file.name)}`;
    assertOk(await client().storage.from(MEDIA_BUCKET).upload(path,file,{
      cacheControl:'3600',upsert:false,contentType
    }));
    return {path,url:publicMediaUrl(path),name:file.name,size:file.size};
  }
  function publicMediaUrl(path) {
    return client().storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  }
  async function listMedia() {
    const records=[];
    for(let offset=0;offset<1000;offset+=100) {
      const batch=assertOk(await client().storage.from(MEDIA_BUCKET).list('uploads',{
        limit:100,offset,sortBy:{column:'created_at',order:'desc'}
      }))||[];
      records.push(...batch.filter(x=>x.name && x.id));
      if(batch.length<100)break;
    }
    return records.map(x=>({
      path:'uploads/'+x.name,
      url:publicMediaUrl('uploads/'+x.name),
      name:x.name.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,''),
      size:x.metadata?.size||0, createdAt:x.created_at||'',
      type:(x.metadata?.mimetype||MIME_TYPES[mediaExtension(x.name)]||'')
    }));
  }
  async function deleteMedia(path) {
    if(typeof path!=='string'||!/^uploads\/[0-9a-f-]{36}-[a-z0-9._-]+$/i.test(path) || !MIME_TYPES[mediaExtension(path)])
      throw Error('Chemin du fichier invalide.');
    assertOk(await client().storage.from(MEDIA_BUCKET).remove([path]));
  }
  window.ULIS_CLOUD={configured,client,published,all,upsert,upsertMany,remove,signIn,session,isTeacher,signOut,watch,
    MEDIA_BUCKET,MIME_TYPES,MAX_MEDIA_BYTES,checkMedia,uploadMedia,publicMediaUrl,listMedia,deleteMedia};
})();
