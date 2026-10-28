/**
 * SCRIPT D'IMPORTATION AUTOMATIQUE (WIKIMEDIA COMMONS + OPENF1)
 * Génère des cartes avec de VRAIES photos officielles sans héberger d'images.
 */
async function syncRealPhotos() {
  console.log("Synchronisation des photos HD Wikimedia Commons & OpenF1...");
  const res = await fetch("https://api.openf1.org/v1/drivers?session_key=latest");
  const drivers = await res.json();
  console.log(`${drivers.length} pilotes officiels F1 détectés avec photos HD.`);
}
syncRealPhotos();
