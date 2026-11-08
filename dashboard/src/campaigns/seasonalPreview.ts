import type { CampaignSeason } from './assetCatalog';
// Immediate, curated image-matching previews; never labeled as a live AI response.
const previews: Record<string, Record<CampaignSeason,string>> = {
 de: {
  winter:'Erst die Berge, dann Zeit füreinander: So könnte deine Winterauszeit in Paznaun-Ischgl aussehen. Mit wem würdest du diesen Hüttenmoment teilen? ☕🏔️',
  spring:'Rucksack auf, Alltag aus: Gemeinsam die Frühlingslandschaft von Paznaun-Ischgl entdecken und unterwegs Zeit füreinander finden. Wer wäre bei dieser Bergpause dabei? 🏔️',
  summer:'Die schönste Wanderpause? Zusammen am Bergsee sitzen, Geschichten teilen und die Berge auf sich wirken lassen. Mit wem planst du deine Sommerauszeit in Paznaun-Ischgl? 🏔️',
  autumn:'Goldene Herbstfarben, ein Becher in der Hand und die Lieblingsmenschen am Tisch: So könnte deine Bergpause in Paznaun-Ischgl aussehen. Mit wem würdest du sie teilen? ☕',
 },
 nl: {
  winter:'Eerst de bergen, dan tijd voor elkaar. Een mok in je handen en vrienden om je heen: zo kan jouw winterpauze in Paznaun-Ischgl eruitzien. Wie neem jij mee? ☕🏔️',
  spring:'Rugzak op, dagelijkse drukte uit. Ontdek samen het lentelandschap van Paznaun-Ischgl en neem onderweg tijd voor elkaar. Met wie zou jij deze bergpauze delen? 🏔️',
  summer:'De mooiste wandelpauze? Samen aan een bergmeer zitten, verhalen delen en de bergen in je opnemen. Met wie plan jij een zomerse uitstap naar Paznaun-Ischgl? 🏔️',
  autumn:'Gouden herfstkleuren, een mok in je handen en vrienden aan tafel: zo kan een bergpauze in Paznaun-Ischgl eruitzien. Met wie zou jij dit moment delen? ☕',
 },
 fr: {
  winter:'D’abord les montagnes, puis du temps ensemble. Une tasse à la main, des amis autour de soi : imaginez votre pause hivernale à Paznaun-Ischgl. Avec qui la partageriez-vous ? ☕',
  spring:'Le sac sur le dos, le quotidien en pause. Découvrez ensemble les paysages de printemps de Paznaun-Ischgl et prenez le temps de vous retrouver. Qui vous accompagne ? 🏔️',
  summer:'La plus belle pause en randonnée ? S’asseoir ensemble près d’un lac de montagne et partager des histoires. Avec qui imaginez-vous une escapade estivale à Paznaun-Ischgl ? 🏔️',
  autumn:'Des couleurs d’automne, une tasse à la main et des amis autour de la table : imaginez votre pause en montagne à Paznaun-Ischgl. Avec qui partageriez-vous ce moment ? ☕',
 },
};
export function seasonalPreview(language:string, season:CampaignSeason):string {
  return (previews[language] || previews.de)[season];
}
