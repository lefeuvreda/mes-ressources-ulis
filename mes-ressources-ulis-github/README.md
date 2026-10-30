> **DÉMARRAGE RAPIDE : consultez [GUIDE_MISE_EN_LIGNE.md](GUIDE_MISE_EN_LIGNE.md) pour créer les deux liens GitHub Pages et activer Supabase.**

# Mes ressources ULIS TSLA — V3 synchronisée

Application web pour tablettes, comprenant :
- `index.html` : espace élève, consultation sans compte, niveaux 6e à 3e, outils de lecture et favoris locaux ;
- `enseignant.html` : édition des fiches, brouillons, publication, sauvegardes et compte professeur ;
- Supabase : stockage **durable** des contenus et notification de changements **en temps réel** ;
- un contrôle de secours toutes les 20 secondes dans l'espace élève, et au retour de veille/connexion.

**Important : cette archive contient l'application, pas un service Supabase déjà provisionné.** Sans projet Supabase et sans configuration, l'application fonctionne en **démonstration locale**, sans partage entre appareils. Pour la synchronisation, suivre la procédure ci-dessous.

## 1. Créer le service de données (une seule fois)

1. Ouvrir https://supabase.com/dashboard et créer un projet Supabase pour l'application (faire valider le prestataire/hébergement par l'établissement si nécessaire).
2. Ouvrir **SQL Editor**, coller et exécuter le contenu de `schema_supabase.sql`. Le SQL crée les tables `resources`, `library_revision`, la fonction d'autorisation et les règles de sécurité RLS.
3. Ouvrir **Authentication → Users** et créer le compte de l'enseignant, avec une adresse électronique et un mot de passe robuste (par exemple via « Add user »). Éviter d'activer les inscriptions publiques si elles ne sont pas nécessaires. Une confirmation mail peut être requise selon les paramètres d'authentification.
4. Copier l'UUID de l'utilisateur créé. Dans **SQL Editor**, exécuter cette commande en remplaçant l'UUID :

```sql
insert into public.teacher_accounts(user_id)
values ('UUID_DU_COMPTE_PROFESSEUR')
on conflict (user_id) do nothing;
```

Cette liste d'autorisation est appliquée **sur le serveur**. Un simple utilisateur Auth non inscrit dans la table ne peut pas créer, modifier ou supprimer des cours, ni lire les brouillons.

## 2. Connecter l'application

