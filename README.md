# ValléeMapper

Planifiez vos trajets dans le **Pays du Mont-Blanc**, à Passy, Sallanches, Saint-Gervais, Chamonix et dans les communes voisines. Combinez le bus, le train, la marche et le vélo.

**[Ouvrir ValléeMapper](https://valleemapper.mathieu-3e7.workers.dev)**

![Itinéraire de la gare du Fayet à Saint-Gervais par le Valléen dans ValléeMapper](docs/screenshots/journey.jpg)

## Préparer un trajet

- Saisissez une adresse, un arrêt ou une gare, ou choisissez **Ma position**. Vos derniers trajets restent proposés sur cet appareil. L’heure est réglée sur **Maintenant** ; choisissez **Arriver** pour donner une heure d’arrivée. Touchez **Modifier** sous l’horaire pour comparer les trajets selon l’heure, la durée la plus courte ou le temps de marche.
- Le trajet en tête de liste s’affiche sur la carte. Touchez un trajet pour le voir et ouvrir ses étapes, puis touchez-le de nouveau pour le refermer. La recherche reste rappelée en haut des résultats, avec **Modifier** pour revenir au formulaire. Un service qui part toutes les minutes, comme le Valléen, tient sur une seule carte.
- **Plus tôt** et **Plus tard** chargent d’autres départs. Les trajets du lendemain portent la mention **Demain**. Les retards, suppressions et perturbations annoncés par les exploitants apparaissent sur les trajets et les tableaux de départs. Les étapes à pied et à vélo détaillent les rues à suivre. L’adresse de la page reprend la recherche et le lieu sélectionné : partagez-la pour envoyer le même trajet.
- Consultez les horaires des Cars Région, des trains SNCF, des bus de Chamonix et de Facilibus. Le Valléen et l’ascenseur des Thermes peuvent aussi faire partie d’un trajet.
- Choisissez **Mon vélo électrique**, **Mon vélo** ou **MontenVélo** (par défaut). Les durées à pied et à vélo tiennent compte du dénivelé, avec ou sans assistance électrique, et chaque trajet à vélo qui monte d’au moins 30 m montre son profil d’altitude. Les trajets MontenVélo indiquent où prendre et rendre le vélo. Vérifiez la disponibilité des vélos et des places de retour avant de partir.

## Explorer la carte

La carte affiche les arrêts, les gares, les stations MontenVélo et les liaisons verticales. Le bouton **Couches** permet d’ajouter les stations Citiz, les arrêts Rézo Pouce, les points de prise en charge Montenbus et les arrêts de navettes saisonnières. Touchez un point pour voir ses informations ou l’utiliser comme départ ou arrivée. Quand un trajet est affiché, ses arrêts et ses stations restent en couleur et les autres points s’estompent. Sur téléphone, toucher la carte quand le panneau est levé le baisse ; une fois le panneau baissé, touchez un point pour l’ouvrir. Sur téléphone, le panneau des trajets se glisse au-dessus de la carte. Les arrêts de bus et les gares affichent les trois prochains départs et indiquent les horaires actualisés en temps réel. Les arrêts proches indiquent leur direction, pour distinguer les deux côtés d’une route. Le bouton **Me localiser** vous situe sur la carte après autorisation du navigateur.

## Horaires et tarifs

ValléeMapper est un prototype. Le label **Temps réel** apparaît sur les segments dont l’horaire a été actualisé. Les horaires de passage du Valléen et de l’ascenseur des Thermes sont estimés. Les tarifs sont indicatifs, et les trajets concernés signalent les réservations obligatoires. La carte fournit les liens vers les opérateurs pour les services comme Montenbus et Citiz. Les recherches d’adresse utilisent le service de l’IGN et la Base Adresse Nationale.

## En savoir plus

- [Sources des données et licences](docs/research/passy-transport-data.md)
- [Infos sur les navettes, les remontées et les tarifs](docs/research/shuttles-lifts-fares.md)
- [Développement et déploiement](docs/development.md)
- [Signaler un problème ou une donnée manquante](https://github.com/mathieudutour/valleemapper/issues/new)

Fond de carte OpenFreeMap et OpenMapTiles. [Données cartographiques © les contributeurs OpenStreetMap (ODbL)](https://www.openstreetmap.org/copyright).
