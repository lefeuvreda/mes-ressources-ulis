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
  window.ULIS_CLOUD={configured,client,published,all,upsert,upsertMany,remove,signIn,session,isTeacher,signOut,watch};
})();
