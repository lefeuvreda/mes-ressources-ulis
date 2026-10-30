# Mise en ligne des deux espaces – ULIS TSLA

## Résultat attendu

Le **même dépôt GitHub Pages** héberge deux pages :

- **Élèves** : `https://VOTRE_COMPTE.github.io/mes-ressources-ulis/`
- **Enseignant** : `https://VOTRE_COMPTE.github.io/mes-ressources-ulis/enseignant.html`

`VOTRE_COMPTE` = nom du compte GitHub. Les liens ci-dessus ne sont **pas actifs** tant que le dépôt n'a pas été créé et publié.

**Important** : GitHub Pages ne stocke pas les modifications de cours. **Supabase est obligatoire** pour publier une modification depuis la page enseignant vers tous les élèves. Aucun compte élève n'est nécessaire.

## Étape A – Base Supabase (à effectuer une seule fois)

1. Créer un projet sur <https://supabase.com/dashboard>.
2. Ouvrir **SQL Editor** ; créer une nouvelle requête, coller **l'intégralité** de `schema_supabase.sql` puis exécuter. Le script crée la table `resources`, les contrôles RLS et le compteur de synchronisation.
3. Dans **Authentication > Users**, créer le compte professeur. Utiliser une adresse professionnelle autorisée et un mot de passe robuste.
4. Copier le **User UID (UUID)** du compte créé dans Authentication.
5. Dans SQL Editor, exécuter en remplaçant uniquement la valeur UUID :

   ```sql
   insert into public.teacher_accounts(user_id)
   values ('VOTRE_UUID_SUPABASE')
   on conflict (user_id) do nothing;
   ```

6. Dans **Project Settings > API Keys** (ou **API** selon l'interface), récupérer l'URL du projet et la clé **publishable** publique. La clé `anon` historique est également possible.
7. Modifier le fichier `config.js` avant de déposer les fichiers sur GitHub :

   ```javascript
   window.ULIS_CONFIG = {
     supabaseUrl: 'https://VOTRE-PROJET.supabase.co',
     supabasePublishableKey: 'sb_publishable_VOTRE_CLE_PUBLIQUE'
   };
   ```

   **Ne jamais mettre dans GitHub** la clé `sb_secret_...`, `service_role`, un mot de passe ou un document confidentiel.

## Étape B – GitHub Pages

1. Sur <https://github.com/new>, créer un dépôt public appelé **`mes-ressources-ulis`** (ou modifier le nom dans les deux URL d'exemple).
2. Extraire cette archive ZIP sur votre ordinateur.
3. Dans le dépôt GitHub, choisir **Add file > Upload files**, puis déposer **le contenu du dossier** `mes-ressources-ulis-github`, pas le dossier lui-même. Les fichiers `index.html`, `enseignant.html` et `config.js` doivent se trouver **à la racine** du dépôt. Importer également le sous-dossier `icons` avec ses deux images.
4. Valider par **Commit changes**.
5. Ouvrir **Settings > Pages** ; choisir **Deploy from a branch**, branche `main`, dossier `/(root)` ; cliquer sur **Save**.
6. Une fois la publication achevée, ouvrir les deux liens indiqués en tête de ce guide, en remplaçant `VOTRE_COMPTE` par le compte GitHub et, si besoin, `mes-ressources-ulis` par le nom du dépôt.

## Étape C – Premier cours et synchronisation

1. Ouvrir `.../enseignant.html` et se connecter. Si aucune connexion n'est demandée, **Supabase n'est pas configuré**, et les modifications ne seront pas partagées.
2. Dans **Sauvegarder et diffuser > Importer les exemples**, ajouter les 29 fiches fournies (elles arrivent en **brouillons**, invisibles aux élèves).
3. Depuis **Bibliothèque**, cliquer **Modifier** sur une fiche, sélectionner **Publié**, puis **Enregistrer la fiche**.
4. Ouvrir l'URL élèves sur une autre tablette/ordinateur (mode navigation privée recommandé pour le test). Sélectionner le niveau correspondant. La fiche doit apparaître.
5. Changer une phrase dans l'administration puis enregistrer. Tant que l'élève est connecté à Internet et la page ouverte, la fiche est mise à jour à la notification ou lors de la vérification périodique (20 secondes si la page est visible).
6. Repasser la fiche en brouillon et enregistrer ; vérifier qu'elle disparaît de la bibliothèque élève. Une tablette **hors connexion** peut conserver temporairement une ancienne copie : aucun document confidentiel ne doit être publié.

## En cas de problème

- **« Démonstration locale »** : le projet Supabase manque dans `config.js`, ou les valeurs sont invalides.
- **Connexion enseignant refusée** : contrôler le compte dans **Authentication > Users** et son UUID dans `teacher_accounts`.
- **Aucune fiche dans l'espace élève** : une fiche en état `Brouillon` n'est pas visible ; vérifier aussi le niveau sélectionné.
- **« Synchronisation indisponible »** : vérifier l'URL/la clé publique, le script SQL et l'accès réseau à Supabase. Regarder la console du navigateur pour les erreurs précises.
- **404 ou page absente** : vérifier que `index.html` et `enseignant.html` sont à la racine du dépôt, et que GitHub Pages est activé.
- **Mise à jour différée** : une tablette en veille ou hors ligne se synchronise à sa reconnexion. Sur un onglet visible, la vérification de secours a lieu toutes les 20 secondes.

## Précautions institutionnelles

Le site élève et toutes les fiches en état `Publié` sont publics : **ne pas saisir de noms d'élèves, PPS, diagnostics ou informations personnelles**. L'URL enseignant n'est pas un secret, mais les opérations de modification et suppression exigent un compte autorisé, contrôlé par les règles RLS côté serveur. Avant d'utiliser le service dans l'établissement, faire vérifier le choix du service cloud, les conditions de diffusion et les droits des supports.

Documentation : <https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site> ; <https://supabase.com/docs/guides/database/postgres/row-level-security>.