Dans Supabase : **Project Settings → API / API Keys** (noms selon version), récupérer :
- l'URL du projet, sous la forme `https://xxxx.supabase.co` ;
- la **clé publique / publishable** `sb_publishable_...` (ou l'ancienne clé `anon`).

Modifier `config.js` :

```javascript
window.ULIS_CONFIG = {
  supabaseUrl: 'https://VOTRE-PROJET.supabase.co',
  supabasePublishableKey: 'sb_publishable_VOTRE_CLE_PUBLIQUE'
};
```

**N'insérez JAMAIS** une clé `service_role`, `sb_secret_...`, le mot de passe du professeur ou des identifiants d'élèves dans `config.js`, GitHub ou le HTML. La clé publique peut être visible dans le navigateur ; les règles RLS interdisent les écritures non autorisées.

## 3. Héberger et tester

Vous pouvez utiliser GitHub Pages ou un autre hébergement HTTPS approuvé :

1. Placer les fichiers du dossier à la racine d'un dépôt sans informations personnelles d'élèves.
2. Activer GitHub Pages : Settings → Pages → Deploy from a branch → `main` / `(root)`.
3. Ouvrir `https://.../enseignant.html`, se connecter avec le compte enseignant autorisé.
4. Aller dans **Sauvegarder et diffuser → Importer les exemples**, si vous souhaitez ajouter les 29 exemples en **brouillons**. Les exemples ne sont pas publiés automatiquement.
5. Créer ou modifier une fiche, choisir l'état **Publié** puis cliquer sur **Enregistrer la fiche**.
6. Ouvrir `https://.../index.html` sur une seconde tablette : la fiche est visible selon son niveau, sa discipline et son type.
7. Garder la page élève ouverte ; modifier le cours depuis l'espace enseignant, puis enregistrer. La tablette connectée doit se mettre à jour automatiquement par Realtime. Si le canal se déconnecte, elle vérifie toutes les **20 secondes lorsque la page est visible**, ainsi qu'au retour de veille/connexion.
8. Repasser la fiche en **Brouillon** ou la supprimer pour vérifier sa disparition sur l'espace élève à la prochaine synchronisation.

Dans une installation connectée, il n'est **pas nécessaire de remplacer `content.js`** à chaque cours. Ce fichier est uniquement un jeu de données de démonstration/une option d'export de secours. Supabase contient la bibliothèque utilisée par les élèves.

## 4. Mode local pour prévisualiser sans Supabase

```bash
cd ulis-tablette-mvp
python3 -m http.server 8000
```

Ouvrir `http://localhost:8000/enseignant.html` et `http://localhost:8000/index.html`. Tant que `config.js` n'est pas renseigné, les deux pages sont des démonstrations **non synchronisées**. Les modifications de l'enseignant restent uniquement dans le stockage du navigateur. Ne pas confondre ce mode avec la mise en production.

## 5. Règles de fonctionnement

- **Brouillon** : conservé dans Supabase, lisible par le ou les enseignants inscrits dans `teacher_accounts`, invisible aux élèves et aux visiteurs.
- **Publié** : accessible à tous les visiteurs de l'application élève, **même sans compte**. Cela convient uniquement aux supports pédagogiques non sensibles et publiables.
- **Édition et suppression** : réservées aux comptes enseignants autorisés. La suppression ou la dépublication déclenche une notification de révision, sans exposer les contenus privés.
- **Sauvegarde JSON** : copie de secours. Son import dans la base **ajoute des fiches en brouillon**, sans supprimer les contenus existants. Conserver le fichier de sauvegarde de façon appropriée.
- **Données locales des élèves** : niveau sélectionné, favoris, préférences de lecture et dernier catalogue publié reçu. Aucune donnée nominative dans la base.
- **Hors connexion** : les tablettes conservent le dernier catalogue publié récupéré ; elles ne reçoivent pas les modifications avant reconnexion. Les images/PDF distants ne sont pas garantis hors ligne.
- **Rôle du site** : ne pas stocker ni diffuser de PPS, diagnostics, bilans, photos d'élèves ou données identifiantes. Pour de futurs parcours par élève, une architecture d'identification et de protection adaptée devra être conçue séparément.

## 6. Limitations et points à vérifier avant un usage réel

- L'accès HTTPS et une connexion Internet sont nécessaires pour la publication et les mises à jour en temps réel.
- Les liens vers des PDF/images doivent pointer vers des ressources accessibles et légalement diffusables ; l'éditeur ne téléverse pas encore des fichiers sur le serveur.
- Une fiche déjà chargée hors ligne peut rester visible sur une tablette déconnectée même si elle a été dépubliée ailleurs. Ne publier **aucun contenu confidentiel**.
- Cette version est destinée à un petit nombre de professeurs ; la modification simultanée de la même fiche par deux enseignants n'utilise pas encore de verrouillage de version.
- Il faut tester les connexions et les règles RLS depuis des navigateurs séparés avant toute distribution. Un simple succès de test local ne prouve pas le bon déploiement Supabase.
- Validation institutionnelle, RGPD, politique d'hébergement et droits des supports : à vérifier avec l'établissement avant diffusion.

## Principaux fichiers

| Fichier | Fonction |
|---|---|
| `config.js` | URL et clé **publique** du projet Supabase |
| `schema_supabase.sql` | Schéma SQL, autorisations serveur et notifications |
| `cloud.js` | Fonctions d'authentification, lecture et écriture en base, abonnement temps réel |
| `enseignant.html` / `enseignant.js` | Interface enseignant |
| `index.html` / `app.js` | Application élève |
| `content.js` | Fiches d'exemple utilisées **uniquement sans connexion Supabase** |
| `service-worker.js` | Mise en cache des fichiers statiques |
