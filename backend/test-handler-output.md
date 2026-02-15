=== CHAT4LEAD — TEST MESSAGE HANDLER ===

Health: ok | DB: connected | Redis: connected

Conversation ID: 0774fb79-85cc-4fcf-8226-7e9e9fe33156


══════════ Message 1 ══════════
>>> USER: Bonjour, je souhaite déménager
<<< TOM (7094ms):
Je me présente, je suis Tom de Déménagements Test Paris. Je suis là pour vous accompagner dans votre projet de déménagement et vous proposer la meilleure solution adaptée à vos besoins. 😊

Pour commencer, pourrait-vous me dire où vous vous trouvez actuellement et où vous souhaitez déménager ? Quelles sont les villes de départ et d'arrivée ?

📊 Score: 10
🎯 Actions: []
🔍 Entités: {}

══════════ Message 2 ══════════
>>> USER: De Paris vers Versailles
<<< TOM (822ms):
C'est noté ! Vous souhaitez donc déménager de Paris à Versailles. C'est un déménagement relativement proche, ce qui facilitera les choses.

Pouvez-vous me dire un peu plus sur le type de logement que vous occupez actuellement à Paris et celui que vous allez occuper à Versailles ? Est-ce un appartement, une maison, et à quel étage se trouvent-ils ?

📊 Score: 10
🎯 Actions: []
🔍 Entités: {}

══════════ Message 3 ══════════
>>> USER: Un appartement F3 de 70m² au 3ème étage sans ascenseur
<<< TOM (1083ms):
C'est noté ! Vous habitez donc un F3 de 70m² au 3ème étage sans ascenseur à Paris, et vous allez déménager à Versailles. Le fait qu'il n'y ait pas d'ascenseur au 3ème étage implique que nous devrons prendre des précautions pour transporter vos affaires de manière sécurisée.

Pour mieux estimer le volume de vos affaires, pouvez-vous me dire si vous avez des objets encombrants, tels que des meubles de grande taille, des pianos, ou des quantités importantes de cartons ou de bagages ?

📊 Score: 25
🎯 Actions: []
🔍 Entités: {"surface":70,"nbPieces":3,"etage":3,"ascenseur":false}

══════════ Message 4 ══════════
>>> USER: Je pensais à la formule Standard
<<< TOM (1116ms):
La formule Standard est une excellente choix pour un déménagement comme le vôtre. Elle inclut le chargement, le transport, le déchargement, ainsi que l'emballage de vos objets fragiles et le démontage/remontage de vos meubles.

Étant donné que vous habitez un F3 de 70m², je dirais que le volume de vos affaires est probablement autour de 35-40m³. Cela nous permettra de mieux planifier le déménagement et de vous donner une estimation plus précise.

Pouvez-vous me confirmer si cela vous semble raisonnable, ou si vous pensez que le volume de vos affaires pourrait être plus important ?

📊 Score: 30
🎯 Actions: []
🔍 Entités: {"formule":"STANDARD"}

══════════ Message 5 ══════════
>>> USER: Je suis Sophie Martin, mon email est sophie@test.fr et mon numéro est le 06 12 34 56 78
<<< TOM (13113ms):
Merci beaucoup, Sophie ! Je vous remercie de me fournir ces informations. Je vais donc récapituler :

* Vous êtes Sophie Martin
* Vous déménagez de Paris à Versailles
* Vous habitez un F3 de 70m² au 3ème étage sans ascenseur
* Vous avez choisi la formule Standard
* Votre email est sophie@test.fr
* Votre numéro de téléphone est le 06 12 34 56 78

Je vais maintenant vous préparer un récapitulatif de votre projet de déménagement. Notre expert va vous contacter sous peu pour confirmer les détails et vous donner une estimation définitive.

Voici votre récapitulatif :

📋 **VOTRE PROJET DE DÉMÉNAGEMENT**

👤 **Client** : Sophie Martin
📍 **Parcours** : Paris ➡️ Versailles
📦 **Volume** : 35-40 m³
🏗️ **Accès** : 3ème étage sans ascenseur
🛠️ **Prestation** : Formule Standard

💰 **ESTIMATION** : Nous allons vous fournir une estimation définitive sous peu.

**Prochaine étape** : Notre expert va vous appeler demain pour confirmer ces chiffres et bloquer votre date.

Merci de votre confiance, Sophie ! Nous allons nous assurer que votre déménagement se déroule sans encombre. 😊

📊 Score: 50
🎯 Actions: ["crm_push_queued"]
🔍 Entités: {"email":"sophie@test.fr","telephone":"0612345678","etage":3,"ascenseur":false,"formule":"STANDARD","prenom":"Sophie","nom":"Martin"}


=== TEST TERMINÉ ===